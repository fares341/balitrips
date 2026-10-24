import { describe, expect, it } from 'vitest'

import { convertUsdMinor, currencyForCountry, FALLBACK_RATES } from './shared'

describe('display currency', () => {
  it('maps countries', () => {
    expect(currencyForCountry('SA')).toBe('SAR')
    expect(currencyForCountry('de')).toBe('EUR')
    expect(currencyForCountry('ZZ')).toBe('USD')
    expect(currencyForCountry(null)).toBe('USD')
  })
  it('converts USD minor units', () => {
    expect(convertUsdMinor(10000, 'SAR', FALLBACK_RATES)).toBe(375)
  })
})
