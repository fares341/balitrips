import { describe, expect, it } from 'vitest'

import {
  findExisting,
  internalNotesFor,
  mergeLocalized,
  parsePlacesCsv,
  pickPlaceImages,
  regionFor,
  similarNames,
  suffixedSlug,
  type ExistingPlace,
} from './new-places'

const HEADER =
  'slug,category_key,name_en,name_ar,name_id,lat,lon,maps_link,address,area,phone,website,opening_hours,short_ar,short_en,short_id,long_ar,long_en,long_id,image_sources'

describe('parsePlacesCsv', () => {
  it('parses quoted commas, Arabic and image sources', () => {
    const csv = `${HEADER}\nmasjid-a,mosques,"Masjid A, Kuta",مسجد أ,Masjid A,-8.72,115.17,,"Jl. X, Kuta",Kuta,,,,قصير,short,pendek,,,,https://a/1.jpg|https://a/2.jpg\n`
    const { rows, invalid, headerProblem } = parsePlacesCsv(csv)
    expect(headerProblem).toBeNull()
    expect(invalid).toEqual([])
    expect(rows[0]).toMatchObject({
      slug: 'masjid-a',
      categoryKey: 'mosques',
      name: { en: 'Masjid A, Kuta', ar: 'مسجد أ' },
      address: 'Jl. X, Kuta',
      short: { ar: 'قصير', en: 'short', id: 'pendek' },
      imageSources: ['https://a/1.jpg', 'https://a/2.jpg'],
    })
  })

  it('reports invalid rows with reasons', () => {
    const csv = [
      HEADER,
      'a,beaches,A,,,-8.7,115.1',
      'b,malls,,,,-8.7,115.1',
      'c,malls,C,,,-6.2,106.8',
      'd,malls,D,,,x,115.1',
      'e,malls,E,,,-8.7,115.1',
      'e,malls,E2,,,-8.7,115.1',
      'Bad Slug,malls,F,,,-8.7,115.1',
    ].join('\n')
    const { rows, invalid } = parsePlacesCsv(csv)
    expect(rows.map((r) => r.slug)).toEqual(['e'])
    expect(invalid.map((r) => r.reason)).toEqual([
      expect.stringContaining('unknown category_key'),
      'name_en is empty',
      expect.stringContaining('outside Bali'),
      'lat/lon not numbers',
      'duplicate slug in places.csv',
      'invalid slug',
    ])
  })

  it('flags missing required columns', () => {
    expect(parsePlacesCsv('slug,name_en\nx,y').headerProblem).toContain('category_key')
  })
})

describe('pickPlaceImages', () => {
  it('keeps only <slug>-N files, ordered', () => {
    expect(
      pickPlaceImages('mall-x', [
        'mall-x-10.webp',
        'mall-x-2.webp',
        'mall-x-1.jpg',
        'other-1.webp',
        'mall-x-cover.webp',
      ]),
    ).toEqual([
      { file: 'mall-x-1.jpg', position: 1 },
      { file: 'mall-x-2.webp', position: 2 },
      { file: 'mall-x-10.webp', position: 10 },
    ])
  })
})

describe('similarNames', () => {
  it.each([
    ['Masjid Agung Ibnu Batutah', 'Ibnu Batutah Mosque', true],
    ['Beachwalk Shopping Center', 'Beachwalk', true],
    ['Siloam Hospitals Denpasar', 'RS Siloam Denpasar', true],
    ['Masjid Agung Palapa', 'Masjid Raya Ubud', false],
    ['Pasar Badung', 'Pasar Kumbasari', false],
    ['مسجد ابن بطوطة', 'مسجد إبن بطوطة', true],
  ])('%s ~ %s → %s', (a, b, want) => {
    expect(similarNames(a, b)).toBe(want)
  })
})

