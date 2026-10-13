'use server'

import { randomUUID } from 'node:crypto'

import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import {
  entitlements,
  itineraries,
  orderItems,
  orders,
  payments,
  planMembers,
  refunds,
  users,
} from '@/db/schema'
import { absoluteUrl } from '@/app/[locale]/_meta'
import { pick } from '@/lib/content/localize'
import { toMailLocale } from '@/lib/email'
import { notifyUser } from '@/lib/notify'
import { toWhatsappNumber } from '@/lib/notify/whatsapp'
import { releaseDriverCapacity } from '@/lib/availability/capacity'
import type { VehicleClass } from '@/lib/booking-rules'
import { getPaymentProvider } from '@/lib/payments'
import {
  assertTransition,
  isRefundable,
  shouldRevokeEntitlements,
  statusAfterRefund,
  type OrderStatus,
} from '@/lib/orders/state'
import { grantOrderPlans } from '@/lib/entitlements/plans'
import { isOrderUpdateStatus, notifyOrderPaid, notifyOrderUpdated } from '@/lib/notify/orders'
import { revokeOrderEntitlements } from '@/lib/orders/webhook'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fminor, fstr, fuuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { fulfilmentLabel, orderStatusLabel } from './labels'

type Outcome = { ok: string } | { err: string }

const detail = (id: string) => adminHref(`/orders/${id}`)

/**
 * Partial refund, one order line at a time.
 *
 * Partial refunds are first-class rather than an afterthought: a five-line
 * trip where one activity is rained off is the normal case, not the edge
 * one. `statusAfterRefund()` decides the resulting order status by
 * arithmetic, so a sequence of partial refunds that happens to add up to
 * the full total correctly lands on `refunded`.
 *
 * The order row is locked FOR UPDATE for the whole operation, provider call
 * included. Holding a lock across a network call is a real cost, but the
 * alternative — validate, call, then write — lets two operators each refund
 * the last unrefunded portion of the same line.
 */
