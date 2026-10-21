import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  StripePaymentProvider,
  encodeForm,
  paymentMethodFromSession,
  sessionStatus,
  verifyStripeSignature,
  webhookType,
} from './stripe'

const SECRET = 'whsec_test_secret'
const sign = (body: string, t: number, secret = SECRET) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`

describe('Stripe signature', () => {
  const body = '{"id":"evt_1","type":"checkout.session.completed"}'
  const now = 1_790_000_000

  it('accepts a valid signature inside the tolerance', () => {
    expect(() => verifyStripeSignature(body, sign(body, now), SECRET, now + 10)).not.toThrow()
  })
  it('accepts when any of several v1 signatures matches (secret rotation)', () => {
    const header = `t=${now},v1=deadbeef,${sign(body, now).split(',')[1]}`
    expect(() => verifyStripeSignature(body, header, SECRET, now)).not.toThrow()
  })
  it('rejects a tampered body, a wrong secret, a replay and a missing header', () => {
    expect(() => verifyStripeSignature(body + ' ', sign(body, now), SECRET, now)).toThrow()
    expect(() => verifyStripeSignature(body, sign(body, now, 'whsec_other'), SECRET, now)).toThrow()
    expect(() => verifyStripeSignature(body, sign(body, now), SECRET, now + 301)).toThrow()
    expect(() => verifyStripeSignature(body, undefined, SECRET, now)).toThrow()
  })
})

describe('Stripe mapping', () => {
  it('only treats a completed session as paid when payment_status is paid', () => {
    expect(webhookType('checkout.session.completed', { id: 'cs', payment_status: 'paid' })).toBe(
      'payment.succeeded',
    )
    // Delayed methods: complete but unpaid → wait for async_payment_succeeded.
    expect(webhookType('checkout.session.completed', { id: 'cs', payment_status: 'unpaid' })).toBe(
      'unknown',
    )
    expect(webhookType('checkout.session.async_payment_succeeded')).toBe('payment.succeeded')
    expect(webhookType('checkout.session.async_payment_failed')).toBe('payment.failed')
    expect(webhookType('checkout.session.expired')).toBe('payment.cancelled')
  })
  it('derives intent status for the reconcile sweep', () => {
    expect(sessionStatus({ id: 'cs', payment_status: 'paid' })).toBe('succeeded')
    expect(sessionStatus({ id: 'cs', status: 'expired', payment_status: 'unpaid' })).toBe(
      'cancelled',
    )
    expect(sessionStatus({ id: 'cs', status: 'open', payment_status: 'unpaid' })).toBe(
      'requires_action',
    )
  })
  it('form-encodes nested line items the way Stripe expects', () => {
    expect(
      encodeForm({ line_items: [{ price_data: { unit_amount: 1900 } }], mode: 'payment' }),
    ).toBe('line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=1900&mode=payment')
  })
})

describe('StripePaymentProvider', () => {
  const calls: { url: string; init: RequestInit }[] = []
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    if (url.endsWith('/checkout/sessions')) {
      return new Response(
        JSON.stringify({
          id: 'cs_test_1',
          url: 'https://checkout.stripe.com/c/pay/cs_test_1',
          status: 'open',
          payment_status: 'unpaid',
          amount_total: 3900,
        }),
        { status: 200 },
      )
    }
    if (url.includes('/checkout/sessions/cs_test_1')) {
      return new Response(
        JSON.stringify({
          id: 'cs_test_1',
          payment_status: 'paid',
          payment_intent: 'pi_1',
          amount_total: 3900,
          currency: 'usd',
        }),
        { status: 200 },
      )
    }
    if (url.endsWith('/refunds')) {
      return new Response(JSON.stringify({ id: 're_1', status: 'succeeded', amount: 1000 }), {
        status: 200,
      })
    }
    return new Response(JSON.stringify({ error: { message: 'nope', code: 'resource_missing' } }), {
      status: 404,
    })
  }) as unknown as typeof fetch

  const provider = new StripePaymentProvider('sk_test_x', SECRET, fakeFetch)

  it('creates a hosted session with an idempotency key and redirects to it', async () => {
    const intent = await provider.createIntent({
      orderId: '00000000-0000-4000-8000-000000000001',
      orderNumber: 'BT-2026-0001',
      amountMinor: 3900,
      currency: 'USD',
      idempotencyKey: 'idem-1',
      customer: { email: 'a@test.dev', locale: 'ar' },
      returnUrl: 'https://bali.example/en/checkout/return?k=1',
    })
    expect(intent.providerPaymentId).toBe('cs_test_1')
    expect(intent.nextAction).toEqual({
      type: 'redirect',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    })
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toBe('idem-1')
    expect(String(calls[0]?.init.body)).toContain('locale=ar')
    expect(String(calls[0]?.init.body)).toContain('unit_amount%5D=3900')
    // Dynamic payment methods: cards + Apple Pay / Google Pay come from the
    // Dashboard settings; an explicit list would switch the wallets off.
    expect(String(calls[0]?.init.body)).not.toContain('payment_method_types')
  })
  it('refuses a three-decimal amount Stripe would reject', async () => {
    await expect(
      provider.createIntent({
        orderId: 'o',
        orderNumber: 'n',
        amountMinor: 12345,
        currency: 'KWD',
        idempotencyKey: 'k',
        customer: { email: 'a@test.dev', locale: 'en' },
        returnUrl: 'https://x',
      }),
    ).rejects.toThrow(/must end in 0/)
  })
  it('refunds against the session payment intent', async () => {
    const result = await provider.refund({
      providerPaymentId: 'cs_test_1',
      amountMinor: 1000,
      currency: 'USD',
      idempotencyKey: 'r1',
    })
    expect(result).toMatchObject({
      providerRefundId: 're_1',
      status: 'succeeded',
      amountMinor: 1000,
    })
    expect(String(calls.at(-1)?.init.body)).toContain('payment_intent=pi_1')
  })
  it('parses a signed checkout.session.completed into payment.succeeded for that session', async () => {
    const body = JSON.stringify({
      id: 'evt_9',
      type: 'checkout.session.completed',
      data: {
        object: {
          object: 'checkout.session',
          id: 'cs_test_1',
          payment_status: 'paid',
          amount_total: 3900,
          currency: 'usd',
        },
      },
    })
    const event = await provider.parseWebhook(body, {
      'stripe-signature': sign(body, Math.floor(Date.now() / 1000)),
    })
    expect(event).toMatchObject({
      providerEventId: 'evt_9',
      type: 'payment.succeeded',
      providerPaymentId: 'cs_test_1',
      amountMinor: 3900,
      currency: 'USD',
    })
  })
})

describe('payment method (22.7)', () => {
  it('reports the wallet for Apple Pay and Google Pay card payments', () => {
    expect(
      paymentMethodFromSession({
        id: 'cs',
        payment_intent: {
          id: 'pi',
          payment_method: { type: 'card', card: { wallet: { type: 'apple_pay' } } },
        },
      }),
    ).toBe('apple_pay')
    expect(
      paymentMethodFromSession({
        id: 'cs',
        payment_intent: {
          id: 'pi',
          latest_charge: {
            payment_method_details: { type: 'card', card: { wallet: { type: 'google_pay' } } },
          },
        },
      }),
    ).toBe('google_pay')
  })
  it('reports a plain card and other method types', () => {
    expect(
      paymentMethodFromSession({
        id: 'cs',
        payment_intent: { id: 'pi', payment_method: { type: 'card', card: { wallet: null } } },
      }),
    ).toBe('card')
    expect(
      paymentMethodFromSession({
        id: 'cs',
        payment_intent: { id: 'pi', payment_method: { type: 'link' } },
      }),
    ).toBe('link')
  })
  it('returns null when nothing was expanded', () => {
    expect(paymentMethodFromSession({ id: 'cs', payment_intent: 'pi_1' })).toBeNull()
    expect(paymentMethodFromSession({ id: 'cs' })).toBeNull()
  })
})