describe('findExisting', () => {
  const place = (o: Partial<ExistingPlace>): ExistingPlace => ({
    id: 'p1',
    slug: 'beachwalk',
    categoryKey: 'malls',
    name: { en: 'Beachwalk Shopping Center' },
    lat: -8.7175,
    lon: 115.1686,
    ...o,
  })
  const row = {
    slug: 'beachwalk-kuta',
    categoryKey: 'malls' as const,
    name: { en: 'Beachwalk', ar: '', id: '' },
    lat: -8.7177,
    lon: 115.1689,
  }

  it('matches a nearby similar name in any category, preferring the same one', () => {
    expect(findExisting(row, [place({ categoryKey: 'sights' })])).toMatchObject({
      kind: 'matched',
      sameCategory: false,
    })
    const r = findExisting(row, [place({ id: 'a', categoryKey: 'sights' }), place({ id: 'b' })])
    expect(r).toMatchObject({ kind: 'matched', sameCategory: true, place: { id: 'b' } })
  })

  it('does not match far away or with a different name', () => {
    expect(findExisting(row, [place({ lat: -8.73 })]).kind).toBe('new')
    expect(findExisting(row, [place({ name: { en: 'Discovery Mall' } })]).kind).toBe('new')
  })

  it('reports a slug taken by another place as a conflict', () => {
    const r = findExisting(row, [
      place({ slug: 'beachwalk-kuta', name: { en: 'Other' }, lat: -8.5 }),
    ])
    expect(r).toMatchObject({ kind: 'conflict' })
  })

  it('suffixes slugs', () => {
    expect(suffixedSlug('masjid-a', 'Nusa Dua', new Set())).toBe('masjid-a-nusa-dua')
    expect(suffixedSlug('masjid-a', '', new Set(['masjid-a-2']))).toBe('masjid-a-3')
  })
})

describe('regionFor', () => {
  const regions = [
    {
      id: 's',
      key: 'south',
      label: { en: 'South Bali' },
      centerLat: -8.76,
      centerLon: 115.18,
      radiusKm: 20,
    },
    {
      id: 'k',
      key: 'kuta',
      label: { en: 'Kuta' },
      centerLat: -8.72,
      centerLon: 115.17,
      radiusKm: 3,
    },
    {
      id: 'n',
      key: 'nusa-dua',
      label: { en: 'Nusa Dua' },
      centerLat: null,
      centerLon: null,
      radiusKm: null,
    },
  ]
  it('uses the area name, then the smallest circle, else none', () => {
    expect(regionFor({ lat: -8.0, lon: 115 }, 'Nusa Dua', regions)?.id).toBe('n')
    expect(regionFor({ lat: -8.721, lon: 115.171 }, 'Legian', regions)?.id).toBe('k')
    expect(regionFor({ lat: -8.8, lon: 115.2 }, '', regions)?.id).toBe('s')
    expect(regionFor({ lat: -8.2, lon: 114.6 }, '', regions)).toBeNull()
  })
})

describe('mergeLocalized / notes', () => {
  it('fills empty locales only unless overwrite', () => {
    expect(mergeLocalized({ en: 'old', ar: '', id: '' }, { en: 'new', ar: 'ع' }, false)).toEqual({
      next: { en: 'old', ar: 'ع', id: '' },
      changed: true,
    })
    expect(
      mergeLocalized({ en: 'old', ar: 'ع', id: '' }, { en: 'old', ar: 'ع' }, false).changed,
    ).toBe(false)
    expect(mergeLocalized({ en: 'old', ar: '', id: '' }, { en: 'new' }, true).next.en).toBe('new')
  })

  it('keeps contact details in internal notes', () => {
    const notes = internalNotesFor({
      phone: '+62 1',
      website: 'https://x',
      address: 'Jl',
      area: 'Kuta',
      mapsLink: 'https://maps',
      openingHours: '24h',
      imageSources: [],
    } as never)
    expect(notes).toContain('Phone: +62 1')
    expect(notes).toContain('Google Maps: https://maps')
    expect(notes).not.toContain('Opening hours')
  })
})
