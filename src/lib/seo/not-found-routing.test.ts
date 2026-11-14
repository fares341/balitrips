import { describe, expect, it } from 'vitest'

import { detailTarget, ExistsCache, isDetailKind } from './not-found-routing'

describe('detailTarget', () => {
  it('recognises exactly the public detail URLs', () => {
    expect(detailTarget('/ar/activities/kuber-atv-ubud')).toEqual({
      kind: 'activity',
      key: 'kuber-atv-ubud',
    })
    expect(detailTarget('/en/places/place-21')).toEqual({ kind: 'place', key: 'place-21' })
    expect(detailTarget('/id/explore/south')).toEqual({ kind: 'region', key: 'south' })
    expect(detailTarget('/ar/blog/x')).toEqual({ kind: 'article', key: 'x' })
  })

  it('leaves lists, nested pages and other sections alone', () => {
    expect(detailTarget('/ar/activities')).toBeNull()
    expect(detailTarget('/ar/activities/x/preview')).toBeNull()
    expect(detailTarget('/ar/plans/buy')).toBeNull()
    expect(detailTarget('/ar/account/trip')).toBeNull()
    expect(detailTarget('/ar/places/')).toBeNull()
    expect(detailTarget('/ar/places/a b')).toBeNull()
    expect(detailTarget('/ar/places/%E0%A4%A')).toBeNull()
  })

  it('knows its kinds', () => {
    expect(isDetailKind('place')).toBe(true)
    expect(isDetailKind('places')).toBe(false)
  })
})

describe('ExistsCache', () => {
  it('remembers «found» for minutes and «missing» only briefly', () => {
    const cache = new ExistsCache(1000, 100)
    cache.set('a', true, 0)
    cache.set('b', false, 0)
    expect(cache.get('a', 999)).toBe(true)
    expect(cache.get('a', 1000)).toBeNull()
    expect(cache.get('b', 99)).toBe(false)
    expect(cache.get('b', 100)).toBeNull()
    expect(cache.get('c', 0)).toBeNull()
  })
})
