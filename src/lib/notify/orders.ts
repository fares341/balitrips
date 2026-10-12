/**
 * إشعارات دورة حياة الطلب. تُستدعى **بعد** التزام المعاملة التي غيّرت الحالة
 * (webhook أو reconcile) — إشعار عن دفع تراجعت معاملته أسوأ من عدم الإشعار.
 */

import { and, eq } from 'drizzle-orm'

import { db } from '@/db'
import { orderItems, orders, plans, users } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { toMailLocale } from '@/lib/email'
import { formatMoney } from '@/lib/money'

import { notifyStaff, notifyUser } from './index'

export async function notifyOrderPaid(orderId: string): Promise<void> {
  try {
    const [order] = await db
      .select({
        userId: orders.userId,
        orderNumber: orders.orderNumber,
        totalMinor: orders.totalMinor,
        currency: orders.presentmentCurrency,
        locale: users.locale,
      })
      .from(orders)
      .leftJoin(users, eq(users.id, orders.userId))
      .where(eq(orders.id, orderId))
      .limit(1)
    if (!order) return

    await notifyStaff(
      'staff_order_paid',
      {
        orderNumber: order.orderNumber,
        total: formatMoney(order.totalMinor, order.currency, 'en'),
      },
      `/orders/${orderId}`,
    )
    if (!order.userId) return

    await notifyUser(
      order.userId,
      'order_paid',
      { orderNumber: order.orderNumber },
      `/checkout/confirmation/${order.orderNumber}`,
    )

    const locale = toMailLocale(order.locale)
    const planLines = await db
      .select({ name: plans.name })
      .from(orderItems)
      .innerJoin(plans, eq(plans.id, orderItems.refId))
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.kind, 'plan')))
    for (const line of planLines) {
      await notifyUser(order.userId, 'plan_activated', { plan: pick(line.name, locale) }, '/map')
    }
  } catch (error) {
    console.error('[notify] order paid notifications failed', { orderId, error })
  }
}

export async function notifyPaymentFailed(orderId: string): Promise<void> {
  const [order] = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  if (order)
    await notifyStaff(
      'staff_payment_failed',
      { orderNumber: order.orderNumber },
      `/orders/${orderId}`,
    )
}
