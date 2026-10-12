import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '@/db'
import { entitlements, orderItems, orders, payments, refunds } from '@/db/schema'
import { loadEntitlements } from '@/lib/entitlements'
import {
  createTestItinerary,
  createTestUser,
  deleteTestItinerary,
  deleteTestOrder,
  deleteTestUser,
  localizedFixture,
  testDay,
  type TestItinerary,
} from '@/test/integration/support'

/**
 * Refunds, driven through the admin action that operators actually use.
 *
 * Refunding is where several of this system's promises are collected at once:
 * the arithmetic decides the order's status, a fully-refunded plan has to take
 * the map away again, and refunding more than was charged has to be
 * impossible rather than merely discouraged. All of it happens inside one
 * transaction holding `FOR UPDATE` on the order, and none of it can be proved
 * without a database — the whole point is what two operators clicking at once
 * are prevented from doing.
 *
 * The action is a Server Action, so two Next-only dependencies are stubbed and
 * nothing else is: `requireCapability` (which would need a real session
 * cookie) and `redirect` (which is how the action returns its outcome). The
 * refund logic, the provider call, the audit row and every write are real.
 */

const mocks = vi.hoisted(() => ({
  session: {
    userId: '',
    email: 'ops-fixture@example.test',
    name: 'Ops fixture',
    role: 'admin' as const,
    ipAddress: '127.0.0.1' as string | null,
  },
  redirects: [] as string[],
}))

vi.mock('@/app/(admin)/_lib/session', () => ({
  getAdminSession: async () => mocks.session,
  requireCapability: async () => mocks.session,
}))

vi.mock('next/navigation', () => ({
  /**
   * The real `redirect` throws a control-flow signal carrying a `digest` that
   * `isRedirectError` recognises, and the action's catch block rethrows it.
   * Reproducing that shape is what lets the outcome — which travels back as a
   * query string — be read here.
   */
  redirect: (url: string): never => {
    mocks.redirects.push(url)
    const error = new Error(`NEXT_REDIRECT ${url}`) as Error & { digest: string }
    error.digest = `NEXT_REDIRECT;replace;${url};307;`
    throw error
  },
  notFound: (): never => {
    throw new Error('notFound() was called')
  },
}))

// Imported after the mocks above, which Vitest hoists ahead of every import.
const { refundOrderItem } = await import('@/app/(admin)/studio/orders/actions')

const ITINERARY_MINOR = 5_900
const ACTIVITY_MINOR = 25_000
const ORDER_TOTAL = ITINERARY_MINOR + ACTIVITY_MINOR

interface Fixture {
  userId: string
  orderId: string
  planItemId: string
  activityItemId: string
  entitlementId: string
}

let adminId = ''
let itinerary: TestItinerary
let fixture: Fixture

/** A paid, two-line order: a downloadable plan and a booked activity. */
async function seedPaidOrder(): Promise<Fixture> {
  const user = await createTestUser()

  const [order] = await db
    .insert(orders)
    .values({
      orderNumber: `BT-IT-${randomUUID().slice(0, 12)}`,
      userId: user.id,
      status: 'paid',
      presentmentCurrency: 'USD',
      subtotalMinor: ORDER_TOTAL,
      totalMinor: ORDER_TOTAL,
      customerSnapshot: { name: 'Fixture', email: user.email, locale: 'en' },
      termsAcceptedAt: new Date(),
      termsVersion: '2026-01-v1',
      placedAt: new Date(),
    })
    .returning({ id: orders.id })
  if (!order) throw new Error('Could not create the fixture order')

  const lines = await db
    .insert(orderItems)
    .values([
      {
        orderId: order.id,
        kind: 'itinerary',
        refId: itinerary.id,
        nameSnapshot: itinerary.name,
        unitPriceMinor: ITINERARY_MINOR,
        quantity: 1,
        lineTotalMinor: ITINERARY_MINOR,
        refVersion: itinerary.version,
      },
      {
        orderId: order.id,
        kind: 'activity',
        nameSnapshot: localizedFixture('Fixture activity line'),
        unitPriceMinor: 12_500,
        quantity: 2,
        lineTotalMinor: ACTIVITY_MINOR,
        travelDate: testDay(90),
        guests: 2,
      },
    ])
    .returning({ id: orderItems.id, kind: orderItems.kind })

  const planItemId = lines.find((line) => line.kind === 'itinerary')?.id
  const activityItemId = lines.find((line) => line.kind === 'activity')?.id
  if (!planItemId || !activityItemId) throw new Error('Could not create the fixture lines')

  await db.insert(payments).values({
    orderId: order.id,
    provider: 'sandbox',
    providerPaymentId: `sbx_itest_${randomUUID().slice(0, 20)}`,
    // Only a settled payment can be refunded.
    status: 'succeeded',
    amountMinor: ORDER_TOTAL,
    currency: 'USD',
    idempotencyKey: `itest-${randomUUID()}`,
  })

  // What the plan actually sold: access to the gated map.
  const [entitlement] = await db
    .insert(entitlements)
    .values({ userId: user.id, kind: 'map_access', grantedByOrderId: order.id })
    .returning({ id: entitlements.id })
  if (!entitlement) throw new Error('Could not create the fixture entitlement')

  return {
    userId: user.id,
    orderId: order.id,
    planItemId,
    activityItemId,
    entitlementId: entitlement.id,
  }
}

