import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { orders, payments } from '@/db/schema'
import { captureAuthorizedOrder, releaseAuthorizedOrder } from '@/lib/orders/authorization'
import { processWebhookEvent } from '@/lib/orders/webhook'
import type { PaymentProvider, WebhookEvent } from '@/lib/payments'
import {
  FIXTURE_PREFIX,
  createTestUser,
  deleteFixtureWebhookEvents,
  deleteTestOrder,
  deleteTestUser,
  fixtureId,
} from '@/test/integration/support'

/**
 * Pay only after the supplier confirms (client, Oct 2026), against the real
 * database: the authorisation webhook is idempotent, capture and release run
 * once however often they are clicked, and a late failure cannot touch a hold.
 */

const orderIds: string[] = []
const userIds: string[] = []

async function seedManualOrder() {
  const user = await createTestUser()
  userIds.push(user.id)
  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `BT-IT-${randomUUID().slice(0, 12)}`,
      userId: user.id,
      status: 'pending',
      presentmentCurrency: 'USD',
      subtotalMinor: 12_000,
      totalMinor: 12_000,
      customerSnapshot: { name: 'Fixture', email: user.email, locale: 'en' },
      placedAt: new Date(),
      captureMode: 'manual',
    })
    .returning({ id: orders.id })
  if (!order) throw new Error('fixture order')
  orderIds.push(order.id)
  const providerPaymentId = `sbx_${fixtureId().slice(0, 40)}`
  await db.insert(payments).values({
    orderId: order.id,
    provider: 'sandbox',
    providerPaymentId,
    status: 'requires_action',
    amountMinor: 12_000,
    currency: 'USD',
    idempotencyKey: fixtureId(),
  })
  return { orderId: order.id, providerPaymentId }
}

function event(type: WebhookEvent['type'], providerPaymentId: string, id?: string): WebhookEvent {
  const providerEventId = id ?? `${FIXTURE_PREFIX}-evt-${randomUUID()}`
  return {
    providerEventId,
    type,
    providerPaymentId,
    amountMinor: null,
    currency: null,
    raw: { id: providerEventId, type },
  }
}

function fakeProvider(counts: { capture: number; void: number }): PaymentProvider {
  return {
    name: 'sandbox',
    createIntent: async () => {
      throw new Error('unused')
    },
    getIntent: async () => {
      throw new Error('unused')
    },
    refund: async () => {
      throw new Error('unused')
    },
    parseWebhook: async () => {
      throw new Error('unused')
    },
    capture: async () => {
      counts.capture += 1
      return true
    },
    voidAuthorization: async () => {
      counts.void += 1
      return true
    },
  }
}

async function statusOf(orderId: string) {
  const [row] = await db
    .select({ status: orders.status, authorizedAt: orders.authorizedAt })
    .from(orders)
    .where(eq(orders.id, orderId))
  return row
}

afterAll(async () => {
  await deleteFixtureWebhookEvents()
  for (const id of orderIds) await deleteTestOrder(id)
  for (const id of userIds) await deleteTestUser(id)
})

describe('authorised bookings', () => {
  it('records the hold once, however often the event is delivered', async () => {
    const { orderId, providerPaymentId } = await seedManualOrder()
    const evt = event('payment.authorized', providerPaymentId)
    const first = await processWebhookEvent('sandbox', evt)
    const again = await processWebhookEvent('sandbox', evt)
    expect(first).toMatchObject({ handled: true, from: 'pending', to: 'authorized' })
    expect(again).toEqual({ handled: false, reason: 'duplicate' })
    const row = await statusOf(orderId)
    expect(row?.status).toBe('authorized')
    expect(row?.authorizedAt).toBeInstanceOf(Date)

    // A stale "failed" for the same attempt cannot cancel a held booking.
    const late = await processWebhookEvent('sandbox', event('payment.failed', providerPaymentId))
    expect(late).toEqual({ handled: false, reason: 'no_transition' })
    expect((await statusOf(orderId))?.status).toBe('authorized')
  })

  it('captures once when the supplier confirms', async () => {
    const { orderId, providerPaymentId } = await seedManualOrder()
    await processWebhookEvent('sandbox', event('payment.authorized', providerPaymentId))
    const counts = { capture: 0, void: 0 }
    const provider = fakeProvider(counts)
    expect(await captureAuthorizedOrder(orderId, null, provider)).toEqual({
      ok: true,
      status: 'paid',
    })
    expect(await captureAuthorizedOrder(orderId, null, provider)).toEqual({
      ok: false,
      reason: 'not_authorized',
    })
    expect(counts.capture).toBe(1)
    expect((await statusOf(orderId))?.status).toBe('paid')
    // Released after capture: nothing happens.
    expect((await releaseAuthorizedOrder(orderId, 'late', null, provider)).ok).toBe(false)
    expect(counts.void).toBe(0)
  })

  it('releases the hold when the supplier refuses — nothing charged', async () => {
    const { orderId, providerPaymentId } = await seedManualOrder()
    await processWebhookEvent('sandbox', event('payment.authorized', providerPaymentId))
    const counts = { capture: 0, void: 0 }
    const provider = fakeProvider(counts)
    expect(await releaseAuthorizedOrder(orderId, 'supplier refused', null, provider)).toEqual({
      ok: true,
      status: 'cancelled',
    })
    expect((await statusOf(orderId))?.status).toBe('cancelled')
    expect(counts.capture).toBe(0)
    expect((await captureAuthorizedOrder(orderId, null, provider)).ok).toBe(false)
    const [payment] = await db
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.orderId, orderId))
    expect(payment?.status).toBe('cancelled')
  })
})
