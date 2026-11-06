import { describe, expect, it } from 'vitest'

import { DEFAULT_FX } from './fx'
import { studioMoney, studioTotal, studioTotalSar } from './studio'

const rates = { ...DEFAULT_FX.rates, USD: 1 / 3.75 }

describe('Studio money is always SAR', () => {
  it('a SAR amount is printed as SAR', () => {
    expect(studioMoney(22_100, 'SAR', 'en', rates)).toContain('SAR')
    expect(studioMoney(22_100, 'SAR', 'en', rates)).not.toContain('$')
  })

  it('an old USD order shows ≈ SAR only, no dollars', () => {
    const text = studioMoney(5_900, 'USD', 'en', rates)
    expect(text.startsWith('≈ ')).toBe(true)
    expect(text).toContain('221.25')
    expect(text).not.toContain('$')
    expect(text).not.toContain('(')
  })

  it('a missing currency counts as SAR', () => {
    expect(studioMoney(100, null, 'en', rates)).not.toContain('≈')
  })

  it('totals convert non-SAR parts at the Studio rate and are labelled', () => {
    const list = [
      { currency: 'SAR', minor: 10_000 },
      { currency: 'USD', minor: 1_000 },
    ]
    expect(studioTotalSar(list, rates)).toEqual({
      minor: 13_750,
      converted: true,
      unconvertible: [],
    })
    const text = studioTotal(list, 'en', rates)
    expect(text).toMatch(/^≈ .*137\.50/)
    expect(text).not.toContain('converted')
    expect(text).not.toContain('$')
    expect(studioTotal(list, 'ar', rates)).not.toMatch(/[A-Za-z]/)
  })

  it('an all-SAR total is not labelled', () => {
    expect(studioTotal([{ currency: 'SAR', minor: 500 }], 'en', rates)).not.toContain('converted')
    expect(studioTotal([], 'en', rates)).toBe('—')
  })
})
