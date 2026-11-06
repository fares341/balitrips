import { describe, expect, it } from 'vitest'

import { matchEntries } from './search-text'

const entries = [
  { label: 'الطلبات', search: 'الطلبات Orders الحجوزات Bookings' },
  { label: 'السيارات والسائق', search: 'السيارات والسائق Vehicles & driver' },
  { label: 'باقات الوصول', search: 'باقات الوصول Access plans' },
]

describe('command palette matching', () => {
  it('finds a screen by its Arabic or English name', () => {
    expect(matchEntries(entries, 'orders')[0]?.label).toBe('الطلبات')
    expect(matchEntries(entries, 'السائق')[0]?.label).toBe('السيارات والسائق')
    expect(matchEntries(entries, 'باقات')[0]?.label).toBe('باقات الوصول')
    expect(matchEntries(entries, 'zzz')).toHaveLength(0)
    expect(matchEntries(entries, '')).toHaveLength(3)
  })
})
