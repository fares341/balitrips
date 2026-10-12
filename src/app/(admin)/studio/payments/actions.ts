'use server'

import { and, asc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { payments, refunds } from '@/db/schema'
import { getPaymentProvider } from '@/lib/payments'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fuuid } from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome, type ActionOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

/**
 * استرداد دفعة مكررة: طلب سُدّد مرتين (تحويل بنكي سجّلته الإدارة، ثم أكمل
 * العميل الدفع بالبطاقة). الدفعة الزائدة تُسترد كاملة دون أن تمسّ حالة الطلب
 * أو صلاحياته — الطلب مدفوع فعلاً بالدفعة الأولى.
 *
 * مسموح فقط لدفعة ناجحة ليست أول دفعة ناجحة للطلب.
 */
export async function refundDuplicatePayment(form: FormData): Promise<void> {
  const session = await requireCapability('orders.refund')
  const target = adminHref('/payments')
  let outcome: ActionOutcome
  try {
    const paymentId = fuuid(form, 'paymentId', 'Payment')
    const summary = await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for('update')
        .limit(1)
      if (!payment) throw new Error('That payment no longer exists.')
      if (payment.status !== 'succeeded')
        throw new Error('Only a succeeded payment can be refunded.')

      const settled = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.orderId, payment.orderId), eq(payments.status, 'succeeded')))
        .orderBy(asc(payments.createdAt))
      if (settled[0]?.id === payment.id) {
        throw new Error(
          'This is the payment that paid the order. Refund order lines from the order page instead.',
        )
      }

      let providerRefundId: string | null = null
      let status = 'succeeded'
      if (payment.provider !== 'manual') {
        const provider = getPaymentProvider()
        if (provider.name !== payment.provider || !payment.providerPaymentId) {
          throw new Error(
            `Paid through ${payment.provider}; refund it in that provider's dashboard.`,
          )
        }
        const result = await provider.refund({
          providerPaymentId: payment.providerPaymentId,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          reason: 'duplicate',
          idempotencyKey: `duplicate-refund:${payment.id}`,
        })
        providerRefundId = result.providerRefundId
        status = result.status
      }

      await tx.insert(refunds).values({
        paymentId: payment.id,
        orderItemId: null,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        reason: 'duplicate payment',
        actorId: session.userId,
        providerRefundId,
        status,
      })
      await tx.update(payments).set({ status: 'refunded' }).where(eq(payments.id, payment.id))
      await writeAudit(
        {
          actor: session,
          action: 'payment.refund_duplicate',
          entityType: 'order',
          entityId: payment.orderId,
          before: { paymentId: payment.id, status: payment.status },
          after: { status: 'refunded', amountMinor: payment.amountMinor, providerRefundId },
        },
        tx,
      )
      return { manual: payment.provider === 'manual' }
    })
    outcome = {
      ok: summary.manual
        ? 'Duplicate payment marked refunded. Send the money back by bank transfer.'
        : 'Duplicate payment refunded. The order and its access are unchanged.',
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}
