import { describe, expect, it } from 'vitest'

import { matchesQuery, searchAndPage } from './list'

describe('list search', () => {
  it('matches Arabic regardless of hamza, ta marbuta and diacritics', () => {
    expect(matchesQuery('باقه', { ar: 'باقة الخريطة' })).toBe(true)
    expect(matchesQuery('اسعار', 'أَسعار')).toBe(true)
    expect(matchesQuery('VIP map', 'vip', 'Map access')).toBe(true)
    expect(matchesQuery('nothing', 'vip')).toBe(false)
    expect(matchesQuery(null, 'x')).toBe(true)
  })

  it('pages after filtering', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ name: i % 2 ? 'odd' : 'even' }))
    const first = searchAndPage(rows, { q: 'odd' }, (r) => [r.name])
    expect(first.total).toBe(30)
    expect(first.rows).toHaveLength(25)
    expect(searchAndPage(rows, { q: 'odd', page: '2' }, (r) => [r.name]).rows).toHaveLength(5)
  })
})
