import { describe, expect, it } from 'vitest'

import {
  couponKindOf,
  evaluateCoupon,
  isValidCouponCode,
  normalizeCouponCode,
  type CouponLine,
  type CouponRule,
} from './coupons'

const NOW = new Date('2026-10-20T08:00:00Z')

function rule(overrides: Partial<CouponRule> = {}): CouponRule {
  return {
    id: 'c1',
    code: 'BALI10',
    type: 'percent',
    value: 1000,
    currency: null,
    minSubtotalMinor: null,
    validFrom: null,
    validTo: null,
    maxUses: null,
    maxUsesPerCustomer: null,
    appliesTo: 'all',
    appliesKinds: [],
    appliesItems: [],
    active: true,
    ...overrides,
  }
}

const LINES: CouponLine[] = [
  { kind: 'activity_tier', refs: ['tier-1', 'act-1'], lineTotalMinor: 10_000 },
  { kind: 'itinerary', refs: ['it-1'], lineTotalMinor: 5_000 },
  { kind: 'place', refs: ['pl-1'], lineTotalMinor: 0 },
]
const NO_USE = { total: 0, byCustomer: 0 }

describe('coupon codes', () => {
  it('match without case or spaces', () => {
    expect(normalizeCouponCode('  bali10 ')).toBe('BALI10')
    expect(isValidCouponCode('SUMMER-26')).toBe(true)
    expect(isValidCouponCode('a b')).toBe(false)
    expect(isValidCouponCode('ab')).toBe(false)
  })

  it('treats a package of an activity as an activity', () => {
    expect(couponKindOf('activity_tier')).toBe('activity')
    expect(couponKindOf('place')).toBeNull()
  })
})

describe('evaluateCoupon', () => {
  it('takes a percentage off every eligible line, rounded half up', () => {
    const verdict = evaluateCoupon(rule({ value: 1250 }), NO_USE, LINES, 'USD', 15_000, NOW)
    expect(verdict).toEqual({ ok: true, discountMinor: 1875, eligibleMinor: 15_000 })
    const odd = evaluateCoupon(
      rule({ value: 333 }),
      NO_USE,
      [{ kind: 'plan', refs: ['p'], lineTotalMinor: 1_005 }],
      'USD',
      1_005,
      NOW,
    )
    // 1005 × 3.33% = 33.4665 → 33
    expect(odd).toMatchObject({ ok: true, discountMinor: 33 })
  })

  it('never takes off more than the eligible lines are worth', () => {
    const verdict = evaluateCoupon(
      rule({ type: 'fixed', value: 99_999, currency: 'USD' }),
      NO_USE,
      LINES,
      'USD',
      15_000,
      NOW,
    )
    expect(verdict).toMatchObject({ ok: true, discountMinor: 15_000 })
  })

  it('refuses a fixed amount in another currency', () => {
    const verdict = evaluateCoupon(
      rule({ type: 'fixed', value: 500, currency: 'EUR' }),
      NO_USE,
      LINES,
      'USD',
      15_000,
      NOW,
    )
    expect(verdict).toEqual({ ok: false, reason: 'currency' })
  })

  it('respects the dates, the switch and the minimum', () => {
    expect(evaluateCoupon(rule({ active: false }), NO_USE, LINES, 'USD', 15_000, NOW)).toEqual({
      ok: false,
      reason: 'inactive',
    })
    expect(
      evaluateCoupon(
        rule({ validFrom: new Date('2026-11-01T00:00:00Z') }),
        NO_USE,
        LINES,
        'USD',
        15_000,
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'not_started' })
    expect(
      evaluateCoupon(
        rule({ validTo: new Date('2026-10-01T00:00:00Z') }),
        NO_USE,
        LINES,
        'USD',
        15_000,
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'expired' })
    expect(
      evaluateCoupon(
        rule({ minSubtotalMinor: 20_000, currency: 'USD' }),
        NO_USE,
        LINES,
        'USD',
        15_000,
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'min_subtotal' })
  })

  it('counts only paid uses, in total and per customer', () => {
    expect(
      evaluateCoupon(rule({ maxUses: 3 }), { total: 3, byCustomer: 0 }, LINES, 'USD', 1, NOW),
    ).toEqual({ ok: false, reason: 'used_up' })
    expect(
      evaluateCoupon(
        rule({ maxUsesPerCustomer: 1 }),
        { total: 1, byCustomer: 1 },
        LINES,
        'USD',
        15_000,
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'used_up_customer' })
    expect(
      evaluateCoupon(rule({ maxUses: 3 }), { total: 2, byCustomer: 0 }, LINES, 'USD', 15_000, NOW)
        .ok,
    ).toBe(true)
  })

  it('applies only to the chosen product kinds or items', () => {
    const kinds = evaluateCoupon(
      rule({ appliesTo: 'kinds', appliesKinds: ['itinerary'] }),
      NO_USE,
      LINES,
      'USD',
      15_000,
      NOW,
    )
    expect(kinds).toMatchObject({ ok: true, discountMinor: 500, eligibleMinor: 5_000 })
    // An activity id covers its packages.
    const items = evaluateCoupon(
      rule({ appliesTo: 'items', appliesItems: ['act-1'] }),
      NO_USE,
      LINES,
      'USD',
      15_000,
      NOW,
    )
    expect(items).toMatchObject({ ok: true, discountMinor: 1_000, eligibleMinor: 10_000 })
    expect(
      evaluateCoupon(
        rule({ appliesTo: 'kinds', appliesKinds: ['driver'] }),
        NO_USE,
        LINES,
        'USD',
        15_000,
        NOW,
      ),
    ).toEqual({ ok: false, reason: 'not_applicable' })
  })
})
