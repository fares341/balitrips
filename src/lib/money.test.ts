import { describe, expect, it } from 'vitest'

import { allocateMinor, formatMoney, lineTotalMinor, minorUnitExponent, sumMinor } from './money'

describe('minorUnitExponent', () => {
  it('knows currencies that are not two-decimal', () => {
    expect(minorUnitExponent('USD')).toBe(2)
    expect(minorUnitExponent('EUR')).toBe(2)
    expect(minorUnitExponent('JPY')).toBe(0)
    expect(minorUnitExponent('KWD')).toBe(3)
    expect(minorUnitExponent('BHD')).toBe(3)
    expect(minorUnitExponent('OMR')).toBe(3)
  })

  it('is case-insensitive', () => {
    expect(minorUnitExponent('jpy')).toBe(0)
  })
})

describe('formatMoney', () => {
  it('formats two-decimal currencies', () => {
    expect(formatMoney(8900, 'USD', 'en-US')).toContain('89')
  })

  it('does not divide zero-decimal currencies by 100', () => {
    // 5000 JPY minor units IS 5000 yen, not 50.
    const out = formatMoney(5000, 'JPY', 'en-US')
    expect(out).toContain('5,000')
  })

  it('handles three-decimal currencies', () => {
    const out = formatMoney(1500, 'KWD', 'en-US')
    expect(out).toContain('1.500')
  })
})

describe('lineTotalMinor', () => {
  it('multiplies unit price by quantity', () => {
    expect(lineTotalMinor(5500, 2)).toBe(11_000)
  })

  it('handles a zero-priced line (saved places are free)', () => {
    expect(lineTotalMinor(0, 3)).toBe(0)
  })

  it('rejects non-integer money, which is how float bugs enter', () => {
    expect(() => lineTotalMinor(55.5, 2)).toThrow()
    expect(() => lineTotalMinor(5500, -1)).toThrow()
    expect(() => lineTotalMinor(5500, 1.5)).toThrow()
  })
})

describe('sumMinor', () => {
  it('sums an empty cart to zero', () => {
    expect(sumMinor([])).toBe(0)
  })

  it('adds minor units without float drift', () => {
    // 0.1 + 0.2 in float dollars is 0.30000000000000004. In minor units it
    // is exactly 30 — this is the whole reason for integer money.
    expect(sumMinor([10, 20])).toBe(30)
    expect(sumMinor([1, 2, 3, 4, 5])).toBe(15)
  })
})

describe('allocateMinor', () => {
  it('splits evenly when it divides cleanly', () => {
    expect(allocateMinor(300, [1, 1, 1])).toEqual([100, 100, 100])
  })

  it('never loses or invents a minor unit on an uneven split', () => {
    const parts = allocateMinor(100, [1, 1, 1])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100)
    expect(parts.sort()).toEqual([33, 33, 34])
  })

  it('allocates proportionally to weights', () => {
    const parts = allocateMinor(1000, [3, 1])
    expect(parts).toEqual([750, 250])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it('handles zero weights without dividing by zero', () => {
    expect(allocateMinor(500, [0, 0])).toEqual([0, 0])
  })

  it('always reconciles to the total across many splits', () => {
    for (const total of [1, 7, 99, 12_345, 999_999]) {
      for (const weights of [
        [1, 1],
        [1, 2, 3],
        [5, 1, 1, 1],
        [7, 11, 13],
      ]) {
        const parts = allocateMinor(total, weights)
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })
})
