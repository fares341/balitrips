/**
 * إلغاء طلب لم يُدفع وإعادة سعته (أيام السيارات) — مشترك بين مهمة انتهاء
 * الطلبات المعلّقة (worker) وبدء دفع جديد يحل محل طلب سابق لنفس العميل.
 *
 * لا يلمس طلباً عليه دفعة ما زالت "حيّة" (ناجحة أو قيد التنفيذ).
 */

import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import { auditLog, entitlements, orderItems, orders, payments } from '@/db/schema'
import { releaseDriverCapacity } from '@/lib/availability/capacity'
import type { VehicleClass } from '@/lib/booking-rules'
import { canTransition, shouldRevokeEntitlements } from '@/lib/orders/state'

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

/** Returns the number of vehicle-days handed back, or null when skipped. */
export async function cancelUnpaidOrder(
  orderId: string,
  orderNumber: string,
  reason: string,
  auditAction = 'order.expired',
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
      action: auditAction,
      entityType: 'order',
      entityId: orderId,
      before: { status: 'pending' },
      after: {
        status: 'cancelled',
        reason,
        vehicleDaysReleased: daysReleased,
      },
    })

    console.warn('[orders] cancelled an unpaid order and returned its capacity', {
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
