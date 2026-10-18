import { describe, expect, it } from 'vitest'

import {
  formatMoneyInput,
  formatPercentInput,
  parseMoneyInput,
  parsePercentInput,
  parseScaled,
} from './money-input'

const ok = (value: number) => ({ ok: true, value })

describe('parseMoneyInput', () => {
  it('reads normal amounts in 2-decimal currencies', () => {
    expect(parseMoneyInput('125.00', 'USD')).toEqual(ok(12500))
    expect(parseMoneyInput('125', 'USD')).toEqual(ok(12500))
    expect(parseMoneyInput('125.5', 'USD')).toEqual(ok(12550))
    expect(parseMoneyInput('.5', 'USD')).toEqual(ok(50))
    expect(parseMoneyInput('0', 'USD')).toEqual(ok(0))
  })

  it('accepts a comma as the decimal separator, and thousands grouping', () => {
    expect(parseMoneyInput('125,50', 'EUR')).toEqual(ok(12550))
    expect(parseMoneyInput('1,250.50', 'USD')).toEqual(ok(125050))
    expect(parseMoneyInput('1.250,50', 'USD')).toEqual(ok(125050))
    expect(parseMoneyInput('1.250.000', 'USD')).toEqual(ok(125000000))
    expect(parseMoneyInput(' 1 250.00 ', 'USD')).toEqual(ok(125000))
  })

  it('rounds half up to the currency decimals', () => {
    expect(parseMoneyInput('19.999', 'USD')).toEqual(ok(2000))
    expect(parseMoneyInput('19.994', 'USD')).toEqual(ok(1999))
    expect(parseMoneyInput('19.995', 'USD')).toEqual(ok(2000))
    expect(parseMoneyInput('0.005', 'USD')).toEqual(ok(1))
  })

  it('handles 0- and 3-decimal currencies', () => {
    expect(parseMoneyInput('1500', 'JPY')).toEqual(ok(1500))
    expect(parseMoneyInput('1500.4', 'JPY')).toEqual(ok(1500))
    expect(parseMoneyInput('1500.5', 'JPY')).toEqual(ok(1501))
    expect(parseMoneyInput('1.234', 'KWD')).toEqual(ok(1234))
  })

  it('reads Arabic-Indic and Persian digits and the Arabic separators', () => {
    expect(parseMoneyInput('١٢٥٫٥٠', 'USD')).toEqual(ok(12550))
    expect(parseMoneyInput('١٬٢٥٠', 'USD')).toEqual(ok(125000))
    expect(parseMoneyInput('۱۲۵', 'USD')).toEqual(ok(12500))
    expect(parseMoneyInput('١٢٥,٥', 'USD')).toEqual(ok(12550))
  })

  it('refuses negatives, garbage and absurd values', () => {
    expect(parseMoneyInput('-5', 'USD')).toEqual({ ok: false, error: 'negative' })
    expect(parseMoneyInput('-0.50', 'USD')).toEqual({ ok: false, error: 'negative' })
    for (const bad of ['', 'abc', '12a', '1.2.3', '$5', '5$', '.', ',', '1,2,3', '--5', '1e5']) {
      expect(parseMoneyInput(bad, 'USD')).toEqual({ ok: false, error: 'invalid' })
    }
    expect(parseMoneyInput('99999999999999999', 'USD')).toEqual({ ok: false, error: 'too_large' })
    expect(parseMoneyInput('10000000000000.01', 'USD')).toEqual({ ok: false, error: 'too_large' })
  })

  it('keeps large but sane values exact', () => {
    expect(parseMoneyInput('25000000', 'IDR')).toEqual(ok(2_500_000_000))
    expect(parseMoneyInput('9999999999999.99', 'USD')).toEqual(ok(999_999_999_999_999))
  })
})

describe('parsePercentInput', () => {
  it('turns a percentage into basis points', () => {
    expect(parsePercentInput('2.5')).toEqual(ok(250))
    expect(parsePercentInput('2,5')).toEqual(ok(250))
    expect(parsePercentInput('0')).toEqual(ok(0))
    expect(parsePercentInput('٢٫٧٥')).toEqual(ok(275))
    expect(parsePercentInput('3.333')).toEqual(ok(333))
    expect(parsePercentInput('-1')).toEqual({ ok: false, error: 'negative' })
  })
})

describe('formatting back into the form', () => {
  it('shows minor units as a plain decimal', () => {
    expect(formatMoneyInput(12500, 'USD')).toBe('125.00')
    expect(formatMoneyInput(5, 'USD')).toBe('0.05')
    expect(formatMoneyInput(0, 'USD')).toBe('0.00')
    expect(formatMoneyInput(1500, 'JPY')).toBe('1500')
    expect(formatMoneyInput(1234, 'KWD')).toBe('1.234')
    expect(formatMoneyInput(2_500_000_000, 'IDR')).toBe('25000000.00')
  })

  it('round-trips', () => {
    for (const [minor, currency] of [
      [12550, 'USD'],
      [1, 'USD'],
      [1500, 'JPY'],
      [999_999_999_999_999, 'USD'],
    ] as const) {
      expect(parseMoneyInput(formatMoneyInput(minor, currency), currency)).toEqual(ok(minor))
    }
    for (const bps of [0, 1, 250, 275, 10_000]) {
      expect(parsePercentInput(formatPercentInput(bps))).toEqual(ok(bps))
    }
  })

  it('drops trailing zeros from percentages', () => {
    expect(formatPercentInput(250)).toBe('2.5')
    expect(formatPercentInput(200)).toBe('2')
    expect(formatPercentInput(2000)).toBe('20')
    expect(formatPercentInput(275)).toBe('2.75')
    expect(formatPercentInput(0)).toBe('0')
    expect(formatPercentInput(5)).toBe('0.05')
  })

  it('scales by any number of decimals', () => {
    expect(parseScaled('5', 0)).toEqual(ok(5))
    expect(parseScaled('5.25', 2)).toEqual(ok(525))
  })
})
