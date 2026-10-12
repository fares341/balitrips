/**
 * Stripe — صفحة دفع مستضافة (Checkout Session).
 *
 * لماذا Checkout وليس عناصر الدفع داخل الموقع؟ بيانات البطاقة لا تمر بخوادمنا
 * إطلاقاً (أبسط مستوى PCI: SAQ-A)، و3-D Secure وApple Pay وGoogle Pay
 * وMada (عبر Stripe في السعودية) تأتي جاهزة، والصفحة تدعم العربية.
 *
 * التعيين إلى واجهة `PaymentProvider`:
 *  - `providerPaymentId` = معرّف الجلسة `cs_…` (هو ما يحمله webhook
 *    `checkout.session.*`، فالمطابقة مع جدول `payments` مباشرة)
 *  - `createIntent`  → POST /v1/checkout/sessions ← إعادة توجيه إلى `url`
 *  - `getIntent`     → GET  /v1/checkout/sessions/:id (لمهمة reconcile)
 *  - `refund`        → GET الجلسة ← `payment_intent` ← POST /v1/refunds
 *  - `parseWebhook`  → تحقق من `Stripe-Signature` (HMAC-SHA256، نافذة 5 دقائق)
 *
 * بلا SDK: أربع نقاط نهاية، و`fetch` يكفي، واعتمادية أقل في الحاوية.
 *
 * ⚠︎ العملات بثلاث خانات عشرية (BHD, KWD, OMR, JOD, TND): Stripe يقبل المبلغ
 * بثلاث خانات لكن آخر رقم يجب أن يكون صفراً. نرفض المبلغ غير المتوافق بدل
 * تقريبه بصمت.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

import { isPlaceholderEmail } from '@/lib/auth/phone'

import {
  normalisePaymentMethod,
  PaymentProviderError,
  type CreateIntentInput,
  type PaymentIntent,
  type PaymentProvider,
  type PaymentStatus,
  type RefundInput,
  type RefundResult,
  type WebhookEvent,
} from './types'

const API = 'https://api.stripe.com/v1'
const SIGNATURE_TOLERANCE_SECONDS = 300
const THREE_DECIMAL = new Set(['BHD', 'KWD', 'OMR', 'JOD', 'TND'])
const STRIPE_LOCALES = new Set(['ar', 'en', 'id'])

type Fetch = typeof fetch

/** ترميز form كما يتوقعه Stripe، بما فيه المفاتيح المتداخلة `a[b][0][c]`. */
export function encodeForm(value: unknown, prefix = '', out: string[] = []): string {
  if (value === null || value === undefined) return out.join('&')
  if (Array.isArray(value)) {
    value.forEach((item, index) => encodeForm(item, `${prefix}[${index}]`, out))
  } else if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      encodeForm(item, prefix === '' ? key : `${prefix}[${key}]`, out)
    }
  } else {
    out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`)
  }
  return out.join('&')
}

interface StripeSession {
  id: string
  url?: string | null
  status?: 'open' | 'complete' | 'expired'
  payment_status?: 'paid' | 'unpaid' | 'no_payment_required'
  amount_total?: number | null
  currency?: string | null
  payment_intent?: string | StripeExpandedIntent | null
}

/** Only the fields `paymentMethodFromSession` reads, when expanded. */
interface StripeWalletDetails {
  type?: string | null
  wallet?: { type?: string | null } | null
}
interface StripeExpandedIntent {
  id: string
  payment_method?:
    | string
    | { id?: string; type?: string | null; card?: StripeWalletDetails | null }
    | null
  latest_charge?:
    | string
    | {
        id?: string
        payment_method_details?: {
          type?: string | null
          card?: StripeWalletDetails | null
        } | null
      }
    | null
}

/**
 * طريقة الدفع من جلسة موسّعة (`payment_intent.payment_method` و
 * `payment_intent.latest_charge`). محفظة البطاقة (Apple/Google Pay) تُفضَّل على
 * 'card' لأنها ما يعنيه "طريقة الدفع" للفريق.
 */
export function paymentMethodFromSession(session: StripeSession): string | null {
  const intent = session.payment_intent
  if (!intent || typeof intent === 'string') return null

  const pm = typeof intent.payment_method === 'object' ? intent.payment_method : null
  const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null
  const details = charge?.payment_method_details ?? null

  const type = pm?.type ?? details?.type ?? null
  const wallet = pm?.card?.wallet?.type ?? details?.card?.wallet?.type ?? null
  if (type === 'card' && wallet) return normalisePaymentMethod(wallet)
  return normalisePaymentMethod(type)
}

export function sessionStatus(session: StripeSession): PaymentStatus {
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    return 'succeeded'
  }
  if (session.status === 'expired') return 'cancelled'
  if (session.status === 'complete') return 'processing' // دفع مؤجل (تحويل بنكي…) لم يُسوَّ بعد
  return 'requires_action'
}

/** يتحقق من رأس `Stripe-Signature: t=…,v1=…[,v1=…]`. يرمي عند الفشل. */
export function verifyStripeSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): void {
  if (!header) throw new PaymentProviderError('missing Stripe-Signature', 'invalid_signature')

  let timestamp: number | null = null
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2)
    if (key === 't' && value) timestamp = Number.parseInt(value, 10)
    if (key === 'v1' && value) signatures.push(value)
  }
  if (timestamp === null || !Number.isFinite(timestamp) || signatures.length === 0) {
    throw new PaymentProviderError('malformed Stripe-Signature', 'invalid_signature')
  }
  // يمنع إعادة تشغيل حدث قديم ملتقط.
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new PaymentProviderError(
      'Stripe signature timestamp outside tolerance',
      'invalid_signature',
    )
  }

  const expected = Buffer.from(
    createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex'),
  )
  const ok = signatures.some((signature) => {
    const given = Buffer.from(signature)
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
  if (!ok) throw new PaymentProviderError('invalid Stripe signature', 'invalid_signature')
}

export function webhookType(stripeType: string, session?: StripeSession): WebhookEvent['type'] {
  switch (stripeType) {
    case 'checkout.session.completed':
      // بطاقة: مدفوعة الآن. طريقة مؤجلة: "complete" لكن غير مدفوعة بعد — ننتظر
      // async_payment_succeeded بدل اعتبارها مدفوعة.
      return session?.payment_status === 'paid' || session?.payment_status === 'no_payment_required'
        ? 'payment.succeeded'
        : 'unknown'
    case 'checkout.session.async_payment_succeeded':
      return 'payment.succeeded'
    case 'checkout.session.async_payment_failed':
      return 'payment.failed'
    case 'checkout.session.expired':
      return 'payment.cancelled'
    default:
      return 'unknown'
  }
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe'

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    if (!secretKey.startsWith('sk_')) {
      throw new Error('STRIPE_SECRET_KEY must be a secret key (sk_live_… or sk_test_…)')
    }
    if (!webhookSecret.startsWith('whsec_')) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be the endpoint signing secret (whsec_…)')
    }
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      'Stripe-Version': '2024-06-20',
    }
    if (body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded'
    if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey

    let response: Response
    try {
      response = await this.fetchImpl(`${API}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : encodeForm(body),
        cache: 'no-store',
      })
    } catch (error) {
      throw new PaymentProviderError(`Stripe unreachable: ${String(error)}`, 'network', true)
    }

    const json = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string; type?: string }
    } & T
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500
      throw new PaymentProviderError(
        json.error?.message ?? `Stripe HTTP ${response.status}`,
        json.error?.code ?? json.error?.type ?? `http_${response.status}`,
        retryable,
      )
    }
    return json
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new PaymentProviderError('amountMinor must be a positive integer', 'invalid_amount')
    }
    const currency = input.currency.toUpperCase()
    if (THREE_DECIMAL.has(currency) && input.amountMinor % 10 !== 0) {
      throw new PaymentProviderError(
        `${currency} amounts must end in 0 for Stripe (got ${input.amountMinor})`,
        'invalid_amount',
      )
    }

    const session = await this.call<StripeSession>(
      'POST',
      '/checkout/sessions',
      {
        mode: 'payment',
        client_reference_id: input.orderId,
        // Phone-only accounts have a reserved, undeliverable address — let
        // Stripe Checkout ask for a receipt e-mail instead.
        ...(isPlaceholderEmail(input.customer.email)
          ? {}
          : { customer_email: input.customer.email }),
        locale: STRIPE_LOCALES.has(input.customer.locale) ? input.customer.locale : 'auto',
        success_url: input.returnUrl,
        cancel_url: input.returnUrl,
        // 35 دقيقة. حد Stripe الأدنى 30 دقيقة **من وقت استلامه الطلب**، فـ 30 بالضبط
        // تُرفض مع أي تأخير شبكة أو فرق ساعة. حجز السعة في worker ساعة كاملة
        // (capacity.release-expired)، فالجلسة تنتهي قبله دائماً.
        expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: input.amountMinor,
              product_data: { name: `Bali Trips — ${input.orderNumber}` },
            },
          },
        ],
        payment_intent_data: {
          description: `Order ${input.orderNumber}`,
          statement_descriptor_suffix: input.statementDescriptor?.slice(0, 22),
          metadata: { orderId: input.orderId, orderNumber: input.orderNumber },
        },
        metadata: { orderId: input.orderId, orderNumber: input.orderNumber, ...input.metadata },
      },
      input.idempotencyKey,
    )

    if (!session.url) {
      throw new PaymentProviderError('Stripe returned a session without a URL', 'invalid_response')
    }
    return {
      providerPaymentId: session.id,
      status: sessionStatus(session),
      amountMinor: session.amount_total ?? input.amountMinor,
      currency,
      nextAction: { type: 'redirect', url: session.url },
      raw: { id: session.id },
    }
  }

  async getIntent(providerPaymentId: string): Promise<PaymentIntent> {
    const session = await this.call<StripeSession>(
      'GET',
      `/checkout/sessions/${encodeURIComponent(providerPaymentId)}`,
    )
    return {
      providerPaymentId: session.id,
      status: sessionStatus(session),
      amountMinor: session.amount_total ?? 0,
      currency: (session.currency ?? '').toUpperCase(),
      nextAction:
        session.status === 'open' && session.url ? { type: 'redirect', url: session.url } : null,
      raw: { id: session.id, status: session.status, payment_status: session.payment_status },
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const session = await this.call<StripeSession>(
      'GET',
      `/checkout/sessions/${encodeURIComponent(input.providerPaymentId)}`,
    )
    const paymentIntent =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id
    if (!paymentIntent) {
      throw new PaymentProviderError('That session has no payment to refund', 'not_refundable')
    }

    const refund = await this.call<{ id: string; status: string; amount: number }>(
      'POST',
      '/refunds',
      {
        payment_intent: paymentIntent,
        amount: input.amountMinor,
        reason: 'requested_by_customer',
        metadata: input.reason ? { reason: input.reason.slice(0, 500) } : undefined,
      },
      input.idempotencyKey,
    )
    return {
      providerRefundId: refund.id,
      status:
        refund.status === 'succeeded'
          ? 'succeeded'
          : refund.status === 'failed'
            ? 'failed'
            : 'pending',
      amountMinor: refund.amount,
      raw: { id: refund.id, status: refund.status },
    }
  }

  async cancelIntent(providerPaymentId: string): Promise<boolean> {
    try {
      const session = await this.call<StripeSession>(
        'POST',
        `/checkout/sessions/${encodeURIComponent(providerPaymentId)}/expire`,
        {},
      )
      return sessionStatus(session) === 'cancelled'
    } catch (error) {
      if (!(error instanceof PaymentProviderError) || error.retryable) throw error
      // 400 = not open any more. Paid, settling, or already expired? Ask —
      // only "expired without payment" is safe to treat as closed.
      const current = await this.getIntent(providerPaymentId)
      return current.status === 'cancelled'
    }
  }

  async getPaymentMethod(providerPaymentId: string): Promise<string | null> {
    const session = await this.call<StripeSession>(
      'GET',
      `/checkout/sessions/${encodeURIComponent(providerPaymentId)}?${encodeForm({
        expand: ['payment_intent.payment_method', 'payment_intent.latest_charge'],
      })}`,
    )
    return paymentMethodFromSession(session)
  }

  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent> {
    verifyStripeSignature(
      rawBody,
      headers['stripe-signature'] ?? headers['Stripe-Signature'],
      this.webhookSecret,
    )

    const event = JSON.parse(rawBody) as {
      id?: string
      type?: string
      data?: { object?: StripeSession & { object?: string } }
    }
    if (!event.id || !event.type)
      throw new PaymentProviderError('webhook missing id/type', 'invalid_payload')

    const object = event.data?.object
    const isSession = object?.object === 'checkout.session'
    return {
      providerEventId: event.id,
      type: isSession ? webhookType(event.type, object) : 'unknown',
      providerPaymentId: isSession ? (object?.id ?? null) : null,
      amountMinor: isSession ? (object?.amount_total ?? null) : null,
      currency: isSession && object?.currency ? object.currency.toUpperCase() : null,
      raw: { id: event.id, type: event.type },
    }
  }
}
