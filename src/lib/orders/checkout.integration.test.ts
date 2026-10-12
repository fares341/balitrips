import { createHmac, randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { activities, cartItems, driverCapacity, orderItems, orders, payments } from '@/db/schema'
import { CapacityError } from '@/lib/availability/capacity'
import { CheckoutError, checkout, type CheckoutInput } from '@/lib/orders/checkout'
import { processWebhookEvent } from '@/lib/orders/webhook'
import { getPaymentProvider } from '@/lib/payments'
import {
  clearCapacity,
  createCartForUser,
  createTestActivity,
  createTestUser,
  deleteCart,
  deleteTestActivity,
  deleteTestOrder,
  deleteTestUser,
  readBookedCount,
  readFleetSize,
  setFleetSize,
  testDay,
  type TestActivity,
} from '@/test/integration/support'

/**
 * Checkout, end to end, against the sandbox provider.
 *
 * The pure parts of pricing are already unit-tested. What cannot be proved
 * without a database is the seam: that the amount the customer agreed to is
 * the amount the order row carries, that the name on the line is frozen
 * against a later edit, that a withdrawn product cannot be sold, and that a
 * checkout which fails partway leaves nothing behind.
 *
 * `pending` is as far as `checkout()` goes on purpose. Only a verified
 * webhook moves an order to `paid`, because the provider's success event
 * routinely arrives before the customer's browser does — so the last act
 * here is a signed webhook, not a redirect.
 */

const TERMS_VERSION = '2026-01-v1'
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-webhook-secret'

const cleanup: (() => Promise<void>)[] = []
const capacityDays: string[] = []

function onCleanup(task: () => Promise<void>): void {
  cleanup.unshift(task)
}

async function runCleanup(): Promise<void> {
  const tasks = cleanup.splice(0, cleanup.length)
  for (const task of tasks) await task()
}

function checkoutInput(cartId: string, userId: string, expectedTotalMinor: number): CheckoutInput {
  return {
    cartId,
    userId,
    expectedTotalMinor,
    customer: { email: 'fixture@example.test', name: 'Fixture Traveller', locale: 'en' },
    termsVersion: TERMS_VERSION,
    returnUrl: 'http://localhost:3000/en/checkout/return',
    idempotencyKey: `itest-${randomUUID()}`,
  }
}

/** A user with a cart holding one bookable activity, ready to check out. */
async function seedActivityCart(
  options: { status?: string; timeSlots?: string[]; travelTime?: string; quantity?: number } = {},
): Promise<{
  userId: string
  cartId: string
  activity: TestActivity
  quantity: number
  expectedTotalMinor: number
}> {
  const user = await createTestUser()
  onCleanup(() => deleteTestUser(user.id))

  const activity = await createTestActivity({
    priceMinor: 12_500,
    status: options.status,
    timeSlots: options.timeSlots ?? [],
  })
  onCleanup(() => deleteTestActivity(activity.id))

  const cartId = await createCartForUser(user.id)
  onCleanup(() => deleteCart(cartId))

  const quantity = options.quantity ?? 2

  await db.insert(cartItems).values({
    cartId,
    kind: 'activity',
    refId: activity.id,
    quantity,
    travelDate: testDay(60),
    travelTime: options.travelTime ?? '09:00',
    guests: quantity,
    // A display snapshot only. Never summed into a total — the point of the
    // `price_changed` case below is that this column is not trusted.
    unitPriceMinor: activity.priceMinor,
  })

  return {
    userId: user.id,
    cartId,
    activity,
    quantity,
    expectedTotalMinor: activity.priceMinor * quantity,
  }
}

/** A signed webhook, verified through the provider exactly as the route does. */
async function deliverSignedWebhook(
  type: string,
  providerPaymentId: string,
  amountMinor: number,
): Promise<ReturnType<typeof processWebhookEvent>> {
  const provider = getPaymentProvider()
  const body = JSON.stringify({
    id: `itest-evt-${randomUUID()}`,
    type,
    paymentId: providerPaymentId,
    amountMinor,
    currency: 'USD',
  })
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
  const parsed = await provider.parseWebhook(body, { 'x-sandbox-signature': signature })
  return processWebhookEvent(provider.name, parsed)
}

afterEach(async () => {
  await runCleanup()
})

afterAll(async () => {
  if (capacityDays.length > 0) await clearCapacity('van', capacityDays)
})

describe('the happy path', () => {
  it('writes a pending order with server-computed totals and frozen snapshots', async () => {
    const seed = await seedActivityCart()

    const result = await checkout(checkoutInput(seed.cartId, seed.userId, seed.expectedTotalMinor))
    onCleanup(() => deleteTestOrder(result.orderId))

    expect(result.orderNumber).toMatch(/^BT-\d{4}-\d{4,}$/)
    expect(result.quote.ok).toBe(true)
    expect(result.quote.totalMinor).toBe(25_000)

    const [order] = await db.select().from(orders).where(eq(orders.id, result.orderId))
    expect(order).toBeDefined()
    // Not `paid`. The customer has not been charged yet, and only a verified
    // webhook is allowed to say otherwise.
    expect(order?.status).toBe('pending')
    expect(order?.totalMinor).toBe(25_000)
    expect(order?.subtotalMinor).toBe(25_000)
    expect(order?.presentmentCurrency).toBe('USD')
    expect(order?.userId).toBe(seed.userId)
    // The compelling evidence in a "services not rendered" dispute, and the
    // dispute window on future-dated travel runs to about 540 days.
    expect(order?.termsVersion).toBe(TERMS_VERSION)
    expect(order?.termsAcceptedAt).toBeInstanceOf(Date)
    expect(order?.customerSnapshot?.email).toBe('fixture@example.test')

    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, result.orderId))
    expect(lines).toHaveLength(1)
    const [line] = lines
    expect(line?.kind).toBe('activity')
    expect(line?.refId).toBe(seed.activity.id)
    expect(line?.unitPriceMinor).toBe(12_500)
    expect(line?.quantity).toBe(2)
    expect(line?.lineTotalMinor).toBe(25_000)
    expect(line?.travelDate).toBe(testDay(60))
    expect(line?.guests).toBe(2)
    expect(line?.nameSnapshot).toEqual(seed.activity.name)
    expect(line?.refundedMinor).toBe(0)
    expect(line?.fulfilmentStatus).toBe('pending')

    // The payment intent is created only after the order commits, so a failed
    // reservation can never leave a charge with no order behind it.
    const [payment] = await db.select().from(payments).where(eq(payments.orderId, result.orderId))
    expect(payment?.provider).toBe('sandbox')
    expect(payment?.providerPaymentId).toBe(result.payment.providerPaymentId)
    expect(payment?.status).toBe('requires_action')
    expect(payment?.amountMinor).toBe(25_000)
  })

  it('keeps the line snapshot after the product is renamed and withdrawn', async () => {
    const seed = await seedActivityCart()
    const result = await checkout(checkoutInput(seed.cartId, seed.userId, seed.expectedTotalMinor))
    onCleanup(() => deleteTestOrder(result.orderId))

    // The operator renames the tour and pulls it from sale a week later.
    await db
      .update(activities)
      .set({
        name: { en: 'Renamed after the sale', ar: 'Renamed', id: 'Renamed' },
        priceMinor: 99_900,
        status: 'draft',
      })
      .where(eq(activities.id, seed.activity.id))

    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, result.orderId))

    // What the customer bought does not change because the catalogue did.
    expect(line?.nameSnapshot).toEqual(seed.activity.name)
    expect(line?.unitPriceMinor).toBe(12_500)
    expect(line?.lineTotalMinor).toBe(25_000)
  })

  it('moves the order to paid only when a signed webhook says so', async () => {
    const seed = await seedActivityCart()
    const result = await checkout(checkoutInput(seed.cartId, seed.userId, seed.expectedTotalMinor))
    onCleanup(() => deleteTestOrder(result.orderId))

    const outcome = await deliverSignedWebhook(
      'payment.succeeded',
      result.payment.providerPaymentId,
      result.quote.totalMinor,
    )

    expect(outcome).toEqual({
      handled: true,
      orderId: result.orderId,
      from: 'pending',
      to: 'paid',
    })

    const [order] = await db.select().from(orders).where(eq(orders.id, result.orderId))
    expect(order?.status).toBe('paid')

    const [payment] = await db.select().from(payments).where(eq(payments.orderId, result.orderId))
    expect(payment?.status).toBe('succeeded')
  })

  it('refuses a webhook whose signature does not verify', async () => {
    // An unverified webhook is an unauthenticated request to change order
    // state, which is as sensitive as this system gets.
    const provider = getPaymentProvider()
    const body = JSON.stringify({ id: 'itest-forged', type: 'payment.succeeded', paymentId: 'x' })
    await expect(
      provider.parseWebhook(body, { 'x-sandbox-signature': 'deadbeef' }),
    ).rejects.toThrow(/signature/i)
  })
})

