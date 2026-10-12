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

import { and, eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { orders } from '@/db/schema'
import { cancelUnpaidOrder } from '@/lib/orders/expire'

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
  return cancelUnpaidOrder(
    orderId,
    orderNumber,
    `unpaid for more than ${minutes} minutes`,
    AUDIT_ACTION,
  )
}