export async function refundOrderItem(orderId: string, form: FormData): Promise<void> {
  const session = await requireCapability('orders.refund')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    const orderItemId = fuuid(form, 'orderItemId', t('orders.field_order_line'))
    const amountMinor = fminor(form, 'amountMinor', t('orders.field_refund_amount'))
    const reason = fstr(form, 'reason')

    if (amountMinor <= 0) throw new Error(t('orders.err_amount_positive'))

    const summary = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
        .limit(1)

      if (!order) throw new Error(t('orders.err_order_gone'))

      const status = order.status as OrderStatus
      if (!isRefundable(status)) {
        throw new Error(t('orders.not_refundable', { status: orderStatusLabel(t, status) }))
      }

      const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId))

      const line = lines.find((row) => row.id === orderItemId)
      if (!line) throw new Error(t('orders.err_line_not_in_order'))

      const lineRemaining = line.lineTotalMinor - line.refundedMinor
      if (amountMinor > lineRemaining) {
        throw new Error(
          t('orders.err_line_exceeds', { remaining: lineRemaining, requested: amountMinor }),
        )
      }

      const alreadyRefunded = lines.reduce((total, row) => total + row.refundedMinor, 0)

      // Throws if the refund would exceed the order total. Refunding more
      // than was charged is never correct.
      const nextStatus = statusAfterRefund(status, order.totalMinor, alreadyRefunded, amountMinor)
      assertTransition(status, nextStatus)

      // الدفعة التي سدّدت الطلب: أول دفعة ناجحة. (دفعة ثانية مكررة — تحويل بنكي ثم
      // بطاقة — تُسترد من صفحة Payments ولا تمسّ حساب الطلب.)
      const [payment] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, orderId), eq(payments.status, 'succeeded')))
        .orderBy(asc(payments.createdAt))
        .limit(1)

      if (!payment?.providerPaymentId) {
        throw new Error(t('orders.err_no_settled_payment'))
      }

      let result: { providerRefundId: string | null; status: string }
      if (payment.provider === 'manual') {
        // دُفع بتحويل بنكي: لا مزوّد يُستدعى. المبلغ يُعاد يدوياً بالطريقة نفسها،
        // والسجل هنا يثبت الاسترداد ويسحب الصلاحيات كأي استرداد آخر.
        result = { providerRefundId: null, status: 'succeeded' }
      } else {
        const provider = getPaymentProvider()
        if (provider.name !== payment.provider) {
          throw new Error(
            t('orders.err_other_provider', { paid: payment.provider, active: provider.name }),
          )
        }
        // Derived from the line and the amount already refunded, so a retried
        // submit resolves to the same key and the provider refuses to refund
        // twice.
        const idempotencyKey = `refund:${orderItemId}:${line.refundedMinor}:${amountMinor}`
        result = await provider.refund({
          providerPaymentId: payment.providerPaymentId,
          amountMinor,
          currency: payment.currency,
          reason: reason ?? undefined,
          idempotencyKey,
        })
      }

      const [refundRow] = await tx
        .insert(refunds)
        .values({
          paymentId: payment.id,
          orderItemId,
          amountMinor,
          currency: payment.currency,
          reason,
          actorId: session.userId,
          providerRefundId: result.providerRefundId,
          status: result.status,
        })
        .returning({ id: refunds.id })

      const lineRefunded = line.refundedMinor + amountMinor
      await tx
        .update(orderItems)
        .set({
          refundedMinor: lineRefunded,
          fulfilmentStatus:
            lineRefunded >= line.lineTotalMinor ? 'refunded' : line.fulfilmentStatus,
        })
        .where(eq(orderItems.id, orderItemId))

      await tx.update(orders).set({ status: nextStatus }).where(eq(orders.id, orderId))

      /**
       * Refunding map access must actually take the map away.
       *
       * Entitlements are granted per order, not per line, so a full refund
       * revokes them outright. A partial refund that fully clears the line
       * which sold access does the same — otherwise the customer keeps a
       * paid feature they no longer paid for.
       */
      const soldAccess = line.kind === 'place' || line.kind === 'itinerary' || line.kind === 'plan'
      if (shouldRevokeEntitlements(nextStatus)) {
        await revokeOrderEntitlements(tx, orderId, `order ${nextStatus} by ${session.email}`)
      } else if (soldAccess && lineRefunded >= line.lineTotalMinor) {
        // استرداد سطر واحد يسحب ما منحه هذا السطر فقط: باقة → صفوفها (ونسخ
        // أفراد عائلتها، نفس plan_id)؛ جدول/مكان → الوصول للخريطة بلا باقة.
        // كان يسحب كل صلاحيات الطلب، ومنها خريطة جدولٍ آخر مدفوع.
        // جدول/مكان: صف الخريطة (بلا باقة) واحد لكل نوع (map_access/vip) في الطلب
        // كله. لا يُسحب ما دام سطر آخر غير مسترد في الطلب يمنح النوع نفسه.
        const kindsToRevoke =
          line.kind === 'plan' ? null : await mapKindsLostWith(tx, line.id, lines)
        if (line.kind === 'plan' || (kindsToRevoke !== null && kindsToRevoke.length > 0)) {
          await tx
            .update(entitlements)
            .set({ revokedAt: new Date(), revokedReason: `line refunded by ${session.email}` })
            .where(
              and(
                eq(entitlements.grantedByOrderId, orderId),
                isNull(entitlements.revokedAt),
                line.kind === 'plan' && line.refId
                  ? eq(entitlements.planId, line.refId)
                  : and(
                      isNull(entitlements.planId),
                      inArray(entitlements.kind, kindsToRevoke ?? []),
                    ),
              ),
            )
        }
        if (line.kind === 'plan' && line.refId) {
          await tx
            .update(planMembers)
            .set({ status: 'removed', tokenHash: null })
            .where(
              and(
                ne(planMembers.status, 'removed'),
                inArray(
                  planMembers.ownerEntitlementId,
                  tx
                    .select({ id: entitlements.id })
                    .from(entitlements)
                    .where(
                      and(
                        eq(entitlements.grantedByOrderId, orderId),
                        eq(entitlements.planId, line.refId),
                      ),
                    ),
                ),
              ),
            )
        }
      }

      // A fully refunded driver line must give its fleet days back, or the
      // vehicle stays off the market until someone notices by hand.
      if (line.kind === 'driver' && lineRefunded >= line.lineTotalMinor) {
        if (line.vehicleClass && line.travelDate) {
          await releaseDriverCapacity(
            tx,
            line.vehicleClass as VehicleClass,
            line.travelDate,
            line.endDate ?? line.travelDate,
          )
        }
      }

      await writeAudit(
        {
          actor: session,
          action: 'order.refund',
          entityType: 'order',
          entityId: orderId,
          before: {
            status,
            lineRefundedMinor: line.refundedMinor,
            orderRefundedMinor: alreadyRefunded,
          },
          after: {
            status: nextStatus,
            lineRefundedMinor: lineRefunded,
            orderRefundedMinor: alreadyRefunded + amountMinor,
            orderItemId,
            amountMinor,
            currency: payment.currency,
            reason,
            providerRefundId: result.providerRefundId,
          },
        },
        tx,
      )

      return {
        nextStatus,
        currency: payment.currency,
        manual: payment.provider === 'manual',
        refundId: refundRow?.id ?? null,
        settled: result.status === 'succeeded',
      }
    })

    // بعد الالتزام (الوثيقة 15.1/19.1/20.1): إشعار العميل وسجل نشاطه، وبريد
    // الاسترداد. استرداد مسوّى يأخذ بريد `refund_notice`، فإشعار الحالة بلا بريد
    // (لا رسالتان لنفس الحدث). غير المسوّى بعد يأخذ بريد إشعار الحالة بدلاً منه.
    if (isOrderUpdateStatus(summary.nextStatus)) {
      await notifyOrderUpdated(orderId, summary.nextStatus, {
        by: session.userId,
        item: orderItemId,
        email: !summary.settled,
      })
    }
    // مهمة البريد تعلن المسوّى فقط، وتسجّل `refund_notice:<id>` — فاسترداد معلّق
    // عند المزوّد لا يوضع في الطابور الآن (كان سيُسجَّل "مُرسلاً" بلا مبلغه).
    if (summary.settled && summary.refundId !== null) {
      try {
        const { enqueueEmail } = await import('@/worker/queues')
        await enqueueEmail({ kind: 'refund_notice', orderId, refundId: summary.refundId })
      } catch (error) {
        console.error('[orders] could not queue the refund notice', error)
      }
    }

    const refunded = t('orders.ok_refunded', {
      amount: amountMinor,
      currency: summary.currency,
      status: orderStatusLabel(t, summary.nextStatus),
    })
    outcome = {
      ok: summary.manual ? `${refunded} ${t('orders.ok_refunded_manual')}` : refunded,
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(detail(orderId), outcome))
}

