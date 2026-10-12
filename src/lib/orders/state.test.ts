import { describe, expect, it } from 'vitest'

import {
  canTransition,
  isRefundable,
  isTerminal,
  shouldRevokeEntitlements,
  statusAfterRefund,
  statusForWebhook,
  type OrderStatus,
} from './state'

describe('transitions', () => {
  it('walks the happy path', () => {
    expect(canTransition('pending', 'paid')).toBe(true)
    expect(canTransition('paid', 'confirmed')).toBe(true)
  })

  it('never regresses a paid order back to pending', () => {
    // A late "processing" webhook arriving after success must not undo it.
    expect(canTransition('paid', 'pending')).toBe(false)
    expect(canTransition('confirmed', 'pending')).toBe(false)
    expect(canTransition('refunded', 'pending')).toBe(false)
  })

  it('treats a replayed event as a no-op rather than an error', () => {
    for (const s of ['pending', 'paid', 'confirmed', 'refunded'] as OrderStatus[]) {
      expect(canTransition(s, s)).toBe(true)
    }
  })

  it('locks terminal states', () => {
    expect(isTerminal('refunded')).toBe(true)
    expect(isTerminal('cancelled')).toBe(true)
    expect(isTerminal('paid')).toBe(false)
    expect(canTransition('cancelled', 'paid')).toBe(false)
    expect(canTransition('refunded', 'confirmed')).toBe(false)
  })

  it('will not skip straight from pending to confirmed', () => {
    expect(canTransition('pending', 'confirmed')).toBe(false)
  })
})

describe('refundability', () => {
  it('allows refunds only once money has been taken', () => {
    expect(isRefundable('paid')).toBe(true)
    expect(isRefundable('confirmed')).toBe(true)
    expect(isRefundable('partially_refunded')).toBe(true)
    expect(isRefundable('pending')).toBe(false)
    expect(isRefundable('cancelled')).toBe(false)
    expect(isRefundable('refunded')).toBe(false)
  })
})

describe('statusAfterRefund', () => {
  it('marks a full refund as refunded', () => {
    expect(statusAfterRefund('paid', 10_000, 0, 10_000)).toBe('refunded')
  })

  it('marks a partial refund as partially_refunded', () => {
    expect(statusAfterRefund('paid', 10_000, 0, 2500)).toBe('partially_refunded')
  })

  it('lands on refunded when successive partials add up to the total', () => {
    // Refunding one line of a five-line order, repeatedly, must eventually
    // settle on "refunded" rather than staying partial forever.
    let status = statusAfterRefund('paid', 10_000, 0, 4000)
    expect(status).toBe('partially_refunded')
    status = statusAfterRefund(status, 10_000, 4000, 6000)
    expect(status).toBe('refunded')
  })

  it('refuses to refund more than was charged', () => {
    expect(() => statusAfterRefund('paid', 10_000, 0, 10_001)).toThrow()
    expect(() => statusAfterRefund('paid', 10_000, 8000, 2001)).toThrow()
  })

  it('rejects zero and negative refunds', () => {
    expect(() => statusAfterRefund('paid', 10_000, 0, 0)).toThrow()
    expect(() => statusAfterRefund('paid', 10_000, 0, -500)).toThrow()
  })

  it('refuses to refund an unpaid or already-refunded order', () => {
    expect(() => statusAfterRefund('pending', 10_000, 0, 100)).toThrow()
    expect(() => statusAfterRefund('refunded', 10_000, 10_000, 100)).toThrow()
  })
})

describe('statusForWebhook', () => {
  it('maps terminal payment outcomes', () => {
    expect(statusForWebhook('payment.succeeded')).toBe('paid')
    expect(statusForWebhook('payment.failed')).toBe('cancelled')
    expect(statusForWebhook('payment.cancelled')).toBe('cancelled')
  })

  it('never moves state on an unknown event', () => {
    expect(statusForWebhook('unknown')).toBeNull()
  })

  it('defers refunds to arithmetic rather than the event type', () => {
    expect(statusForWebhook('refund.succeeded')).toBeNull()
  })
})

describe('entitlement revocation', () => {
  it('revokes when money goes back', () => {
    expect(shouldRevokeEntitlements('refunded')).toBe(true)
    expect(shouldRevokeEntitlements('cancelled')).toBe(true)
  })

  it('keeps access while the order stands', () => {
    expect(shouldRevokeEntitlements('paid')).toBe(false)
    expect(shouldRevokeEntitlements('confirmed')).toBe(false)
    // A partial refund of one activity must not remove map access bought
    // on the same order.
    expect(shouldRevokeEntitlements('partially_refunded')).toBe(false)
  })
})
