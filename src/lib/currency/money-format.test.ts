import { describe, expect, it } from 'vitest'

import { formatMoneyText } from './money-format'

describe('formatMoneyText', () => {
  it('shows SAR (the charged currency) exactly, even above 100', () => {
    expect(formatMoneyText(246.9, 'SAR', 'en')).toContain('246.90')
    expect(formatMoneyText(123.45, 'SAR', 'en')).toContain('123.45')
    expect(formatMoneyText(1575, 'SAR', 'en')).not.toContain('.')
  })

  it('still rounds a converted headline price above 100', () => {
    expect(formatMoneyText(123.45, 'USD', 'en')).toBe('$123')
  })
})