/**
 * Move a paid order to confirmed once the operator has the booking in hand.
 *
 * Never used to move an order to `paid` — only a verified webhook does that,
 * because the provider's success event is the authority and it routinely
 * arrives before the customer returns to the site.
 */
export async function confirmOrder(orderId: string): Promise<void> {
  const session = await requireCapability('orders.fulfil')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    const previous = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
        .limit(1)

      if (!order) throw new Error(t('orders.err_order_gone'))

      const status = order.status as OrderStatus
      assertTransition(status, 'confirmed')

      await tx.update(orders).set({ status: 'confirmed' }).where(eq(orders.id, orderId))
      await tx
        .update(orderItems)
        .set({ fulfilmentStatus: 'confirmed' })
        .where(and(eq(orderItems.orderId, orderId), eq(orderItems.fulfilmentStatus, 'pending')))

      await writeAudit(
        {
          actor: session,
          action: 'order.confirm',
          entityType: 'order',
          entityId: orderId,
          before: { status },
          after: { status: 'confirmed' },
        },
        tx,
      )
      return status
    })

    // بعد الالتزام. تأكيد مكرر (confirmed → confirmed) لا يُبلَّغ مرتين.
    if (previous !== 'confirmed') {
      await notifyOrderUpdated(orderId, 'confirmed', { by: session.userId })
    }
    outcome = { ok: t('orders.ok_confirmed') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(detail(orderId), outcome))
}

/** Mark one line delivered — the itinerary PDF sent, the tour run. */
export async function setLineFulfilment(
  orderId: string,
  orderItemId: string,
  status: string,
): Promise<void> {
  const session = await requireCapability('orders.fulfil')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    const allowed = ['pending', 'confirmed', 'delivered', 'cancelled']
    if (!allowed.includes(status)) throw new Error(t('orders.err_unknown_fulfilment', { status }))

    const previous = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(orderItems)
        .where(and(eq(orderItems.id, orderItemId), eq(orderItems.orderId, orderId)))
        .limit(1)

      if (!before) throw new Error(t('orders.err_line_not_in_order'))
      if (before.fulfilmentStatus === 'refunded') {
        throw new Error(t('orders.err_refunded_line_locked'))
      }

      await tx
        .update(orderItems)
        .set({ fulfilmentStatus: status })
        .where(eq(orderItems.id, orderItemId))

      await writeAudit(
        {
          actor: session,
          action: 'order_item.fulfil',
          entityType: 'order_item',
          entityId: orderItemId,
          before: { fulfilmentStatus: before.fulfilmentStatus },
          after: { fulfilmentStatus: status },
        },
        tx,
      )
      return before.fulfilmentStatus
    })

    // بعد الالتزام: تنفيذ/إلغاء/تأكيد بند يُبلَّغ للعميل. الرجوع إلى `pending` لا.
    if (previous !== status && isOrderUpdateStatus(status)) {
      await notifyOrderUpdated(orderId, status, { by: session.userId, item: orderItemId })
    }
    outcome = { ok: t('orders.ok_line_marked', { status: fulfilmentLabel(t, status) }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(detail(orderId), outcome))
}

