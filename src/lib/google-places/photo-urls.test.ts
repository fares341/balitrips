import { describe, expect, it } from 'vitest'

import {
  GOOGLE_PHOTO_MAX,
  gphotoUrl,
  isUsableMatch,
  parseGphotoUrl,
  resolvePlaceImages,
  snapWidth,
  WIDELY_SHARED,
  type OwnImage,
} from './photo-urls'

const img = (id: string, thumb?: string): OwnImage => ({
  id,
  url: `/media/${id}/1280.webp`,
  thumb: thumb ?? null,
})

describe('Google photo URLs', () => {
  it('builds and parses our own photo route', () => {
    expect(gphotoUrl('kuta-beach', 0)).toBe('/api/places/kuta-beach/gphoto/0')
    expect(gphotoUrl('kuta beach', 2, 400)).toBe('/api/places/kuta%20beach/gphoto/2?w=400')
    expect(parseGphotoUrl('/api/places/kuta%20beach/gphoto/2?w=400')).toEqual({
      slug: 'kuta beach',
      index: 2,
    })
    expect(parseGphotoUrl('https://balitrips.co/api/places/x/gphoto/1?img-retry=1')).toEqual({
      slug: 'x',
      index: 1,
    })
    expect(parseGphotoUrl('/media/abc/1280.webp')).toBeNull()
    expect(parseGphotoUrl(null)).toBeNull()
  })

  it('only auto and confirmed matches with an id are used', () => {
    expect(isUsableMatch('auto', 'ChIJ123')).toBe(true)
    expect(isUsableMatch('confirmed', 'ChIJ123')).toBe(true)
    expect(isUsableMatch('review', 'ChIJ123')).toBe(false)
    expect(isUsableMatch('rejected', 'ChIJ123')).toBe(false)
    expect(isUsableMatch('auto', null)).toBe(false)
  })

  it('snaps requested widths', () => {
    expect(snapWidth('300')).toBe(320)
    expect(snapWidth('700')).toBe(960)
    expect(snapWidth('99999')).toBe(1600)
    expect(snapWidth(null)).toBe(1280)
  })
})

describe('the ONE photo of a place (owner, Nov 2026, final)', () => {
  const free = (id: string): OwnImage => ({ ...img(id, `/media/${id}/320.webp`), free: true })
  const uses = (counts: Record<string, number>) => (image: OwnImage) => counts[image.id] ?? 1
  const base = { slug: 'p', hero: null, gallery: [] as OwnImage[], placesUsing: uses({}) }

  it("1. the owner's own unique upload wins, even over Google", () => {
    const out = resolvePlaceImages({
      ...base,
      hero: img('h', '/t.webp'),
      gallery: [img('g1')],
      google: true,
    })
    expect(out).toEqual({
      heroImageUrl: '/media/h/1280.webp',
      heroThumbUrl: '/t.webp',
      gallery: ['/media/g1/1280.webp'],
      source: 'own',
    })
  })

  it('2. otherwise Google photo #0 — before free photos', () => {
    const out = resolvePlaceImages({ ...base, hero: free('f1'), google: true })
    expect(out).toEqual({
      heroImageUrl: gphotoUrl('p', 0),
      heroThumbUrl: gphotoUrl('p', 0, 400),
      gallery: [],
      source: 'google',
    })
  })

  it('3. free photos are the fallback without a Google match (or over the cap)', () => {
    const out = resolvePlaceImages({
      ...base,
      hero: free('f1'),
      gallery: [free('f2')],
      google: false,
    })
    expect(out.heroImageUrl).toBe('/media/f1/1280.webp')
    expect(out.heroThumbUrl).toBe('/media/f1/320.webp')
    expect(out.source).toBe('free')
  })

  it('4. a photo shared with one other place comes after free photos', () => {
    const placesUsing = uses({ h: 2 })
    expect(
      resolvePlaceImages({
        ...base,
        placesUsing,
        hero: img('h'),
        gallery: [free('f1')],
        google: false,
      }).source,
    ).toBe('free')
    expect(
      resolvePlaceImages({ ...base, placesUsing, hero: img('h'), google: false }).heroImageUrl,
    ).toBe('/media/h/1280.webp')
    // A shared upload never beats Google.
    expect(resolvePlaceImages({ ...base, placesUsing, hero: img('h'), google: true }).source).toBe(
      'google',
    )
  })

  it('never shows a photo used by 3 or more places: category glyph instead', () => {
    const placesUsing = uses({ h: 3, f1: 5 })
    const out = resolvePlaceImages({
      ...base,
      placesUsing,
      hero: img('h'),
      gallery: [free('f1')],
      google: false,
    })
    expect(out).toEqual({ heroImageUrl: null, heroThumbUrl: null, gallery: [], source: null })
    expect(WIDELY_SHARED).toBe(3)
  })

  it('5. nothing at all: the category glyph (null)', () => {
    expect(resolvePlaceImages({ ...base, google: false }).heroImageUrl).toBeNull()
  })

  it('place-page gallery: own photos only, never widely shared, never a second Google photo', () => {
    const out = resolvePlaceImages({
      ...base,
      placesUsing: uses({ g2: 3 }),
      hero: img('h'),
      gallery: [img('g1'), img('g2'), img('g3')],
      google: true,
    })
    expect(out.heroImageUrl).toBe('/media/h/1280.webp')
    expect(out.gallery).toEqual(['/media/g1/1280.webp', '/media/g3/1280.webp'])
    const many = Array.from({ length: 20 }, (_, i) => free(`f${i}`))
    expect(resolvePlaceImages({ ...base, gallery: many, google: true }).gallery).toEqual([])
    expect(resolvePlaceImages({ ...base, google: true }).gallery).toEqual([])
    expect(GOOGLE_PHOTO_MAX).toBe(1)
  })
})
