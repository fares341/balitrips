import { describe, expect, it } from 'vitest'

import {
  GOOGLE_PHOTO_MAX,
  gphotoUrl,
  isUsableMatch,
  parseGphotoUrl,
  resolvePlaceImages,
  snapWidth,
  trimGooglePhotos,
  type OwnImage,
} from './photo-urls'

const img = (id: string, thumb?: string): OwnImage => ({
  id,
  url: `/media/${id}/1280.webp`,
  thumb: thumb ?? null,
})
const never = () => false

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

  it('drops Google slots a place does not have', () => {
    const urls = ['/media/a/1.webp', gphotoUrl('p', 0), gphotoUrl('p', 1), gphotoUrl('p', 2)]
    expect(trimGooglePhotos(urls, 2)).toEqual([
      '/media/a/1.webp',
      gphotoUrl('p', 0),
      gphotoUrl('p', 1),
    ])
    expect(trimGooglePhotos(urls, 0)).toEqual(['/media/a/1.webp'])
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

describe('resolvePlaceImages precedence', () => {
  it('without Google it is exactly our media', () => {
    const out = resolvePlaceImages({
      slug: 'p',
      hero: img('h', '/t.webp'),
      gallery: [img('g1'), img('g2')],
      isShared: never,
      google: false,
    })
    expect(out).toEqual({
      heroImageUrl: '/media/h/1280.webp',
      heroThumbUrl: '/t.webp',
      gallery: ['/media/g1/1280.webp', '/media/g2/1280.webp'],
      googleSlots: 0,
    })
    expect(
      resolvePlaceImages({ slug: 'p', hero: null, gallery: [], isShared: never, google: false })
        .heroImageUrl,
    ).toBeNull()
  })

  it('a place with its own unique upload gets no Google photo at all', () => {
    const out = resolvePlaceImages({
      slug: 'p',
      hero: img('h', '/t.webp'),
      gallery: [img('g1')],
      isShared: never,
      google: true,
    })
    expect(out.heroImageUrl).toBe('/media/h/1280.webp')
    expect(out.heroThumbUrl).toBe('/t.webp')
    expect(out.gallery).toEqual(['/media/g1/1280.webp'])
    expect(out.googleSlots).toBe(0)
  })

  it('uploads rank before free photos (#51), and free photos block Google', () => {
    const free = { ...img('f1'), free: true }
    const out = resolvePlaceImages({
      slug: 'p',
      hero: free,
      gallery: [img('u1')],
      isShared: never,
      google: true,
    })
    expect(out.heroImageUrl).toBe('/media/u1/1280.webp')
    expect(out.gallery).toEqual(['/media/f1/1280.webp'])
    expect(out.googleSlots).toBe(0)
    const onlyFree = resolvePlaceImages({
      slug: 'p',
      hero: free,
      gallery: [],
      isShared: never,
      google: true,
    })
    expect(onlyFree.heroImageUrl).toBe('/media/f1/1280.webp')
    expect(onlyFree.googleSlots).toBe(0)
  })

  it('uses ONE Google photo by default when the place has nothing of its own', () => {
    const out = resolvePlaceImages({
      slug: 'p',
      hero: null,
      gallery: [],
      isShared: never,
      google: true,
    })
    expect(out.heroImageUrl).toBe(gphotoUrl('p', 0))
    expect(out.heroThumbUrl).toBe(gphotoUrl('p', 0, 400))
    expect(out.gallery).toEqual([])
    expect(out.googleSlots).toBe(1)
  })

  it('GOOGLE_PLACES_MAX_PHOTOS: more slots when configured, none at 0, capped at 10', () => {
    const base = { slug: 'p', hero: null, gallery: [], isShared: never, google: true }
    expect(resolvePlaceImages({ ...base, googleMax: 3 }).gallery).toEqual([
      gphotoUrl('p', 1),
      gphotoUrl('p', 2),
    ])
    expect(resolvePlaceImages({ ...base, googleMax: 0 })).toEqual({
      heroImageUrl: null,
      heroThumbUrl: null,
      gallery: [],
      googleSlots: 0,
    })
    expect(resolvePlaceImages({ ...base, googleMax: 99 }).googleSlots).toBe(GOOGLE_PHOTO_MAX)
  })

  it('photos shared with another place count as missing: one Google photo instead', () => {
    const shared = new Set(['h', 'g1'])
    const out = resolvePlaceImages({
      slug: 'p',
      hero: img('h'),
      gallery: [img('g1'), { ...img('h') }],
      isShared: (image) => shared.has(image.id),
      google: true,
    })
    expect(out.heroImageUrl).toBe(gphotoUrl('p', 0))
    expect(out.gallery).toEqual([])
  })

  it('a unique photo next to shared ones still wins over Google', () => {
    const out = resolvePlaceImages({
      slug: 'p',
      hero: img('h'),
      gallery: [img('g1')],
      isShared: (image) => image.id === 'h',
      google: true,
    })
    expect(out.heroImageUrl).toBe('/media/g1/1280.webp')
    expect(out.googleSlots).toBe(0)
  })

  it('keeps shared photos when there is no Google match', () => {
    const out = resolvePlaceImages({
      slug: 'p',
      hero: img('h'),
      gallery: [],
      isShared: () => true,
      google: false,
    })
    expect(out.heroImageUrl).toBe('/media/h/1280.webp')
  })

  it('caps the gallery', () => {
    const many = Array.from({ length: 20 }, (_, i) => img(`g${i}`))
    expect(
      resolvePlaceImages({ slug: 'p', hero: null, gallery: many, isShared: never, google: true })
        .gallery,
    ).toHaveLength(12)
  })
})

describe('Google photos are for place details only (owner, Nov 2026)', () => {
  it('cards, lists and thumbs keep our media and the glyph fallback; details get Google', () => {
    const own = { hero: null, gallery: [] as OwnImage[], isShared: never }
    const surfaces = resolvePlaceImages({ slug: 'p', ...own, google: false })
    const details = resolvePlaceImages({ slug: 'p', ...own, google: true })
    // No hero on cards → the category-glyph placeholder, never a Google URL.
    expect(surfaces.heroImageUrl).toBeNull()
    expect(surfaces.heroThumbUrl).toBeNull()
    expect(surfaces.gallery).toEqual([])
    expect(details.heroImageUrl).toBe(gphotoUrl('p', 0))
  })

  it('shared photos stay on cards but give way to Google in details', () => {
    const own = { hero: img('h'), gallery: [] as OwnImage[], isShared: () => true }
    expect(resolvePlaceImages({ slug: 'p', ...own, google: false }).heroImageUrl).toBe(
      '/media/h/1280.webp',
    )
    expect(resolvePlaceImages({ slug: 'p', ...own, google: true }).heroImageUrl).toBe(
      gphotoUrl('p', 0),
    )
  })
})
