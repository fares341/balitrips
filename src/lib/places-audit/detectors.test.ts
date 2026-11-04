import { describe, expect, it } from 'vitest'

import {
  clusterByDistance,
  dataProblems,
  distanceMetres,
  findRepeatsInPlace,
  findSharedPhotos,
  groupByName,
  groupShared,
  hammingHex,
  normaliseName,
} from './detectors'

describe('normaliseName', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normaliseName('  Café  Tegallalang! ')).toBe('cafe tegallalang')
    expect(normaliseName('PURA Tanah-Lot')).toBe(normaliseName('pura tanah lot'))
  })

  it('folds Arabic diacritics, tatweel and letter variants', () => {
    expect(normaliseName('مَسْجِدُ الإِحسان')).toBe(normaliseName('مسجد الاحسان'))
    expect(normaliseName('شاطـــئ كوتا')).toBe(normaliseName('شاطئ كوتا'))
    expect(normaliseName('مكتبة')).toBe(normaliseName('مكتبه'))
    expect(normaliseName('مستشفى')).toBe(normaliseName('مستشفي'))
    expect(normaliseName('٣ قرود')).toBe('3 قرود')
  })

  it('returns empty for empty input', () => {
    expect(normaliseName(null)).toBe('')
    expect(normaliseName(' - ')).toBe('')
  })
})

describe('groupByName', () => {
  it('matches across locales and transitively', () => {
    const groups = groupByName([
      { id: 'a', name: { en: 'Tanah Lot', ar: 'تانا لوت' } },
      { id: 'b', name: { en: 'TANAH LOT ', id: 'Pura X' } },
      { id: 'c', name: { id: 'pura x' } },
      { id: 'd', name: { en: 'Uluwatu' } },
      { id: 'e', name: { ar: 'Uluwatu temple' } },
    ])
    expect(groups).toEqual([{ key: expect.any(String), ids: ['a', 'b', 'c'] }])
  })
})

describe('distance clustering', () => {
  it('measures metres', () => {
    const d = distanceMetres({ lat: -8.65, lon: 115.13 }, { lat: -8.65, lon: 115.1309 })
    expect(d).toBeGreaterThan(95)
    expect(d).toBeLessThan(105)
  })

  it('clusters same-category places within 75 m, single-link', () => {
    const base = { lat: -8.65, lon: 115.13 }
    const step = 0.0006 // ~66 m of longitude
    const clusters = clusterByDistance([
      { id: 'a', category: 'mosque', ...base },
      { id: 'b', category: 'mosque', lat: base.lat, lon: base.lon + step },
      { id: 'c', category: 'mosque', lat: base.lat, lon: base.lon + 2 * step },
      { id: 'd', category: 'mall', lat: base.lat, lon: base.lon + step / 2 },
      { id: 'e', category: 'mosque', lat: base.lat + 0.01, lon: base.lon },
    ])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.ids).toEqual(['a', 'b', 'c'])
    expect(clusters[0]!.category).toBe('mosque')
    expect(clusters[0]!.maxLinkMetres).toBeLessThanOrEqual(75)
  })

  it('does not join places just over the radius', () => {
    expect(
      clusterByDistance([
        { id: 'a', category: null, lat: -8.5, lon: 115.2 },
        { id: 'b', category: null, lat: -8.5, lon: 115.2008 },
      ]),
    ).toEqual([])
  })
})

describe('photo hash grouping', () => {
  it('groupShared needs two distinct owners', () => {
    const g = groupShared(
      [
        { o: 'p1', v: 'x' },
        { o: 'p1', v: 'x' },
        { o: 'p2', v: 'y' },
        { o: 'p3', v: 'y' },
      ],
      (r) => r.v,
      (r) => r.o,
    )
    expect(g).toEqual([{ value: 'y', owners: ['p2', 'p3'] }])
  })

  it('hamming distance on hex', () => {
    expect(hammingHex('ff00', 'ff00')).toBe(0)
    expect(hammingHex('ff00', 'fe01')).toBe(2)
    expect(hammingHex('ff', 'ff00')).toBe(Number.POSITIVE_INFINITY)
  })

  it('finds shared files, identical bytes and near-identical pictures', () => {
    const found = findSharedPhotos([
      { placeId: 'mosque1', key: 'm1', sha: 's1', dhash: '0000000000000000' },
      { placeId: 'mosque2', key: 'm1', sha: 's1', dhash: '0000000000000000' },
      { placeId: 'laundry', key: 'm2', sha: 's2', dhash: 'ffffffffffffff00' },
      { placeId: 'barber', key: 'm3', sha: 's2', dhash: 'ffffffffffffff00' },
      { placeId: 'beach', key: 'm4', sha: 's4', dhash: 'f0f0f0f0f0f0f0f0' },
      { placeId: 'beach2', key: 'm5', sha: 's5', dhash: 'f0f0f0f0f0f0f0f1' },
      { placeId: 'other', key: 'm6', sha: 's6', dhash: '0f0f0f0f0f0f0f0f' },
    ])
    expect(found).toContainEqual({ key: 'm1', kind: 'file', placeIds: ['mosque1', 'mosque2'] })
    expect(found).toContainEqual({
      key: 'sha:s2',
      kind: 'content',
      placeIds: ['barber', 'laundry'],
    })
    expect(found).toContainEqual({
      key: 'dhash:f0f0f0f0f0f0f0f0',
      kind: 'similar',
      placeIds: ['beach', 'beach2'],
    })
    // Identical bytes are not reported again as «similar».
    expect(found.filter((f) => f.kind === 'similar')).toHaveLength(1)
    expect(found.some((f) => f.placeIds.includes('other'))).toBe(false)
  })

  it('finds repeats inside one gallery', () => {
    expect(
      findRepeatsInPlace([
        { placeId: 'p', key: 'a', sha: 's' },
        { placeId: 'p', key: 'a', sha: 's' },
        { placeId: 'p', key: 'b', sha: 's' },
        { placeId: 'q', key: 'a' },
      ]),
    ).toEqual([
      { placeId: 'p', key: 'a', times: 2, kind: 'file' },
      { placeId: 'p', key: 'sha:s', times: 2, kind: 'content' },
    ])
  })
})

describe('dataProblems', () => {
  it('flags placeholder slugs, missing names, photos and coordinates', () => {
    expect(
      dataProblems({
        slug: 'place-17',
        name: { en: 'X', ar: ' ' },
        heroKey: null,
        galleryKeys: [],
        lat: 1.3,
        lon: 103.8,
      }),
    ).toEqual([
      'placeholder_slug',
      'missing_name_ar',
      'missing_name_id',
      'no_hero',
      'empty_gallery',
      'outside_bali',
    ])
    expect(
      dataProblems({
        slug: 'tanah-lot',
        name: { en: 'a', ar: 'b', id: 'c' },
        heroKey: 'h',
        galleryKeys: ['g'],
        lat: -8.62,
        lon: 115.08,
      }),
    ).toEqual([])
    expect(
      dataProblems({
        slug: 's',
        name: { en: 'a', ar: 'b', id: 'c' },
        heroKey: 'h',
        galleryKeys: ['g'],
        lat: 0,
        lon: 0,
      }),
    ).toEqual(['bad_coordinates'])
  })
})
