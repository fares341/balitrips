/**
 * طريقة الدفع (الوثيقة 22.7) — تُسجَّل بعد التسوية، بأفضل جهد.
 *
 * لا تمسّ حالة الطلب ولا ترمي أبداً: تُستدعى بعد إرسال رد الـ webhook
 * (`after()`)، فبطء Stripe أو فشله لا يؤخّر تأكيد دفع ولا يدفع المزوّد لإعادة
 * المحاولة. تكتب فقط إن كانت القيمة فارغة، فالتكرار آمن.
 *
 * Server-only.
 */

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { payments } from '@/db/schema'
import { normalisePaymentMethod, type PaymentProvider } from '@/lib/payments'

const LOOKUP_TIMEOUT_MS = 8_000

export async function recordPaymentMethod(
  provider: PaymentProvider,
  providerPaymentId: string | null,
): Promise<string | null> {
  if (providerPaymentId === null || provider.getPaymentMethod === undefined) return null
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS)
    })
    const method = normalisePaymentMethod(
      await Promise.race([provider.getPaymentMethod(providerPaymentId), timeout]).finally(() =>
        clearTimeout(timer),
      ),
    )
    if (method === null) return null
    await db
      .update(payments)
      .set({ method })
      .where(
        and(
          eq(payments.provider, provider.name),
          eq(payments.providerPaymentId, providerPaymentId),
          isNull(payments.method),
        ),
      )
    return method
  } catch (error) {
    console.error('[payments] could not record the payment method', {
      provider: provider.name,
      providerPaymentId,
      error,
    })
    return null
  }
}
