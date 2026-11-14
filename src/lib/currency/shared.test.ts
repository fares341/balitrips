import { describe, expect, it } from 'vitest'

import { formatMoneyText } from './money-format'

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

  it('Arabic: a Latin-symbol amount is one left-to-right run with ≈ in front', () => {
    const LRI = '\u2066'
    const PDI = '\u2069'
    expect(formatMoneyText(26.67, 'USD', 'ar', true)).toBe(`${LRI}≈ $26.67${PDI}`)
    expect(formatMoneyText(24.53, 'EUR', 'ar', true)).toBe(`${LRI}≈ €24.53${PDI}`)
    expect(formatMoneyText(435_400, 'IDR', 'ar', true).replace(/\u00a0/g, ' ')).toBe(
      `${LRI}≈ Rp 435,000${PDI}`,
    )
    expect(formatMoneyText(49, 'USD', 'ar')).toBe(`${LRI}$49${PDI}`)
  })

  it('Arabic: an Arabic-symbol amount keeps the Arabic form, ≈ first in reading order', () => {
    const aed = formatMoneyText(98, 'AED', 'ar', true)
    expect(aed.startsWith('≈ \u200f')).toBe(true)
    expect(aed.replace(/\u00a0/g, ' ')).toContain('98 د.إ.')
    expect(formatMoneyText(1293, 'EGP', 'ar', true)).toContain('ج.م.')
    // SAR is byte-identical to Intl's own output (server-rendered everywhere).
    expect(formatMoneyText(150, 'SAR', 'ar')).toBe(
      new Intl.NumberFormat('ar-SA-u-nu-latn', {
        style: 'currency',
        currency: 'SAR',
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 0,
      }).format(150),
    )
  })

  it('English and Indonesian need no isolates; other dollars are not shown as «$»', () => {
    expect(formatMoneyText(26.67, 'USD', 'en', true)).toBe('≈ $26.67')
    expect(formatMoneyText(150, 'SAR', 'en')).toMatch(/^SAR\s150$/)
    expect(formatMoneyText(40, 'AUD', 'en')).toBe('A$40')
    expect(formatMoneyText(40, 'AUD', 'ar')).toBe('\u2066A$40\u2069')
    expect(formatMoneyText(435_400, 'IDR', 'id', true)).toMatch(/^≈ Rp\s435\.000$/)
  })
})
