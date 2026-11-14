import { describe, expect, it } from 'vitest'

import { foldSearch, matchesQuery } from './activity-match'

const text = (value: string) => foldSearch(value)

describe('matchesQuery', () => {
  it('folds Arabic letter variants', () => {
    expect(matchesQuery(text('سافاري بالي Taman Safari Bali'), 'سفارى')).toBe(true)
    expect(matchesQuery(text('حديقة الطيور'), 'حديقه')).toBe(true)
    expect(matchesQuery(text('أوبود'), 'اوبود')).toBe(true)
  })
  it('matches transliterations through synonyms', () => {
    expect(matchesQuery(text('تجديف نهر أيونج Ayung River Rafting'), 'رافتنج')).toBe(true)
    expect(matchesQuery(text('جت سكي تانجونج بينوا'), 'جيت سكي')).toBe(true)
    expect(matchesQuery(text('Bali Zoo'), 'حديقة حيوان')).toBe(true)
  })
  it('still says no when nothing fits', () => {
    expect(matchesQuery(text('تجديف نهر أيونج'), 'تزلج على الجليد')).toBe(false)
    expect(matchesQuery(text('Bali Zoo'), 'رافتنج')).toBe(false)
  })
  it('accepts every word in any order', () => {
    expect(matchesQuery(text('تجديف نهر أيونج في أوبود'), 'أوبود تجديف')).toBe(true)
  })
})
