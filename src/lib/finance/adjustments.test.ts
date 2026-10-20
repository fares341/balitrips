import { describe, expect, it } from 'vitest'

import { allocateMinor } from '@/lib/money'

import {
  computeTotals,
  FEES_OFF,
  lineRefundCaps,
  percentOf,
  refundCapsById,
  type FeeSchedule,
} from './adjustments'

const ON: FeeSchedule = {
  enabled: true,
  serviceFeeBps: 250,
  bookingFeeMinor: 500,
  paymentSurchargeBps: 100,
  feeCurrency: 'USD',
  taxEnabled: true,
  taxRateBps: 1100,
  taxLabel: { en: 'VAT', ar: 'ضريبة', id: 'PPN' },
}

describe('defaults keep prices identical', () => {
  it.each([0, 1, 99, 12_345, 987_654_321])('subtotal %i → same total, no lines', (subtotal) => {
    const totals = computeTotals(subtotal, 'USD', null, FEES_OFF)
    expect(totals.totalMinor).toBe(subtotal)
    expect(totals.lines).toEqual([])
    expect(totals.feesMinor + totals.taxMinor + totals.discountMinor).toBe(0)
  })

  it('numbers typed into the fee fields charge nothing until switched on', () => {
    const typedButOff: FeeSchedule = { ...ON, enabled: false, taxEnabled: false }
    expect(computeTotals(10_000, 'USD', null, typedButOff).totalMinor).toBe(10_000)
  })
})

describe('fees and tax', () => {
  it('adds service, booking, tax and surcharge in order', () => {
    const totals = computeTotals(10_000, 'USD', null, ON)
    // service 250, booking 500 → 10 750; tax 11% = 1 182.5 → 1 183 → 11 933;
    // surcharge 1% = 119.33 → 119 → 12 052
    expect(totals.lines.map((line) => [line.kind, line.amountMinor])).toEqual([
      ['service_fee', 250],
      ['booking_fee', 500],
      ['tax', 1_183],
      ['surcharge', 119],
    ])
    expect(totals.feesMinor).toBe(869)
    expect(totals.taxMinor).toBe(1_183)
    expect(totals.totalMinor).toBe(12_052)
  })

  it('does not convert a flat booking fee into another currency', () => {
    const totals = computeTotals(10_000, 'EUR', null, { ...ON, taxEnabled: false })
    expect(totals.lines.find((line) => line.kind === 'booking_fee')).toBeUndefined()
  })

  it('applies the discount first, and charges nothing on a free order', () => {
    const totals = computeTotals(10_000, 'USD', { amountMinor: 2_000, code: 'X' }, ON)
    expect(totals.lines[0]).toEqual({ kind: 'discount', amountMinor: 2_000, code: 'X' })
    expect(totals.lines[1]).toEqual({ kind: 'service_fee', amountMinor: 200, bps: 250 })
    const free = computeTotals(10_000, 'USD', { amountMinor: 10_000, code: 'ALL' }, ON)
    expect(free.totalMinor).toBe(0)
    expect(free.lines).toHaveLength(1)
  })

  it('rounds percentages half up without float drift', () => {
    expect(percentOf(1, 5_000)).toBe(1)
    expect(percentOf(3, 1_666)).toBe(0)
    expect(percentOf(9_007_199_254_740, 9_999)).toBe(9_006_298_534_815)
  })
})

describe('refund shares', () => {
  it('are the line totals when nothing was added or taken off', () => {
    expect(lineRefundCaps([700, 300], 1_000, 1_000, allocateMinor)).toEqual([700, 300])
  })

  it('split what was actually charged, summing exactly to the total', () => {
    const caps = lineRefundCaps([700, 300, 1], 1_001, 901, allocateMinor)
    expect(caps.reduce((a, b) => a + b, 0)).toBe(901)
    expect(caps[0]).toBeLessThan(700)
  })

  it('do not depend on the order the lines were read in', () => {
    const lines = [
      { id: 'b', lineTotalMinor: 333 },
      { id: 'a', lineTotalMinor: 333 },
      { id: 'c', lineTotalMinor: 334 },
    ]
    const one = refundCapsById(lines, 1_000, 901, allocateMinor)
    const two = refundCapsById([...lines].reverse(), 1_000, 901, allocateMinor)
    expect([...one.entries()].sort()).toEqual([...two.entries()].sort())
    expect([...one.values()].reduce((a, b) => a + b, 0)).toBe(901)
  })
})
