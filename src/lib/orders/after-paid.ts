/**
 * Everything that happens when an order becomes paid — one entry point for
 * the payment webhook, the reconcile sweep and Studio's "mark as paid", all
 * inside the transaction that records the money. Each step is idempotent.
 *
 *  1. packages become their child bookings (phase 3) — first, so the steps
 *     below see them;
 *  2. plans (and included VIP / VIP itineraries) are granted;
 *  3. activity lines hold their places and go to their supplier (phase 2);
 *  4. the coupon use is counted and the invoice number issued (phase 4).
 *  5. the server analytics events (purchase, payment, VIP, booking request —
 *     phase 5), with ids derived from the rows so a replay writes nothing.
 */

import type { db } from '@/db'
import { emitPaidOrderEvents } from '@/lib/analytics/server-events'
import { grantOrderPlans } from '@/lib/entitlements/plans'
import { applyPaidFinance } from '@/lib/finance/paid'
import { expandPaidPackages } from '@/lib/packages/expand'
import { applyPaidBookings } from '@/lib/suppliers/after-payment'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function applyPaidOrder(tx: Tx, orderId: string, now = new Date()): Promise<void> {
  await expandPaidPackages(tx, orderId)
  await grantOrderPlans(tx, orderId, now)
  await applyPaidBookings(tx, orderId, now)
  await applyPaidFinance(tx, orderId, now)
  await emitPaidOrderEvents(tx, orderId, now)
}
