import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { orders, payments, webhookEvents } from '@/db/schema'
import { processWebhookEvent } from '@/lib/orders/webhook'
import type { WebhookEvent } from '@/lib/payments'
import {
  FIXTURE_PREFIX,
  createTestUser,
  deleteFixtureWebhookEvents,
  deleteTestOrder,
  deleteTestUser,
  fixtureId,
} from '@/test/integration/support'

/**
 * Webhook delivery, against the real unique index.
 *
 * Every guarantee in `processWebhookEvent` is a database guarantee. "Replay
 * is a no-op" is `webhook_event_unique` refusing the second insert; "two
 * events for one order serialise" is `SELECT ... FOR UPDATE`. A unit test
 * with a fake database can only assert that the code *asks* for those things.
 * Whether it gets them is what this file checks.
 *
 * The three deliveries that actually happen in production, in order of how
 * often they bite:
 *
 *  1. The same event twice — providers retry until they see a 2xx, and they
 *     routinely see one late. Charging or granting twice is the failure.
 *  2. Events out of order — a `failed` that was generated before the
 *     successful retry arrives after it. Regressing a paid order is the
 *     failure, and it is the expensive one: the customer has been charged,
 *     the van is released, and nobody finds out until the day of travel.
 *  3. Events we do not model — a provider adds an event type. Moving state on
 *     an event nobody has read is the failure.
 */

/**
 * Accumulated across the whole file, never reset between tests — resetting
 * them would leave every fixture but the last one behind, and a suite that
 * silently grows the database is not re-runnable.
 */
const orderIds: string[] = []
const userIds: string[] = []

/** An order sitting in `pending` with an unsettled payment against it. */
async function seedPendingOrder(totalMinor = 25_000): Promise<{
  orderId: string
  userId: string
  providerPaymentId: string
}> {
  const user = await createTestUser()
  userIds.push(user.id)

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `BT-IT-${randomUUID().slice(0, 12)}`,
      userId: user.id,
      status: 'pending',
      presentmentCurrency: 'USD',
      subtotalMinor: totalMinor,
      totalMinor,
      customerSnapshot: { name: 'Fixture', email: user.email, locale: 'en' },
      placedAt: new Date(),
    })
    .returning({ id: orders.id })

  if (!order) throw new Error('Could not create the fixture order')
  orderIds.push(order.id)

  const providerPaymentId = `sbx_${fixtureId().slice(0, 40)}`
  await db.insert(payments).values({
    orderId: order.id,
    provider: 'sandbox',
    providerPaymentId,
    status: 'requires_action',
    amountMinor: totalMinor,
    currency: 'USD',
    idempotencyKey: fixtureId(),
  })

  return { orderId: order.id, userId: user.id, providerPaymentId }
}

function event(
  type: WebhookEvent['type'],
  providerPaymentId: string | null,
  providerEventId = `${FIXTURE_PREFIX}-evt-${randomUUID()}`,
): WebhookEvent {
  return {
    providerEventId,
    type,
    providerPaymentId,
    amountMinor: null,
    currency: null,
    raw: { id: providerEventId, type, paymentId: providerPaymentId },
  }
}

async function readOrder(orderId: string): Promise<{ status: string; updatedAt: Date }> {
  const [row] = await db
    .select({ status: orders.status, updatedAt: orders.updatedAt })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  if (!row) throw new Error('Order vanished')
  return row
}

async function readWebhookRows(providerEventId: string) {
  return db.select().from(webhookEvents).where(eq(webhookEvents.providerEventId, providerEventId))
}

afterAll(async () => {
  await deleteFixtureWebhookEvents()
  for (const id of orderIds) await deleteTestOrder(id)
  for (const id of userIds) await deleteTestUser(id)
})

