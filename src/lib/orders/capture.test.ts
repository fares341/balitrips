import { describe, expect, it } from 'vitest'

import { authorizationExpired, captureModeFor } from './capture'
import { canTransition, statusForWebhook } from './state'
import { webhookType } from '@/lib/payments/stripe'

describe('captureModeFor', () => {
  it('holds the card for anything a supplier runs', () => {
    expect(captureModeFor(['activity'])).toBe('manual')
    expect(captureModeFor(['itinerary', 'activity_tier'])).toBe('manual')
    expect(captureModeFor(['package', 'discount'])).toBe('manual')
  })

  it('charges digital products at once', () => {
    expect(captureModeFor(['itinerary'])).toBe('automatic')
    expect(captureModeFor(['plan', 'discount'])).toBe('automatic')
    expect(captureModeFor(['custom'])).toBe('automatic')
  })
})

describe('authorisation window', () => {
  const start = new Date('2026-10-01T00:00:00Z')
  it('releases after 6 days, before Stripe drops the hold at ~7', () => {
    expect(authorizationExpired(start, new Date('2026-10-06T23:59:00Z'))).toBe(false)
    expect(authorizationExpired(start, new Date('2026-10-07T00:00:00Z'))).toBe(true)
  })
})

describe('authorised state machine', () => {
  it('pending → authorized → paid | cancelled, never back', () => {
    expect(statusForWebhook('payment.authorized')).toBe('authorized')
    expect(canTransition('pending', 'authorized')).toBe(true)
    expect(canTransition('authorized', 'paid')).toBe(true)
    expect(canTransition('authorized', 'cancelled')).toBe(true)
    expect(canTransition('authorized', 'pending')).toBe(false)
    expect(canTransition('paid', 'authorized')).toBe(false)
    expect(canTransition('cancelled', 'authorized')).toBe(false)
    // A replayed authorisation is a no-op.
    expect(canTransition('authorized', 'authorized')).toBe(true)
  })

  it('reads a completed manual-capture Checkout session as authorised', () => {
    expect(
      webhookType('checkout.session.completed', {
        id: 'cs_1',
        payment_status: 'unpaid',
        metadata: { captureMethod: 'manual' },
      }),
    ).toBe('payment.authorized')
    expect(webhookType('checkout.session.completed', { id: 'cs_2', payment_status: 'paid' })).toBe(
      'payment.succeeded',
    )
    // An unpaid session that is NOT manual capture is a delayed method: wait.
    expect(
      webhookType('checkout.session.completed', { id: 'cs_3', payment_status: 'unpaid' }),
    ).toBe('unknown')
  })
})
