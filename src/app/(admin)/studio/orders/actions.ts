'use server'

import { randomUUID } from 'node:crypto'

import { and, eq, inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { orderItems, orders, payments, refunds } from '@/db/schema'
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
import { notifyOrderPaid } from '@/lib/notify/orders'
import { revokeOrderEntitlements } from '@/lib/orders/webhook'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fminor, fstr, fuuid } from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

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
  let outcome: Outcome

  try {
    const orderItemId = fuuid(form, 'orderItemId', 'Order line')
    const amountMinor = fminor(form, 'amountMinor', 'Refund amount')
    const reason = fstr(form, 'reason')

    if (amountMinor <= 0) throw new Error('Refund amount must be greater than zero')

    const summary = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
        .limit(1)

      if (!order) throw new Error('That order no longer exists')

      const status = order.status as OrderStatus
      if (!isRefundable(status)) {
        throw new Error(`An order in status "${status}" cannot be refunded.`)
      }

      const lines = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId))

      const line = lines.find((row) => row.id === orderItemId)
      if (!line) throw new Error('That line does not belong to this order')

      const lineRemaining = line.lineTotalMinor - line.refundedMinor
      if (amountMinor > lineRemaining) {
        throw new Error(
          `That line has ${lineRemaining} minor units left to refund; ${amountMinor} was requested.`,
        )
      }

      const alreadyRefunded = lines.reduce((total, row) => total + row.refundedMinor, 0)

      // Throws if the refund would exceed the order total. Refunding more
      // than was charged is never correct.
      const nextStatus = statusAfterRefund(status, order.totalMinor, alreadyRefunded, amountMinor)
      assertTransition(status, nextStatus)

      const [payment] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, orderId), eq(payments.status, 'succeeded')))
        .limit(1)

      if (!payment?.providerPaymentId) {
        throw new Error('No settled payment found for this order, so there is nothing to refund.')
      }

      const provider = getPaymentProvider()

      // Derived from the line and the amount already refunded, so a retried
      // submit resolves to the same key and the provider refuses to refund
      // twice.
      const idempotencyKey = `refund:${orderItemId}:${line.refundedMinor}:${amountMinor}`

      const result = await provider.refund({
        providerPaymentId: payment.providerPaymentId,
        amountMinor,
        currency: payment.currency,
        reason: reason ?? undefined,
        idempotencyKey,
      })

      await tx.insert(refunds).values({
        paymentId: payment.id,
        orderItemId,
        amountMinor,
        currency: payment.currency,
        reason,
        actorId: session.userId,
        providerRefundId: result.providerRefundId,
        status: result.status,
      })

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
        await revokeOrderEntitlements(tx, orderId, `line refunded by ${session.email}`)
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

      return { nextStatus, currency: payment.currency }
    })

    outcome = {
      ok: `Refunded ${amountMinor} ${summary.currency} minor units. Order is now ${summary.nextStatus.replace(/_/g, ' ')}.`,
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
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
        .limit(1)

      if (!order) throw new Error('That order no longer exists')

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
    })

    outcome = { ok: 'Order confirmed.' }
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
  let outcome: Outcome

  try {
    const allowed = ['pending', 'confirmed', 'delivered', 'cancelled']
    if (!allowed.includes(status)) throw new Error(`Unknown fulfilment status "${status}"`)

    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(orderItems)
        .where(and(eq(orderItems.id, orderItemId), eq(orderItems.orderId, orderId)))
        .limit(1)

      if (!before) throw new Error('That line does not belong to this order')
      if (before.fulfilmentStatus === 'refunded') {
        throw new Error('A refunded line cannot change fulfilment status.')
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
    })

    outcome = { ok: `Line marked ${status}.` }
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
  let outcome: Outcome
  try {
    const reference = (fstr(form, 'reference') ?? '').trim().slice(0, 128)
    if (reference.length < 3) throw new Error('Enter the transfer or receipt reference.')

    await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
        .limit(1)
      if (!order) throw new Error('That order no longer exists')
      const status = order.status as OrderStatus
      if (status !== 'pending')
        throw new Error(`Only pending orders can be marked paid (this one is ${status}).`)
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

    await notifyOrderPaid(orderId)
    try {
      const { enqueueEmail, enqueueVoucherPdf } = await import('@/worker/queues')
      await enqueueEmail({ kind: 'order_confirmation', orderId })
      await enqueueVoucherPdf(orderId)
    } catch (error) {
      console.error('[orders] follow-ups after offline payment failed', error)
    }
    outcome = { ok: 'Marked paid. Access granted, customer notified, receipt queued.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(orderId), outcome))
}

/** إصدار/إعادة توليد إيصال PDF للطلب (الوثيقة: "إصدار إيصال"). */
export async function issueReceipt(orderId: string): Promise<void> {
  const session = await requireCapability('orders.fulfil')
  let outcome: Outcome
  try {
    const [order] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
    if (!order) throw new Error('That order no longer exists')
    if (!['paid', 'confirmed', 'partially_refunded'].includes(order.status)) {
      throw new Error('Receipts are issued for paid orders only.')
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
    outcome = { ok: 'Receipt queued. It is ready to download in a minute.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(orderId), outcome))
}
