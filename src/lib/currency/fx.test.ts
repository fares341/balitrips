import { describe, expect, it } from 'vitest'

import {
  BASE_CURRENCY,
  DEFAULT_FX,
  fromSarMinor,
  mergeFeedRates,
  parseRateLines,
  rateChanges,
  resolveFx,
  toSarMinor,
} from './fx'

describe('toSarMinor', () => {
  it('converts USD cents to halalas at the rate, half-up, without float noise', () => {
    const rates = { USD: 1 / 3.75 }
    expect(toSarMinor(5_900, 'USD', rates)).toBe(22_125)
    expect(toSarMinor(1_999, 'USD', rates)).toBe(7_496) // 74.9625 → 74.96
    expect(toSarMinor(2, 'usd', rates)).toBe(8) // 0.075 → 0.08
  })

  it('respects minor-unit exponents (KWD has 3)', () => {
    expect(toSarMinor(1_000, 'KWD', { KWD: 0.08 })).toBe(1_250) // 1 KWD = 12.50 SAR
  })

  it('passes SAR through and refuses a currency with no rate', () => {
    expect(toSarMinor(123, 'SAR', {})).toBe(123)
    expect(toSarMinor(100, 'XYZ', {})).toBeNull()
  })

  it('converts SAR halalas out to display amounts', () => {
    expect(fromSarMinor(10_000, 'EGP', { EGP: 12.93 })).toBeCloseTo(1293)
    expect(fromSarMinor(10_000, 'SAR', {})).toBe(100)
  })
})

describe('resolveFx — one FX source', () => {
  it('ships a table for every required presentment currency', () => {
    for (const code of [
      'USD',
      'EUR',
      'EGP',
      'AED',
      'KWD',
      'QAR',
      'BHD',
      'OMR',
      'JOD',
      'IDR',
      'GBP',
      'TRY',
      'MYR',
    ]) {
      expect(DEFAULT_FX.rates[code]).toBeGreaterThan(0)
      expect(DEFAULT_FX.presentment).toContain(code)
    }
    expect(DEFAULT_FX.presentment[0]).toBe(BASE_CURRENCY)
    expect(DEFAULT_FX.rates.SAR).toBe(1)
  })

  it('reads the old vehicles.sarPerUsd until the table stores a USD rate', () => {
    expect(resolveFx({}, 3.8).sarPerUsd).toBe(3.8)
    expect(resolveFx({ rates: { USD: 0.25 } }, 3.8).sarPerUsd).toBe(4)
    expect(resolveFx(null).sarPerUsd).toBe(3.75)
  })

  it('keeps only listed currencies that have a rate, SAR first; default falls back to SAR', () => {
    const fx = resolveFx({
      presentmentCurrencies: ['EGP', 'XYZ', 'SAR'],
      defaultPresentment: 'XYZ',
    })
    expect(fx.presentment).toEqual(['SAR', 'EGP'])
    expect(fx.defaultPresentment).toBe('SAR')
  })
})

describe('Studio rate editing', () => {
  it('parses one rate per line', () => {
    expect(parseRateLines(['usd 0.2667', 'EGP=12.93', '', 'KWD: 0,0819'])).toEqual({
      USD: 0.2667,
      EGP: 12.93,
      KWD: 0.0819,
    })
    expect(() => parseRateLines(['USD zero'])).toThrow()
    expect(() => parseRateLines(['USD 0'])).toThrow()
  })

  it('lists what changed for activity_log', () => {
    expect(rateChanges({ USD: 0.2667, EGP: 12 }, { USD: 0.2667, EGP: 12.93, AED: 0.98 })).toEqual([
      { currency: 'AED', from: null, to: 0.98 },
      { currency: 'EGP', from: 12, to: 12.93 },
    ])
  })
})

describe('optional feed refresh', () => {
  it('updates only known codes, and skips a suspicious jump', () => {
    const next = mergeFeedRates(
      { USD: 0.2667, EGP: 12.9 },
      { result: 'success', base_code: 'SAR', rates: { USD: 0.2666, EGP: 30, JPY: 40 } },
    )
    expect(next).toEqual({ USD: 0.2666, EGP: 12.9 })
    expect(mergeFeedRates({ USD: 0.2667 }, { result: 'error' })).toBeNull()
  })
})
