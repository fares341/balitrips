import { describe, expect, it } from 'vitest'

import {
  CHARGE_CURRENCY,
  ChargeCurrencyError,
  chargedOf,
  refundChargeMinor,
  sarRate,
  toChargeMinor,
} from './charge'

describe('toChargeMinor', () => {
  it('converts USD cents to SAR halalas at the Studio rate', () => {
    expect(toChargeMinor(10_000, 'USD', 3.75)).toEqual({
      currency: 'SAR',
      amountMinor: 37_500,
      rate: '3.75',
    })
    expect(toChargeMinor(25_000, 'usd', 3.75).amountMinor).toBe(93_750)
  })

  it('rounds half-up to the nearest halala without float noise', () => {
    // 19.99 × 3.75 = 74.9625 → 74.96
    expect(toChargeMinor(1_999, 'USD', 3.75).amountMinor).toBe(7_496)
    // 0.01 × 3.75 = 0.0375 → 0.04
    expect(toChargeMinor(1, 'USD', 3.75).amountMinor).toBe(4)
    // 1.02 × 3.7525 = 3.82755 → 3.83
    expect(toChargeMinor(102, 'USD', 3.7525).amountMinor).toBe(383)
    // exact half: 0.02 × 3.75 = 0.075 → 0.08
    expect(toChargeMinor(2, 'USD', 3.75).amountMinor).toBe(8)
  })

  it('passes SAR through unchanged', () => {
    expect(toChargeMinor(12_345, 'SAR', 3.75)).toEqual({
      currency: CHARGE_CURRENCY,
      amountMinor: 12_345,
      rate: '1',
    })
  })

  it('falls back to the 3.75 peg on an unusable rate', () => {
    expect(sarRate(0)).toBe(3.75)
    expect(sarRate(Number.NaN)).toBe(3.75)
    expect(toChargeMinor(100, 'USD', -1).amountMinor).toBe(375)
  })

  it('refuses currencies it cannot convert and bad amounts', () => {
    expect(() => toChargeMinor(100, 'IDR', 3.75)).toThrow(ChargeCurrencyError)
    expect(() => toChargeMinor(1.5, 'USD', 3.75)).toThrow(RangeError)
    expect(() => toChargeMinor(-1, 'USD', 3.75)).toThrow(RangeError)
  })
})

describe('refundChargeMinor', () => {
  const order = { orderTotalMinor: 1_999, chargedTotalMinor: 7_496 }

  it('refunds the full charge for a full refund', () => {
    expect(refundChargeMinor({ ...order, alreadyRefundedMinor: 0, amountMinor: 1_999 })).toBe(7_496)
  })

  it('partial refunds always add up to exactly the charge', () => {
    const parts = [333, 1_000, 666]
    let refunded = 0
    let sar = 0
    for (const part of parts) {
      sar += refundChargeMinor({ ...order, alreadyRefundedMinor: refunded, amountMinor: part })
      refunded += part
    }
    expect(sar).toBe(7_496)
  })
})

describe('chargedOf', () => {
  it('prefers the frozen SAR settlement', () => {
    expect(
      chargedOf({
        totalMinor: 100,
        presentmentCurrency: 'USD',
        settlementTotalMinor: 375,
        settlementCurrency: 'SAR',
      }),
    ).toEqual({ amountMinor: 375, currency: 'SAR' })
  })
  it('falls back to the order total for orders placed before the switch', () => {
    expect(
      chargedOf({
        totalMinor: 100,
        presentmentCurrency: 'USD',
        settlementTotalMinor: null,
        settlementCurrency: null,
      }),
    ).toEqual({ amountMinor: 100, currency: 'USD' })
  })
})