/** Run the action and read the outcome it redirects with. */
async function refund(
  orderItemId: string,
  amountMinor: number,
  reason = 'integration test',
): Promise<{ ok: string | null; err: string | null }> {
  const form = new FormData()
  form.set('orderItemId', orderItemId)
  form.set('amountMinor', String(amountMinor))
  form.set('reason', reason)

  mocks.redirects.length = 0
  await expect(refundOrderItem(fixture.orderId, form)).rejects.toMatchObject({
    digest: expect.stringContaining('NEXT_REDIRECT'),
  })

  const url = mocks.redirects.at(-1)
  if (url === undefined) throw new Error('the action did not redirect')
  const query = new URLSearchParams(url.slice(url.indexOf('?') + 1))
  return { ok: query.get('ok'), err: query.get('err') }
}

async function readOrderStatus(): Promise<string> {
  const [row] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, fixture.orderId))
    .limit(1)
  return row?.status ?? 'missing'
}

async function readLine(id: string) {
  const [row] = await db.select().from(orderItems).where(eq(orderItems.id, id)).limit(1)
  if (!row) throw new Error('line vanished')
  return row
}

async function countRefunds(): Promise<number> {
  const paid = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.orderId, fixture.orderId))
  const paymentId = paid[0]?.id
  if (paymentId === undefined) return 0
  const rows = await db
    .select({ id: refunds.id })
    .from(refunds)
    .where(eq(refunds.paymentId, paymentId))
  return rows.length
}

beforeAll(async () => {
  const admin = await createTestUser('admin')
  adminId = admin.id
  mocks.session.userId = admin.id
  itinerary = await createTestItinerary(ITINERARY_MINOR)
})

beforeEach(async () => {
  fixture = await seedPaidOrder()
})

afterEach(async () => {
  await deleteTestOrder(fixture.orderId)
  await deleteTestUser(fixture.userId)
})

afterAll(async () => {
  // The itinerary and the admin outlive the per-test order, so they go here.
  await deleteTestItinerary(itinerary.id)
  await deleteTestUser(adminId)
})

describe('partial refunds', () => {
  it('lands on partially_refunded when one line of a multi-line order is refunded', async () => {
    const outcome = await refund(fixture.activityItemId, ACTIVITY_MINOR)

    expect(outcome.err).toBeNull()
    expect(outcome.ok).toContain('partially refunded')
    expect(await readOrderStatus()).toBe('partially_refunded')

    const line = await readLine(fixture.activityItemId)
    expect(line.refundedMinor).toBe(ACTIVITY_MINOR)
    // A fully cleared line is marked refunded so it cannot then be marked
    // delivered by the fulfilment screen.
    expect(line.fulfilmentStatus).toBe('refunded')

    // The other line is untouched — the customer keeps the plan they paid for.
    expect((await readLine(fixture.planItemId)).refundedMinor).toBe(0)

    expect(await countRefunds()).toBe(1)
  })

  it('stays partially_refunded across a sequence that has not reached the total', async () => {
    // Part of one line: the traveller had two seats and only one was rained
    // off. The line is not cleared, so its fulfilment status must not change.
    const first = await refund(fixture.activityItemId, 12_500)
    expect(first.err).toBeNull()
    expect(await readOrderStatus()).toBe('partially_refunded')

    const line = await readLine(fixture.activityItemId)
    expect(line.refundedMinor).toBe(12_500)
    expect(line.fulfilmentStatus).toBe('pending')
    expect(await countRefunds()).toBe(1)
  })

  it('records the refund against the settled payment with the provider reference', async () => {
    await refund(fixture.activityItemId, 10_000, 'weather')

    const paid = await db
      .select({ id: payments.id, currency: payments.currency })
      .from(payments)
      .where(eq(payments.orderId, fixture.orderId))
    const paymentId = paid[0]?.id
    expect(paymentId).toBeDefined()

    const [row] = await db
      .select()
      .from(refunds)
      .where(eq(refunds.paymentId, paymentId as string))
    expect(row?.amountMinor).toBe(10_000)
    expect(row?.currency).toBe('USD')
    expect(row?.reason).toBe('weather')
    expect(row?.status).toBe('succeeded')
    expect(row?.providerRefundId).toMatch(/^sbxr_/)
    // Refunds are always attributable to the staff member who issued them.
    expect(row?.actorId).toBe(adminId)
    expect(row?.orderItemId).toBe(fixture.activityItemId)
  })
})

