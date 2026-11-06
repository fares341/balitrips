import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { resolveScheduleDocument } from '@/app/[locale]/account/_lib/queries'
import { db } from '@/db'
import { downloadTokens, itineraries, itineraryDeliveries, orderItems, orders } from '@/db/schema'
import { __setEmailTransport, type EmailMessage, type EmailTransport } from '@/lib/email'
import {
  createTestUser,
  deleteTestOrder,
  deleteTestUser,
  type TestUser,
} from '@/test/integration/support'

import {
  MAX_EMAIL_ATTEMPTS,
  loadDeliveryState,
  queueItineraryDelivery,
  resendItineraryDelivery,
  runItineraryDelivery,
  type DeliverySender,
} from './delivery'
import {
  hashDownloadToken,
  issueDownloadToken,
  newDownloadToken,
  redeemDownloadToken,
} from './download-tokens'

/**
 * Phase 4 delivery on a real database: idempotency (no double send),
 * failure handling, download-token expiry / forgery / revocation, access
 * control. Mail goes to an in-memory transport; nothing leaves the machine.
 */

const orderIds: string[] = []
const userIds: string[] = []
const itineraryIds: string[] = []

class MemoryTransport implements EmailTransport {
  readonly name = 'memory'
  sent: EmailMessage[] = []
  constructor(private fail = false) {}
  async send(message: EmailMessage) {
    if (this.fail) return { id: null, delivered: false, error: 'provider down' }
    this.sent.push(message)
    return { id: `m${this.sent.length}`, delivered: true }
  }
}

function fakeSender() {
  const jobs: { data: unknown; key: string }[] = []
  const sender: DeliverySender = {
    async send(data, options) {
      if (jobs.some((job) => job.key === options.singletonKey)) return null
      jobs.push({ data, key: options.singletonKey })
      return randomUUID()
    },
  }
  return { jobs, sender }
}

async function seed(status = 'paid'): Promise<{ user: TestUser; orderId: string; itemId: string }> {
  const user = await createTestUser()
  userIds.push(user.id)
  const [itinerary] = await db
    .insert(itineraries)
    .values({
      slug: `it-dlv-${randomUUID().slice(0, 8)}`,
      name: { en: 'Five days', ar: 'خمسة أيام', id: 'Lima hari' },
      days: 5,
      priceMinor: 9900,
      currency: 'SAR',
      uploadedPdfKeys: { ar: 'it/fixture.pdf', en: 'it/fixture.pdf' },
    })
    .returning({ id: itineraries.id })
  if (!itinerary) throw new Error('itinerary')
  itineraryIds.push(itinerary.id)
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `BT-DLV-${randomUUID().slice(0, 10)}`,
      userId: user.id,
      status,
      presentmentCurrency: 'SAR',
      subtotalMinor: 9900,
      totalMinor: 9900,
      customerSnapshot: { name: 'Fixture Buyer', email: user.email, locale: 'ar' },
      placedAt: new Date(),
    })
    .returning({ id: orders.id })
  if (!order) throw new Error('order')
  orderIds.push(order.id)
  const [item] = await db
    .insert(orderItems)
    .values({
      orderId: order.id,
      kind: 'itinerary',
      refId: itinerary.id,
      nameSnapshot: { en: 'Five days', ar: 'خمسة أيام', id: 'Lima hari' },
      unitPriceMinor: 9900,
      quantity: 1,
      lineTotalMinor: 9900,
    })
    .returning({ id: orderItems.id })
  if (!item) throw new Error('item')
  return { user, orderId: order.id, itemId: item.id }
}

afterEach(() => __setEmailTransport(null))

afterAll(async () => {
  for (const id of orderIds) await deleteTestOrder(id)
  for (const id of userIds) await deleteTestUser(id)
  for (const id of itineraryIds) await db.delete(itineraries).where(eq(itineraries.id, id))
})

describe('itinerary delivery — idempotency', () => {
  it('queues one delivery per line however many times the paid step runs', async () => {
    const { orderId, itemId } = await seed()
    const { jobs, sender } = fakeSender()
    // Webhook, replayed webhook, reconcile sweep, Studio «mark as paid».
    for (let i = 0; i < 4; i += 1) {
      await db.transaction((tx) => queueItineraryDelivery(tx, orderId, sender))
    }
    expect(jobs).toHaveLength(1)
    const rows = await db
      .select()
      .from(itineraryDeliveries)
      .where(eq(itineraryDeliveries.orderItemId, itemId))
    expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'whatsapp'])
  })

  it('sends the e-mail once even when the job runs twice', async () => {
    const { orderId, itemId } = await seed()
    const { sender } = fakeSender()
    await db.transaction((tx) => queueItineraryDelivery(tx, orderId, sender))
    const mail = new MemoryTransport()
    __setEmailTransport(mail)

    await runItineraryDelivery({ orderItemId: itemId, round: 0 })
    await runItineraryDelivery({ orderItemId: itemId, round: 0 })
    await Promise.all([
      runItineraryDelivery({ orderItemId: itemId, round: 0 }),
      runItineraryDelivery({ orderItemId: itemId, round: 0 }),
    ])

    expect(mail.sent).toHaveLength(1)
    const [message] = mail.sent
    expect(message?.subject).toContain('جدولك جاهز')
    expect(message?.html).toMatch(/\/ar\/dl\/[A-Za-z0-9_-]{43}/)
    expect(message?.html).toContain(`/ar/account/schedules/${itemId}/view`)

    const state = (await loadDeliveryState([itemId])).get(itemId)
    expect(state?.email.status).toBe('sent')
    // WhatsApp is off in a fresh database: skipped with the reason, not silently lost.
    expect(state?.whatsapp.status).toBe('skipped')
    expect(state?.whatsapp.error).toBe('not_configured')
  })

  it('does not deliver an unpaid order', async () => {
    const { itemId } = await seed('pending')
    await db.insert(itineraryDeliveries).values({ orderItemId: itemId, channel: 'email' })
    const mail = new MemoryTransport()
    __setEmailTransport(mail)
    await runItineraryDelivery({ orderItemId: itemId, round: 0 })
    expect(mail.sent).toHaveLength(0)
    expect((await loadDeliveryState([itemId])).get(itemId)?.email.status).toBe('skipped')
  })
})

