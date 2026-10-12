/**
 * Payment provider abstraction.
 *
 * The entity and PSP decision is deferred, so checkout is built against
 * this interface rather than any vendor's SDK. Orders, payments and refunds
 * are OUR tables; a provider's id is a column on them, never the source of
 * truth. Swapping or adding a provider is an adapter, not a rewrite — and
 * different markets can run different providers later.
 *
 * Two constraints are baked in deliberately, because retrofitting them
 * would mean rewriting checkout:
 *
 * 1. There is no authorise-then-capture-later flow. Several rails a global
 *    travel merchant will want support neither authorisation-only nor
 *    partial capture, and turn voids into refunds. Deposits and balances
 *    must therefore be two independent full charges. Designing for the more
 *    restrictive rail costs nothing and avoids a rewrite.
 *
 * 2. Every intent requires 3-D Secure. There is no non-3DS path to build
 *    one into later.
 */

export type PaymentStatus = 'requires_action' | 'processing' | 'succeeded' | 'failed' | 'cancelled'

export interface CreateIntentInput {
  orderId: string
  orderNumber: string
  /** Integer minor units. Never a float. */
  amountMinor: number
  currency: string
  /** Enforced at the database level too, via a unique index. */
  idempotencyKey: string
  customer: {
    email: string
    name?: string
    country?: string
    locale: string
  }
  /** Where the provider returns the customer after any step-up challenge. */
  returnUrl: string
  /** Shown on the cardholder's statement. Recognisable descriptors reduce disputes. */
  statementDescriptor?: string
  metadata?: Record<string, string>
}

export interface PaymentIntent {
  providerPaymentId: string
  status: PaymentStatus
  amountMinor: number
  currency: string
  /**
   * Where to send the customer for 3-D Secure, or a client secret for an
   * in-page element. Null when no further action is needed.
   */
  nextAction: { type: 'redirect'; url: string } | { type: 'client_secret'; secret: string } | null
  raw: unknown
}

export interface RefundInput {
  providerPaymentId: string
  /** Omit for a full refund. Partial refunds are first-class. */
  amountMinor?: number
  currency: string
  reason?: string
  idempotencyKey: string
}

export interface RefundResult {
  providerRefundId: string
  status: 'pending' | 'succeeded' | 'failed'
  amountMinor: number
  raw: unknown
}

/**
 * A verified, normalised webhook event.
 *
 * Providers routinely deliver the success event BEFORE the customer returns
 * to the site, deliver events out of order, and replay them. Order state is
 * driven from here rather than from the redirect, and `providerEventId` is
 * uniquely indexed so a replay is a no-op.
 */
export interface WebhookEvent {
  providerEventId: string
  type:
    | 'payment.succeeded'
    | 'payment.failed'
    | 'payment.cancelled'
    | 'refund.succeeded'
    | 'unknown'
  providerPaymentId: string | null
  amountMinor: number | null
  currency: string | null
  raw: unknown
}

export interface PaymentProvider {
  readonly name: string

  createIntent(input: CreateIntentInput): Promise<PaymentIntent>

  /** Re-read authoritative state. Used by the reconciliation job. */
  getIntent(providerPaymentId: string): Promise<PaymentIntent>

  refund(input: RefundInput): Promise<RefundResult>

  /**
   * Close an unpaid intent so it can no longer be paid. Resolves `true` only
   * when the provider confirms the intent is now closed WITHOUT payment;
   * `false` when it was paid, is settling, or its state is unknown. Callers
   * cancel the order only on `true` — never on a guess, or a customer who
   * paid in another tab ends up charged against a cancelled order.
   */
  cancelIntent?(providerPaymentId: string): Promise<boolean>

  /**
   * Verify the signature and parse. MUST throw on an invalid signature —
   * an unverified webhook is an unauthenticated request to change order
   * state, which is as sensitive as it gets.
   */
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent>
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean = false,
  ) {
    super(message)
    this.name = 'PaymentProviderError'
  }
}
