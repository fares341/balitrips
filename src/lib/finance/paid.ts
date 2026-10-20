import { eq, sql } from 'drizzle-orm'

import type { db } from '@/db'
import { couponRedemptions, invoiceCounters, orders } from '@/db/schema'

import { baliYear, formatInvoiceNumber } from './invoice-number'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * What happens to the money side of an order the moment it is paid, in the
 * same transaction that marks it paid (webhook, reconcile sweep, offline
 * "mark paid"). Both steps are idempotent, so running it twice for one order
 * changes nothing the second time:
 *
 *  1. the coupon use is recorded — once per order (unique `order_id`);
 *  2. the order gets its invoice number — once (only while it has none).
 *
 * The caller holds the order row lock (`SELECT … FOR UPDATE`), which is what
 * makes the "has none" check safe.
 */
export async function applyPaidFinance(tx: Tx, orderId: string, now = new Date()): Promise<void> {
  const [order] = await tx
    .select({
      userId: orders.userId,
      couponId: orders.couponId,
      discountMinor: orders.discountMinor,
      currency: orders.presentmentCurrency,
      customer: orders.customerSnapshot,
      invoiceNumber: orders.invoiceNumber,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  if (!order) return

  if (order.couponId !== null) {
    await tx
      .insert(couponRedemptions)
      .values({
        couponId: order.couponId,
        orderId,
        userId: order.userId,
        email: order.customer?.email?.trim().toLowerCase() || null,
        discountMinor: order.discountMinor,
        currency: order.currency,
      })
      .onConflictDoNothing({ target: couponRedemptions.orderId })
  }

  if (order.invoiceNumber === null) {
    const year = baliYear(now)
    const [counter] = await tx
      .insert(invoiceCounters)
      .values({ year, lastNumber: 1 })
      .onConflictDoUpdate({
        target: invoiceCounters.year,
        set: { lastNumber: sql`${invoiceCounters.lastNumber} + 1`, updatedAt: now },
      })
      .returning({ lastNumber: invoiceCounters.lastNumber })
    if (!counter) throw new Error('Could not allocate an invoice number')
    await tx
      .update(orders)
      .set({ invoiceNumber: formatInvoiceNumber(year, counter.lastNumber), invoicedAt: now })
      .where(eq(orders.id, orderId))
  }
}