describe('refunding the remainder', () => {
  it('lands on refunded when a sequence of partials adds up to the total', async () => {
    await refund(fixture.activityItemId, 12_500)
    expect(await readOrderStatus()).toBe('partially_refunded')

    await refund(fixture.activityItemId, 12_500)
    expect(await readOrderStatus()).toBe('partially_refunded')

    // The last line clears, so the arithmetic — not a flag — decides.
    const final = await refund(fixture.planItemId, ITINERARY_MINOR)
    expect(final.err).toBeNull()
    expect(await readOrderStatus()).toBe('refunded')

    expect((await readLine(fixture.activityItemId)).refundedMinor).toBe(ACTIVITY_MINOR)
    expect((await readLine(fixture.planItemId)).refundedMinor).toBe(ITINERARY_MINOR)
    expect(await countRefunds()).toBe(3)
  })
})

describe('refunding a plan revokes what it sold', () => {
  it('takes the map away as soon as the plan line is fully refunded', async () => {
    // Access is still live before the refund.
    expect((await loadEntitlements(fixture.userId)).has('map_access')).toBe(true)

    const outcome = await refund(fixture.planItemId, ITINERARY_MINOR)
    expect(outcome.err).toBeNull()

    // The order is only PARTIALLY refunded — the activity is still sold — but
    // the line that granted access has been cleared, so access has to go.
    // Leaving it would mean a customer keeps a paid feature they no longer
    // paid for, which is exactly the hole `mapUnlocked` in localStorage left.
    expect(await readOrderStatus()).toBe('partially_refunded')

    const [row] = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.id, fixture.entitlementId))
    expect(row?.revokedAt).toBeInstanceOf(Date)
    expect(row?.revokedReason).toContain('line refunded')

    // Revoked, not deleted: the grant stays as an audit record.
    expect(row).toBeDefined()
    expect((await loadEntitlements(fixture.userId)).has('map_access')).toBe(false)
  })

  it('revokes on a full refund of the whole order too', async () => {
    await refund(fixture.activityItemId, ACTIVITY_MINOR)
    await refund(fixture.planItemId, ITINERARY_MINOR)

    expect(await readOrderStatus()).toBe('refunded')
    expect((await loadEntitlements(fixture.userId)).has('map_access')).toBe(false)
  })
})

describe('refunding more than was charged', () => {
  it('refuses an amount larger than the line has left', async () => {
    const outcome = await refund(fixture.activityItemId, ACTIVITY_MINOR + 1)

    expect(outcome.ok).toBeNull()
    expect(outcome.err).toContain('left to refund')

    // Nothing was written: not the refund row, not the line, not the status.
    expect(await countRefunds()).toBe(0)
    expect((await readLine(fixture.activityItemId)).refundedMinor).toBe(0)
    expect(await readOrderStatus()).toBe('paid')
  })

  it('refuses a second refund of an already-cleared line', async () => {
    await refund(fixture.activityItemId, ACTIVITY_MINOR)
    const outcome = await refund(fixture.activityItemId, 1)

    expect(outcome.err).toContain('left to refund')
    expect(await countRefunds()).toBe(1)
    expect((await readLine(fixture.activityItemId)).refundedMinor).toBe(ACTIVITY_MINOR)
  })

  it('refuses to touch an order that is already fully refunded', async () => {
    await refund(fixture.activityItemId, ACTIVITY_MINOR)
    await refund(fixture.planItemId, ITINERARY_MINOR)
    expect(await readOrderStatus()).toBe('refunded')

    const outcome = await refund(fixture.activityItemId, 1)
    expect(outcome.err).toContain('cannot be refunded')
    expect(await countRefunds()).toBe(2)
  })

  it('refuses a zero or negative amount', async () => {
    expect((await refund(fixture.activityItemId, 0)).err).toContain('greater than zero')
    expect((await refund(fixture.activityItemId, -100)).err).not.toBeNull()
    expect(await countRefunds()).toBe(0)
    expect(await readOrderStatus()).toBe('paid')
  })
})
