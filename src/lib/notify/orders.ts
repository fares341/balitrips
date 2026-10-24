/**
 * إشعارات دورة حياة الطلب. تُستدعى **بعد** التزام المعاملة التي غيّرت الحالة
 * (webhook أو reconcile) — إشعار عن دفع تراجعت معاملته أسوأ من عدم الإشعار.
 */

import { and, desc, eq, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { entitlements, orderItems, orders, payments, plans, users } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { toMailLocale, translator } from '@/lib/email'
import { formatMoney } from '@/lib/money'
import { logActivity } from '@/lib/security/activity'
import { triggerOrderAutomation } from '@/lib/whatsapp/dispatch'

import { notifyStaff, notifyUser } from './index'
import { accessLabel } from './plans'

export async function notifyOrderPaid(orderId: string): Promise<void> {
  // WhatsApp automations (proposal §04/§05): payment success, ready itinerary bought.
  await triggerOrderAutomation('payment_success', orderId)
  await triggerOrderAutomation('itinerary_purchased', orderId)
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

    // سجل النشاط: "عمليات الشراء" (الوثيقة 15.1).
    await logActivity({
      action: 'purchase',
      userId: order.userId,
      details: {
        orderId,
        orderNumber: order.orderNumber,
        totalMinor: order.totalMinor,
        currency: order.currency,
      },
    })

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

    // الوثيقة 4.2: جدول "يشمل الخريطة" يمنح وصولاً بلا باقة (`grantOrderPlans`)
    // — صفوف صلاحية هذا الطلب التي لا باقة لها. كان المشتري لا يُبلَّغ بها.
    const mapGrants = await db
      .select({ id: entitlements.id, kind: entitlements.kind })
      .from(entitlements)
      .where(
        and(
          eq(entitlements.grantedByOrderId, orderId),
          eq(entitlements.userId, order.userId),
          isNull(entitlements.planId),
          isNull(entitlements.revokedAt),
        ),
      )
    for (const grant of mapGrants) {
      await notifyUser(
        order.userId,
        'plan_activated',
        { plan: accessLabel(null, grant.kind, locale), entitlementId: grant.id },
        '/map',
      )
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
  // WhatsApp «payment failed» (proposal §04): once per payment attempt.
  const [attempt] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(desc(payments.createdAt))
    .limit(1)
  await triggerOrderAutomation('payment_failed', orderId, { suffix: attempt?.id ?? '' })
  if (order)
    await notifyStaff(
      'staff_payment_failed',
      { orderNumber: order.orderNumber },
      `/orders/${orderId}`,
    )
}

/** Client, Oct 2026: a booking's card is held — tell staff to confirm and capture. */
export async function notifyOrderAuthorized(orderId: string): Promise<void> {
  // The gateway confirmed the payment (card held): WhatsApp «payment success».
  await triggerOrderAutomation('payment_success', orderId)
  try {
    const [order] = await db
      .select({
        orderNumber: orders.orderNumber,
        totalMinor: orders.totalMinor,
        currency: orders.presentmentCurrency,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
    if (!order) return
    await notifyStaff(
      'staff_order_authorized',
      {
        orderNumber: order.orderNumber,
        total: formatMoney(order.totalMinor, order.currency, 'en'),
      },
      `/orders/${orderId}`,
    )
    await notifyOrderUpdated(orderId, 'authorized')
  } catch (error) {
    console.error('[notify] order authorized notification failed', { orderId, error })
  }
}

/** الحالات التي يُبلَّغ بها العميل عند تغييرها من لوحة التحكم. */
export const ORDER_UPDATE_STATUSES = [
  'authorized',
  'released',
  'confirmed',
  'delivered',
  'cancelled',
  'refunded',
  'partially_refunded',
] as const
export type OrderUpdateStatus = (typeof ORDER_UPDATE_STATUSES)[number]

export function isOrderUpdateStatus(value: string): value is OrderUpdateStatus {
  return (ORDER_UPDATE_STATUSES as readonly string[]).includes(value)
}

/**
 * الوثيقة 15.1/19.1/20.1 — "تحديث حالة الطلب": الإدارة أكدت الطلب، أو نفّذت/ألغت
 * بنداً، أو استردّت. يُستدعى **بعد** التزام المعاملة. لا يرمي أبداً.
 *
 *  - سجل نشاط `update_order` لصاحب الطلب (يظهر في نشاطه).
 *  - إشعار `order_updated` داخل الموقع + بريد + واتساب، والحالة بلغة العميل.
 *  - `email: false` عند استرداد مسوّى: بريد `refund_notice` يُرسل لذلك الحدث.
 */
export async function notifyOrderUpdated(
  orderId: string,
  status: OrderUpdateStatus,
  options: { by?: string | null; item?: string | null; email?: boolean } = {},
): Promise<void> {
  // WhatsApp automations (proposal §03/§05): confirmed by the team, cancelled.
  if (status === 'confirmed') {
    await triggerOrderAutomation('booking_confirmed', orderId, { itemId: options.item ?? null })
  } else if (status === 'cancelled' || status === 'released') {
    await triggerOrderAutomation('booking_cancelled', orderId, { itemId: options.item ?? null })
  }
  try {
    const [order] = await db
      .select({
        userId: orders.userId,
        orderNumber: orders.orderNumber,
        locale: users.locale,
      })
      .from(orders)
      .leftJoin(users, eq(users.id, orders.userId))
      .where(eq(orders.id, orderId))
      .limit(1)
    // طلب ضيف بلا حساب: لا وجهة للإشعار داخل الموقع (بريد الاسترداد يصله).
    if (!order?.userId) return

    await logActivity({
      action: 'update_order',
      userId: order.userId,
      details: {
        orderId,
        orderNumber: order.orderNumber,
        status,
        ...(options.item ? { orderItemId: options.item } : {}),
        ...(options.by ? { by: options.by } : {}),
      },
    })

    const t = translator(toMailLocale(order.locale)) as unknown as (key: string) => string
    const key = `order_upd_st_${status}`
    let label: string = status
    try {
      const value = t(key)
      // next-intl يعيد اسم المفتاح لمفتاح مفقود بدل أن يرمي.
      if (value !== key && !value.endsWith(`.${key}`)) label = value
    } catch {
      // مفتاح غير موجود بعد: الحالة الخام أفضل من لا شيء.
    }
    await notifyUser(
      order.userId,
      'order_updated',
      { orderNumber: order.orderNumber, status: label, code: status },
      '/account/invoices',
      options.email === false ? { email: false } : {},
    )
  } catch (error) {
    console.error('[notify] order update notification failed', { orderId, status, error })
  }
}