/**
 * تسجيل دفع خارج البوابة (تحويل بنكي، نقداً) — "تحديث حالة الطلب" و"ربط الدفع
 * بالصلاحيات" من لوحة التحكم. للمدير فقط (`orders.refund`)، بمرجع إلزامي.
 *
 * نفس ما يفعله webhook الدفع: الطلب `pending → paid` وصف دفع `manual` ناجح،
 * ومنح الباقات في نفس المعاملة، ثم الإشعارات وإيصال PDF بعد الالتزام.
 */
export async function markOrderPaidOffline(orderId: string, form: FormData): Promise<void> {
  const session = await requireCapability('orders.refund')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const reference = (fstr(form, 'reference') ?? '').trim().slice(0, 128)
    if (reference.length < 3) throw new Error(t('orders.err_reference_required'))

    await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
        .limit(1)
      if (!order) throw new Error(t('orders.err_order_gone'))
      const status = order.status as OrderStatus
      if (status !== 'pending')
        throw new Error(t('orders.err_only_pending_paid', { status: orderStatusLabel(t, status) }))
      assertTransition(status, 'paid')

      await tx.update(orders).set({ status: 'paid' }).where(eq(orders.id, orderId))
      // محاولات الدفع بالبطاقة المفتوحة لم تعد مطلوبة. إن دفع العميل بها رغم ذلك
      // يسجّلها الـ webhook دفعة ثانية ناجحة تظهر في Payments لاستردادها.
      await tx
        .update(payments)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(payments.orderId, orderId),
            inArray(payments.status, ['requires_action', 'processing']),
          ),
        )
      await tx.insert(payments).values({
        orderId,
        provider: 'manual',
        method: 'bank_transfer',
        providerPaymentId: `manual:${reference}`,
        status: 'succeeded',
        amountMinor: order.totalMinor,
        currency: order.presentmentCurrency,
        idempotencyKey: `manual:${orderId}:${randomUUID()}`,
        rawPayload: { reference, by: session.userId },
      })
      await grantOrderPlans(tx, orderId)
      await writeAudit(
        {
          actor: session,
          action: 'order.mark_paid_offline',
          entityType: 'order',
          entityId: orderId,
          before: { status },
          after: { status: 'paid', reference },
        },
        tx,
      )
    })

    // الطلب مدفوع فعلاً هنا: فشل الإشعار أو الطابور لا يُظهر خطأً للمشغّل
    // (كان يعيد المحاولة فيُرفض "الطلب ليس معلّقاً" ولا يصل التأكيد أبداً).
    try {
      await notifyOrderPaid(orderId)
      const { enqueueEmail, enqueueVoucherPdf } = await import('@/worker/queues')
      await enqueueEmail({ kind: 'order_confirmation', orderId })
      await enqueueVoucherPdf(orderId)
    } catch (error) {
      console.error('[orders] follow-ups after offline payment failed', error)
    }
    outcome = { ok: t('orders.ok_marked_paid') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(orderId), outcome))
}

/** إصدار/إعادة توليد إيصال PDF للطلب (الوثيقة: "إصدار إيصال"). */
export async function issueReceipt(orderId: string): Promise<void> {
  const session = await requireCapability('orders.fulfil')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const [order] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
    if (!order) throw new Error(t('orders.err_order_gone'))
    if (!['paid', 'confirmed', 'partially_refunded'].includes(order.status)) {
      throw new Error(t('orders.err_receipt_paid_only'))
    }
    const { enqueueVoucherPdf } = await import('@/worker/queues')
    await enqueueVoucherPdf(orderId)
    await writeAudit({
      actor: session,
      action: 'order.receipt',
      entityType: 'order',
      entityId: orderId,
      before: null,
      after: { queued: true },
    })
    outcome = { ok: t('orders.ok_receipt_queued') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(orderId), outcome))
}

type RefundTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * أنواع الوصول للخريطة (بلا باقة) التي يفقدها الطلب باسترداد السطر `lineId`:
 * نوع السطر (VIP إن كان جدول VIP، وإلا map_access)، ما لم يبقَ سطر جدول آخر
 * غير مسترد كلياً "يشمل الخريطة" بالنوع نفسه. سطر "place" قديم يمنح map_access.
 */
async function mapKindsLostWith(
  tx: RefundTx,
  lineId: string,
  lines: readonly (typeof orderItems.$inferSelect)[],
): Promise<string[]> {
  const itineraryIds = lines
    .filter((row) => row.kind === 'itinerary' && row.refId !== null)
    .map((row) => row.refId as string)
  const flags =
    itineraryIds.length === 0
      ? []
      : await tx
          .select({
            id: itineraries.id,
            includesMap: itineraries.includesMap,
            isVip: itineraries.isVip,
          })
          .from(itineraries)
          .where(inArray(itineraries.id, itineraryIds))
  const kindOf = (row: typeof orderItems.$inferSelect): string | null => {
    if (row.kind === 'place') return 'map_access'
    if (row.kind !== 'itinerary') return null
    const flag = flags.find((item) => item.id === row.refId)
    if (!flag?.includesMap) return null
    return flag.isVip ? 'vip' : 'map_access'
  }
  const target = lines.find((row) => row.id === lineId)
  const lost = target ? kindOf(target) : null
  if (lost === null) return []
  const stillCovered = lines.some(
    (row) => row.id !== lineId && row.refundedMinor < row.lineTotalMinor && kindOf(row) === lost,
  )
  return stillCovered ? [] : [lost]
}

/**
 * الوثيقة 4.4: إرسال جدول جاهز اشتراه العميل عبر واتساب — رسالة `pdf_ready_whatsapp`
 * برابط صفحة العرض المحمية في حسابه (`/account/schedules/<بند>/view`)، لا رابط ملف
 * أبداً. يشترط: بند جدول في طلب مسدَّد غير مسترد، وحساب وافق على واتساب وله رقم دولي.
 */
export async function sendItineraryPdfWhatsapp(
  orderId: string,
  orderItemId: string,
): Promise<void> {
  const session = await requireCapability('orders.fulfil')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    const [line] = await db
      .select({
        kind: orderItems.kind,
        nameSnapshot: orderItems.nameSnapshot,
        fulfilmentStatus: orderItems.fulfilmentStatus,
        orderStatus: orders.status,
        userId: orders.userId,
        optIn: users.whatsappOptIn,
        phone: users.phone,
        locale: users.locale,
        deletedAt: users.deletedAt,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(users, eq(users.id, orders.userId))
      .where(and(eq(orderItems.id, orderItemId), eq(orderItems.orderId, orderId)))
      .limit(1)

    if (!line) throw new Error(t('orders.err_line_not_in_order'))
    if (line.kind !== 'itinerary') throw new Error(t('orders.err_itinerary_only'))
    if (!['paid', 'confirmed', 'partially_refunded'].includes(line.orderStatus)) {
      throw new Error(
        t('orders.err_order_not_open', { status: orderStatusLabel(t, line.orderStatus) }),
      )
    }
    if (line.fulfilmentStatus === 'refunded' || line.fulfilmentStatus === 'cancelled') {
      throw new Error(
        t('orders.err_line_not_open', { status: fulfilmentLabel(t, line.fulfilmentStatus) }),
      )
    }
    if (!line.userId || line.deletedAt) throw new Error(t('orders.err_no_account'))
    if (line.optIn !== true) {
      throw new Error(t('orders.err_no_whatsapp_optin'))
    }
    if (toWhatsappNumber(line.phone) === null) {
      throw new Error(t('orders.err_no_intl_phone'))
    }

    const locale = toMailLocale(line.locale)
    const path = `/account/schedules/${orderItemId}/view`
    const notificationId = await notifyUser(
      line.userId,
      'pdf_ready_whatsapp',
      { name: pick(line.nameSnapshot, locale, 'Itinerary'), link: absoluteUrl(path, locale) },
      path,
      { whatsapp: true },
    )
    if (notificationId === null) {
      throw new Error(t('orders.err_whatsapp_queue'))
    }

    await writeAudit({
      actor: session,
      action: 'order_item.pdf_whatsapp',
      entityType: 'order_item',
      entityId: orderItemId,
      before: null,
      after: { orderId, notificationId },
    })
    outcome = { ok: t('orders.ok_whatsapp_queued') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(detail(orderId), outcome))
}