describe('itinerary delivery — failure handling', () => {
  it('retries a failed send and marks it failed after the last attempt', async () => {
    const { orderId, itemId } = await seed()
    const { sender } = fakeSender()
    await db.transaction((tx) => queueItineraryDelivery(tx, orderId, sender))
    __setEmailTransport(new MemoryTransport(true))

    for (let attempt = 1; attempt < MAX_EMAIL_ATTEMPTS; attempt += 1) {
      await expect(runItineraryDelivery({ orderItemId: itemId, round: 0 })).rejects.toThrow(
        /will retry/,
      )
      expect((await loadDeliveryState([itemId])).get(itemId)?.email.status).toBe('queued')
    }
    await runItineraryDelivery({ orderItemId: itemId, round: 0 })
    const state = (await loadDeliveryState([itemId])).get(itemId)
    expect(state?.email.status).toBe('failed')
    expect(state?.email.error).toBe('provider down')
  })

  it('a resend after a failure queues a new round and delivers it', async () => {
    const { orderId, itemId } = await seed()
    const { jobs, sender } = fakeSender()
    await db.transaction((tx) => queueItineraryDelivery(tx, orderId, sender))
    const mail = new MemoryTransport()
    __setEmailTransport(mail)
    await runItineraryDelivery({ orderItemId: itemId, round: 0 })

    expect(await resendItineraryDelivery(itemId, ['email'], null, sender)).toBe('queued')
    expect(jobs.map((job) => job.key)).toEqual([
      `itinerary_delivery:${itemId}:0`,
      `itinerary_delivery:${itemId}:1`,
    ])
    // The stale round-0 job does nothing; round 1 sends.
    await runItineraryDelivery({ orderItemId: itemId, round: 0 })
    await runItineraryDelivery({ orderItemId: itemId, round: 1 })
    expect(mail.sent).toHaveLength(2)
    // Only the newest link works.
    const live = await db
      .select()
      .from(downloadTokens)
      .where(eq(downloadTokens.orderItemId, itemId))
    expect(live.filter((row) => row.revokedAt === null)).toHaveLength(1)
  })

  it('refuses to resend a refunded line', async () => {
    const { itemId } = await seed('refunded')
    expect(await resendItineraryDelivery(itemId, ['email', 'whatsapp'], null)).toBe(
      'not_deliverable',
    )
  })
})

describe('download tokens', () => {
  it('works for its use limit, then refuses', async () => {
    const { itemId } = await seed()
    const { token } = await issueDownloadToken(itemId, { validDays: 7, maxUses: 3 })
    const results = await Promise.all(Array.from({ length: 6 }, () => redeemDownloadToken(token)))
    expect(results.filter((r) => r.ok)).toHaveLength(3)
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: 'used_up' })
  })

  it('expires', async () => {
    const { itemId } = await seed()
    const issuedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    const { token } = await issueDownloadToken(itemId, { validDays: 7, maxUses: 5 }, issuedAt)
    expect(await redeemDownloadToken(token)).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects forged and malformed tokens', async () => {
    expect(await redeemDownloadToken(newDownloadToken())).toEqual({
      ok: false,
      reason: 'unknown',
    })
    expect(await redeemDownloadToken('../../etc/passwd')).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('a new link revokes the previous one', async () => {
    const { itemId } = await seed()
    const first = await issueDownloadToken(itemId, { validDays: 7, maxUses: 5 })
    const second = await issueDownloadToken(itemId, { validDays: 7, maxUses: 5 })
    expect(await redeemDownloadToken(first.token)).toEqual({ ok: false, reason: 'revoked' })
    expect((await redeemDownloadToken(second.token)).ok).toBe(true)
  })

  it('stores only a keyed hash', async () => {
    const { itemId } = await seed()
    const { token } = await issueDownloadToken(itemId, { validDays: 7, maxUses: 5 })
    const [row] = await db
      .select()
      .from(downloadTokens)
      .where(
        and(
          eq(downloadTokens.orderItemId, itemId),
          eq(downloadTokens.tokenHash, hashDownloadToken(token)),
        ),
      )
    expect(row).toBeDefined()
    expect(JSON.stringify(row)).not.toContain(token)
  })
})

describe('access control', () => {
  it('only the buyer resolves the document from the account; nobody after a refund', async () => {
    const { user, orderId, itemId } = await seed()
    const stranger = await createTestUser()
    userIds.push(stranger.id)
    expect(await resolveScheduleDocument(stranger.id, itemId, 'ar')).toBeNull()
    expect(await resolveScheduleDocument(user.id, itemId, 'ar')).not.toBeNull()
    await db.update(orders).set({ status: 'refunded' }).where(eq(orders.id, orderId))
    expect(await resolveScheduleDocument(user.id, itemId, 'ar')).toBeNull()
    // The token path (userId null) applies the same paid / not-refunded rule.
    expect(await resolveScheduleDocument(null, itemId, 'ar')).toBeNull()
  })
})