describe('replayed delivery', () => {
  it('applies the same event exactly once', async () => {
    const { orderId, providerPaymentId } = await seedPendingOrder()
    const succeeded = event('payment.succeeded', providerPaymentId)

    const first = await processWebhookEvent('sandbox', succeeded)
    expect(first).toEqual({ handled: true, orderId, from: 'pending', to: 'paid' })

    const afterFirst = await readOrder(orderId)
    expect(afterFirst.status).toBe('paid')

    // The provider retries because it did not see the 200 in time. Byte-for-
    // byte the same event.
    const second = await processWebhookEvent('sandbox', succeeded)
    expect(second).toEqual({ handled: false, reason: 'duplicate' })

    const afterSecond = await readOrder(orderId)
    expect(afterSecond.status).toBe('paid')
    // No second write happened at all — `updated_at` is untouched. This is
    // the difference between "ended up in the same state" and "was only
    // applied once", and only the second is idempotency.
    expect(afterSecond.updatedAt.getTime()).toBe(afterFirst.updatedAt.getTime())

    const rows = await readWebhookRows(succeeded.providerEventId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.processedAt).not.toBeNull()

    const [payment] = await db
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.providerPaymentId, providerPaymentId))
    expect(payment?.status).toBe('succeeded')
  })

  it('claims the event once even when both copies arrive simultaneously', async () => {
    const { orderId, providerPaymentId } = await seedPendingOrder()
    const succeeded = event('payment.succeeded', providerPaymentId)

    // Two of the provider's workers delivering the same retry. Without the
    // unique index both would read `pending` and both would apply.
    const [a, b] = await Promise.all([
      processWebhookEvent('sandbox', succeeded),
      processWebhookEvent('sandbox', succeeded),
    ])

    const outcomes = [a, b]
    expect(outcomes.filter((outcome) => outcome.handled)).toHaveLength(1)
    expect(outcomes.filter((outcome) => !outcome.handled)).toHaveLength(1)
    expect(outcomes.find((outcome) => !outcome.handled)).toEqual({
      handled: false,
      reason: 'duplicate',
    })

    expect((await readOrder(orderId)).status).toBe('paid')
    expect(await readWebhookRows(succeeded.providerEventId)).toHaveLength(1)
  })
})

describe('out-of-order delivery', () => {
  it('does not regress a paid order when a stale "failed" arrives afterwards', async () => {
    const { orderId, providerPaymentId } = await seedPendingOrder()

    await processWebhookEvent('sandbox', event('payment.succeeded', providerPaymentId))
    expect((await readOrder(orderId)).status).toBe('paid')

    // A distinct event, generated before the successful retry and delivered
    // after it. The money has arrived; this event is stale news about an
    // attempt that was superseded.
    const outcome = await processWebhookEvent('sandbox', event('payment.failed', providerPaymentId))

    // The order must still be paid. Cancelling it here releases the vehicle,
    // revokes the customer's access and leaves a settled charge attached to a
    // cancelled booking — discovered, at the earliest, on the day of travel.
    expect((await readOrder(orderId)).status).toBe('paid')
    expect(outcome).toEqual({ handled: false, reason: 'no_transition' })

    const [payment] = await db
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.providerPaymentId, providerPaymentId))
    expect(payment?.status).toBe('succeeded')
  })

  it('records the stale event even though it is not applied', async () => {
    // The sequence has to stay auditable: "why is this order paid when the
    // provider sent a failure" is answered from this table.
    const { providerPaymentId } = await seedPendingOrder()
    await processWebhookEvent('sandbox', event('payment.succeeded', providerPaymentId))

    const stale = event('payment.failed', providerPaymentId)
    await processWebhookEvent('sandbox', stale)

    const rows = await readWebhookRows(stale.providerEventId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.eventType).toBe('payment.failed')
    expect(rows[0]?.processedAt).not.toBeNull()
  })
})

describe('events that imply nothing', () => {
  it('ignores an event type the system does not model', async () => {
    const { orderId, providerPaymentId } = await seedPendingOrder()
    const before = await readOrder(orderId)

    const unknown = event('unknown', providerPaymentId)
    const outcome = await processWebhookEvent('sandbox', unknown)

    expect(outcome).toEqual({ handled: false, reason: 'ignored' })

    const after = await readOrder(orderId)
    expect(after.status).toBe('pending')
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime())

    // Recorded, not applied: a provider that starts sending a new event type
    // should show up in this table rather than vanish.
    const rows = await readWebhookRows(unknown.providerEventId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.processedAt).not.toBeNull()
  })

  it('ignores an event naming a payment that is not ours', async () => {
    const { orderId } = await seedPendingOrder()
    const before = await readOrder(orderId)

    const outcome = await processWebhookEvent(
      'sandbox',
      event('payment.succeeded', `sbx_${FIXTURE_PREFIX}-not-a-payment`),
    )

    expect(outcome).toEqual({ handled: false, reason: 'no_order' })
    expect((await readOrder(orderId)).updatedAt.getTime()).toBe(before.updatedAt.getTime())
  })

  it('ignores an event with no payment reference at all', async () => {
    const outcome = await processWebhookEvent('sandbox', event('payment.succeeded', null))
    expect(outcome).toEqual({ handled: false, reason: 'no_order' })
  })
})
