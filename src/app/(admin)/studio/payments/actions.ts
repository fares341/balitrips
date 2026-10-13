'use server'

import { and, asc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { payments, refunds } from '@/db/schema'
import { getPaymentProvider } from '@/lib/payments'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fuuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
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
  const { t } = await getAdminI18n()
  const target = adminHref('/payments')
  let outcome: ActionOutcome
  try {
    const paymentId = fuuid(form, 'paymentId', t('payments.field_payment'))
    const summary = await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .for('update')
        .limit(1)
      if (!payment) throw new Error(t('payments.err_gone'))
      if (payment.status !== 'succeeded') throw new Error(t('payments.err_not_succeeded'))

      const settled = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.orderId, payment.orderId), eq(payments.status, 'succeeded')))
        .orderBy(asc(payments.createdAt))
      if (settled[0]?.id === payment.id) {
        throw new Error(t('payments.err_paid_the_order'))
      }

      let providerRefundId: string | null = null
      let status = 'succeeded'
      if (payment.provider !== 'manual') {
        const provider = getPaymentProvider()
        if (provider.name !== payment.provider || !payment.providerPaymentId) {
          throw new Error(t('payments.err_other_provider', { provider: payment.provider }))
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
      ok: summary.manual ? t('payments.ok_refunded_manual') : t('payments.ok_refunded'),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}