describe('what checkout refuses', () => {
  it('rejects a tampered expected total and creates no order', async () => {
    const seed = await seedActivityCart()

    // The browser claims the trip costs one dollar.
    const attempt = checkout(checkoutInput(seed.cartId, seed.userId, 100))

    await expect(attempt).rejects.toBeInstanceOf(CheckoutError)
    await expect(attempt).rejects.toMatchObject({ code: 'price_changed' })

    // Nothing was written. A rejected checkout that still leaves an order row
    // behind turns into a support ticket about a booking nobody made.
    const rows = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.userId, seed.userId))
    expect(rows).toHaveLength(0)
  })

  it('rejects an unpublished activity rather than selling something withdrawn', async () => {
    const seed = await seedActivityCart({ status: 'draft' })

    const attempt = checkout(checkoutInput(seed.cartId, seed.userId, seed.expectedTotalMinor))

    await expect(attempt).rejects.toBeInstanceOf(CheckoutError)
    // Unpublished rows are omitted from the catalogue snapshot entirely, so
    // pricing reports them as unknown rather than quietly using a stale price.
    await expect(attempt).rejects.toMatchObject({ code: 'invalid_cart' })

    const rows = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.userId, seed.userId))
    expect(rows).toHaveLength(0)
  })

  it('rejects an empty cart', async () => {
    const user = await createTestUser()
    onCleanup(() => deleteTestUser(user.id))
    const cartId = await createCartForUser(user.id)
    onCleanup(() => deleteCart(cartId))

    await expect(checkout(checkoutInput(cartId, user.id, 0))).rejects.toMatchObject({
      code: 'empty_cart',
    })
  })
})

