import { describe, expect, it } from 'vitest'

import { DEFAULT_FX } from './fx'
import { convertMinor, currencyForCountry, formatInCurrency } from './shared'

describe('display currency', () => {
  it('maps countries to currencies', () => {
    expect(currencyForCountry('SA')).toBe('SAR')
    expect(currencyForCountry('EG')).toBe('EGP')
    expect(currencyForCountry('de')).toBe('EUR')
    expect(currencyForCountry('US')).toBe('USD')
    expect(currencyForCountry('ID')).toBe('IDR')
    expect(currencyForCountry('AE')).toBe('AED')
    // Unknown or unmapped visitors see the charge currency.
    expect(currencyForCountry('ZZ')).toBe('SAR')
    expect(currencyForCountry(null)).toBe('SAR')
    expect(currencyForCountry('')).toBe('SAR')
  })

  it('falls back to SAR when the mapped currency is not offered', () => {
    expect(currencyForCountry('EG', ['SAR', 'USD'])).toBe('SAR')
    expect(currencyForCountry('JP')).toBe('SAR') // JPY is not in the shipped list
  })

  it('converts SAR halalas with the Studio table', () => {
    expect(convertMinor(10_000, 'SAR', 'EGP', { EGP: 12.93 })).toBeCloseTo(1293)
    expect(convertMinor(37_500, 'SAR', 'USD', { USD: 1 / 3.75 })).toBeCloseTo(100)
    expect(convertMinor(10_000, 'SAR', 'SAR', {})).toBe(100)
    expect(convertMinor(100, 'SAR', 'XYZ', {})).toBeNull()
  })

  it('marks non-SAR prices as approximate and keeps SAR exact', () => {
    expect(formatInCurrency(22_100, 'SAR', 'SAR', 'ar')).toBe(
      new Intl.NumberFormat('ar-SA-u-nu-latn', {
        style: 'currency',
        currency: 'SAR',
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 0,
      }).format(221),
    )
    expect(formatInCurrency(22_100, 'SAR', 'EGP', 'en', DEFAULT_FX.rates)).toMatch(/^≈ /)
  })
})
