/**
 * `capacity.release-expired` handler.
 *
 * A checkout that is never paid still holds a van. The reservation is taken
 * inside the order transaction — that is what makes overbooking impossible —
 * so an abandoned checkout keeps a vehicle off the market until somebody
 * notices by hand. On a fleet of three vans, a handful of abandoned carts is
 * a sold-out weekend that nobody actually bought.
 *
 * THE DANGEROUS DIRECTION. Cancelling is terminal: `cancelled` has no
 * outgoing transitions, so if the customer completes 3-D Secure a minute
 * after this job cancels their order, the webhook that says "paid" will be
 * recorded and discarded, and the charge stays settled against a cancelled
 * booking. Three things keep that from happening:
 *
 *   1. A generous default window — an hour, not the ten minutes a payment
 *      page actually takes.
 *   2. The order row is locked and re-read inside the transaction, so an
 *      order that was paid while this job was picking candidates is skipped.
 *   3. Any payment in a settled or still-live state vetoes the cancellation.
 *      Only an order with nothing in flight at the provider is expired.
 *
 * Every expiry writes an `audit_log` row, because "why was my booking
 * cancelled?" has to be answerable.
 */

import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import { auditLog, entitlements, orderItems, orders, payments } from '@/db/schema'
import { releaseDriverCapacity } from '@/lib/availability/capacity'
import type { VehicleClass } from '@/lib/booking-rules'
import { canTransition, shouldRevokeEntitlements } from '@/lib/orders/state'

import type { CapacityJob } from '../queues'

/**
 * How long a `pending` order may hold capacity.
 *
 * An hour rather than the ten-or-so minutes a card payment takes: a bank app
 * push notification that the customer opens after lunch is a real, common
 * shape, and the cost of waiting is one held van, while the cost of being
 * hasty is a settled charge against a cancelled booking.
 */
const DEFAULT_OLDER_THAN_MINUTES = 60

/** Per run. The sweep is scheduled; a backlog drains over a few runs. */
const SWEEP_LIMIT = 200

/**
 * Payment states that veto expiry.
 *
 * `succeeded` is obvious. `requires_action` and `processing` matter just as
 * much: the customer is at the provider's 3-D Secure step right now, and
 * cancelling under them produces exactly the charge-against-a-dead-order this
 * job exists not to cause. Only `failed` and `cancelled` payments — and
 * orders that never got as far as a payment row — are expired.
 */
const LIVE_PAYMENT_STATES = ['succeeded', 'requires_action', 'processing'] as const

const AUDIT_ACTION = 'order.expired'

export interface CapacitySummary {
  examined: number
  cancelled: number
  skipped: number
  daysReleased: number
}

export async function handleCapacityJob(job: CapacityJob): Promise<CapacitySummary> {
  const minutes = job.olderThanMinutes ?? DEFAULT_OLDER_THAN_MINUTES

  const candidates = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'pending'),
        sql`coalesce(${orders.placedAt}, ${orders.createdAt}) < now() - ${`${minutes} minutes`}::interval`,
      ),
    )
    .limit(SWEEP_LIMIT)

  const summary: CapacitySummary = {
    examined: candidates.length,
    cancelled: 0,
    skipped: 0,
    daysReleased: 0,
  }

  for (const candidate of candidates) {
    const released = await expireOne(candidate.id, candidate.orderNumber, minutes)
    if (released === null) {
      summary.skipped += 1
    } else {
      summary.cancelled += 1
      summary.daysReleased += released
    }
  }

  console.info('[capacity] expiry sweep complete', { olderThanMinutes: minutes, ...summary })
  return summary
}

/** Returns the number of vehicle-days handed back, or null when skipped. */
async function expireOne(
  orderId: string,
  orderNumber: string,
  minutes: number,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .for('update')
      .limit(1)

    // Paid between the candidate query and this lock. Nothing to do, and the
    // whole point of taking the lock.
    if (!locked || locked.status !== 'pending') return null
    if (!canTransition('pending', 'cancelled')) return null

    const [live] = await tx
      .select({ id: payments.id, status: payments.status })
      .from(payments)
      .where(and(eq(payments.orderId, orderId), inArray(payments.status, [...LIVE_PAYMENT_STATES])))
      .limit(1)

    if (live) {
      console.info('[capacity] leaving an order alone; money is still in play', {
        orderId,
        orderNumber,
        paymentStatus: live.status,
      })
      return null
    }

    const lines = await tx
      .select({
        vehicleClass: orderItems.vehicleClass,
        travelDate: orderItems.travelDate,
        endDate: orderItems.endDate,
      })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.kind, 'driver')))

    let daysReleased = 0
    for (const line of lines) {
      if (line.vehicleClass === null || line.travelDate === null) continue
      const endDate = line.endDate ?? line.travelDate
      await releaseDriverCapacity(tx, line.vehicleClass as VehicleClass, line.travelDate, endDate)
      daysReleased += countDays(line.travelDate, endDate)
    }

    await tx.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, orderId))

    // A line on a dead order is not redeemable, and the voucher template
    // filters on exactly this.
    await tx
      .update(orderItems)
      .set({ fulfilmentStatus: 'cancelled' })
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.fulfilmentStatus, 'pending')))

    if (shouldRevokeEntitlements('cancelled')) {
      await tx
        .update(entitlements)
        .set({ revokedAt: new Date(), revokedReason: 'checkout expired without payment' })
        .where(and(eq(entitlements.grantedByOrderId, orderId), sql`revoked_at is null`))
    }

    await tx.insert(auditLog).values({
      actorId: null,
      action: AUDIT_ACTION,
      entityType: 'order',
      entityId: orderId,
      before: { status: 'pending' },
      after: {
        status: 'cancelled',
        reason: `unpaid for more than ${minutes} minutes`,
        vehicleDaysReleased: daysReleased,
      },
    })

    console.warn('[capacity] expired an unpaid order and returned its capacity', {
      orderId,
      orderNumber,
      vehicleDaysReleased: daysReleased,
    })

    return daysReleased
  })
}

/** Inclusive, matching `daysInRange` inside the capacity library. */
function countDays(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`)
  const to = Date.parse(`${end}T00:00:00Z`)
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0
  return Math.round((to - from) / 86_400_000) + 1
}
