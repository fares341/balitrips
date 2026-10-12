import { createHmac, timingSafeEqual } from 'node:crypto'

import {
  PaymentProviderError,
  type CreateIntentInput,
  type PaymentIntent,
  type PaymentProvider,
  type RefundInput,
  type RefundResult,
  type WebhookEvent,
} from './types'
import { sandboxPaymentsAllowed } from '@/lib/live-mode'

/**
 * Sandbox provider.
 *
 * Lets the whole checkout — intent, 3-D Secure redirect, webhook-driven
 * confirmation, replay protection, partial refunds — be built and tested
 * end to end while the real PSP decision is still open. It deliberately
 * mimics the awkward parts of real providers rather than the happy path:
 * a redirect step is always required, and confirmation only arrives by
 * webhook, never from the redirect itself.
 *
 * NEVER usable on a server that takes real money: constructing it requires
 * ALLOW_SANDBOX_PAYMENTS=true, which no real deployment sets.
 */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox'

  constructor(
    private readonly webhookSecret: string,
    private readonly baseUrl: string,
  ) {
    // Same reasoning as the registry: NODE_ENV is inlined at build time, so
    // a check against it here is decided by the compiler rather than the
    // deployment. getPaymentProvider() owns the runtime gate.
    if (!sandboxPaymentsAllowed()) {
      throw new Error(
        'SandboxPaymentProvider requires ALLOW_SANDBOX_PAYMENTS=true. It must never ' +
          'be reachable on a server that takes real money.',
      )
    }
  }

  async createIntent(input: CreateIntentInput): Promise<PaymentIntent> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor < 0) {
      throw new PaymentProviderError(
        `amountMinor must be a non-negative integer, got ${input.amountMinor}`,
        'invalid_amount',
      )
    }

    const providerPaymentId = `sbx_${input.idempotencyKey.slice(0, 24)}`

    return {
      providerPaymentId,
      // Always requires a step-up, so the code path that handles 3-D Secure
      // is exercised in development rather than discovered in production.
      status: 'requires_action',
      amountMinor: input.amountMinor,
      currency: input.currency,
      nextAction: {
        type: 'redirect',
        url: `${this.baseUrl}/api/payments/sandbox/challenge?intent=${providerPaymentId}&return=${encodeURIComponent(input.returnUrl)}`,
      },
      raw: { sandbox: true, orderNumber: input.orderNumber },
    }
  }

  async getIntent(providerPaymentId: string): Promise<PaymentIntent> {
    return {
      providerPaymentId,
      status: 'processing',
      amountMinor: 0,
      currency: 'USD',
      nextAction: null,
      raw: { sandbox: true },
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (input.amountMinor !== undefined && !Number.isInteger(input.amountMinor)) {
      throw new PaymentProviderError('refund amount must be an integer', 'invalid_amount')
    }
    return {
      providerRefundId: `sbxr_${input.idempotencyKey.slice(0, 24)}`,
      status: 'succeeded',
      amountMinor: input.amountMinor ?? 0,
      raw: { sandbox: true },
    }
  }

  async cancelIntent(): Promise<void> {
    // Sandbox intents have no server-side state to close.
  }

  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent> {
    const provided = headers['x-sandbox-signature'] ?? headers['X-Sandbox-Signature']
    if (!provided) {
      throw new PaymentProviderError('missing webhook signature', 'invalid_signature')
    }

    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(provided)
    // Length check first: timingSafeEqual throws on a length mismatch.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new PaymentProviderError('invalid webhook signature', 'invalid_signature')
    }

    const parsed = JSON.parse(rawBody) as {
      id?: string
      type?: string
      paymentId?: string
      amountMinor?: number
      currency?: string
    }

    if (!parsed.id) {
      throw new PaymentProviderError('webhook missing event id', 'invalid_payload')
    }

    return {
      providerEventId: parsed.id,
      type: normaliseType(parsed.type),
      providerPaymentId: parsed.paymentId ?? null,
      amountMinor: parsed.amountMinor ?? null,
      currency: parsed.currency ?? null,
      raw: parsed,
    }
  }
}

function normaliseType(type: string | undefined): WebhookEvent['type'] {
  switch (type) {
    case 'payment.succeeded':
    case 'payment.failed':
    case 'payment.cancelled':
    case 'refund.succeeded':
      return type
    default:
      return 'unknown'
  }
}