describe('capacity is held inside the order transaction', () => {
  it('reserves the fleet days the driver line covers', async () => {
    const user = await createTestUser()
    onCleanup(() => deleteTestUser(user.id))
    const cartId = await createCartForUser(user.id)
    onCleanup(() => deleteCart(cartId))

    const startDate = testDay(70)
    const endDate = testDay(71)
    capacityDays.push(startDate, endDate)
    await clearCapacity('van', [startDate, endDate])

    await db.insert(cartItems).values({
      cartId,
      kind: 'driver',
      quantity: 1,
      travelDate: startDate,
      endDate,
      // 8 passengers means a van, decided on the server from the head count.
      guests: 8,
      vehicleClass: 'van',
      unitPriceMinor: 9_500,
    })

    // Two days at the seeded van rate. Derived here, never sent by the client.
    const result = await checkout(checkoutInput(cartId, user.id, 19_000))
    onCleanup(() => deleteTestOrder(result.orderId))

    expect(result.quote.totalMinor).toBe(19_000)
    expect(await readBookedCount('van', startDate)).toBe(1)
    expect(await readBookedCount('van', endDate)).toBe(1)
  })

  it('creates no order at all when a day in the range is sold out', async () => {
    const user = await createTestUser()
    onCleanup(() => deleteTestUser(user.id))
    const cartId = await createCartForUser(user.id)
    onCleanup(() => deleteCart(cartId))

    const startDate = testDay(74)
    const endDate = testDay(75)
    capacityDays.push(startDate, endDate)
    await clearCapacity('van', [startDate, endDate])

    const originalFleet = await readFleetSize('van')
    await setFleetSize('van', 1)
    onCleanup(() => setFleetSize('van', originalFleet))

    // The second day of the hire is already gone.
    await db.insert(driverCapacity).values({ vehicleClass: 'van', day: endDate, bookedCount: 1 })

    await db.insert(cartItems).values({
      cartId,
      kind: 'driver',
      quantity: 1,
      travelDate: startDate,
      endDate,
      guests: 8,
      vehicleClass: 'van',
      unitPriceMinor: 9_500,
    })

    await expect(checkout(checkoutInput(cartId, user.id, 19_000))).rejects.toBeInstanceOf(
      CapacityError,
    )

    // The order, its lines and the first day's hold all roll back together.
    const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.userId, user.id))
    expect(rows).toHaveLength(0)
    expect(await readBookedCount('van', startDate)).toBeNull()
  })
})

describe('published time slots', () => {
  it('books an activity at one of its own published departure times', async () => {
    /*
     * REGRESSION GUARD — currently failing. See the report accompanying this
     * suite.
     *
     * `activities.time_slots` is authored as `HH:mm` ("09:00") and the
     * booking form posts the same string, but `cart_items.travel_time` is a
     * Postgres `time` column: it reads back as `HH:mm:ss` ("09:00:00").
     * `buildQuote` then compares "09:00:00" against ["09:00"], finds no
     * match, and reports `invalid_time_slot` — so every activity that has
     * fixed departures is unbookable, and the cart shows the line as
     * unpriceable with no way for the traveller to fix it.
     *
     * The fix belongs in pricing or in the cart's write path (normalise to
     * `HH:mm` on either side of the column), neither of which this file owns.
     */
    const seed = await seedActivityCart({ timeSlots: ['09:00', '13:30'], travelTime: '09:00' })

    const result = await checkout(checkoutInput(seed.cartId, seed.userId, seed.expectedTotalMinor))
    onCleanup(() => deleteTestOrder(result.orderId))

    expect(result.quote.ok).toBe(true)
    expect(result.quote.issues).toEqual([])
  })

  it('still refuses a departure time the activity does not offer', async () => {
    const seed = await seedActivityCart({ timeSlots: ['09:00'], travelTime: '23:45' })

    const attempt = checkout(checkoutInput(seed.cartId, seed.userId, seed.expectedTotalMinor))
    await expect(attempt).rejects.toMatchObject({ code: 'invalid_cart' })
  })
})
