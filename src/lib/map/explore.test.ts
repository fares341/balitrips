import { describe, expect, it } from 'vitest'

import {
  ALL_AREA,
  areaOptions,
  cardImages,
  categoryCounts,
  categoryStyle,
  clusterPoints,
  countRows,
  byDistance,
  cleanTravelerTypes,
  defaultCategoryStyle,
  durationBucket,
  facetOptions,
  mapQuery,
  matchesFacts,
  MAX_CATEGORIES,
  nearestChain,
  parseFactFilter,
  parseSelection,
  shortText,
  toFeatureCollection,
  windowRange,
  selectionQuery,
  selectPlaces,
  stepOf,
  toggleCategory,
} from './explore'

const AREAS = new Set(['south', 'central', 'seminyak', 'ubud'])
const CATS = new Set(['restaurants', 'cafes', 'beaches', 'malls', 'hospital'])

const place = (
  id: string,
  regionKey: string | null,
  parentRegionKey: string | null,
  categoryKey: string | null,
  free: boolean,
) => ({ id, regionKey, parentRegionKey, categoryKey, lat: -8.6, lon: 115.1, free })

const PLACES = [
  place('a', 'seminyak', 'south', 'beaches', true),
  place('b', 'seminyak', 'south', 'restaurants', false),
  place('c', 'ubud', 'central', 'restaurants', false),
  place('d', 'ubud', 'central', 'beaches', true),
  place('e', 'south', null, 'malls', true),
  place('f', 'seminyak', 'south', null, true),
]

describe('parseSelection', () => {
  it('reads area and every known category (map v3: no three-type cap)', () => {
    expect(
      parseSelection({ area: 'seminyak', cat: 'restaurants,cafes,beaches,malls' }, AREAS, CATS),
    ).toEqual({ area: 'seminyak', categories: ['restaurants', 'cafes', 'beaches', 'malls'] })
  })
  it('resolves aliases and drops unknown or unsafe keys', () => {
    expect(parseSelection({ area: 'mars', cat: 'rest,cafe,<x>' }, AREAS, CATS)).toEqual({
      area: ALL_AREA,
      categories: ['restaurants', 'cafes'],
    })
  })
  it('keeps the old free-guide links working (cat only → whole island)', () => {
    expect(parseSelection({ cat: 'hospitals' }, AREAS, CATS)).toEqual({
      area: ALL_AREA,
      categories: ['hospital'],
    })
  })
  it('accepts the legacy ?region=', () => {
    expect(parseSelection({ region: 'ubud' }, AREAS, CATS)).toEqual({
      area: 'ubud',
      categories: [],
    })
  })
  it('round-trips through the query string', () => {
    expect(selectionQuery({ area: 'seminyak', categories: ['restaurants', 'cafes'] })).toBe(
      '?area=seminyak&cat=restaurants,cafes',
    )
    expect(selectionQuery({ area: null, categories: [] })).toBe('')
  })
  it('maps to a step', () => {
    expect(stepOf({ area: null, categories: [] })).toBe(1)
    expect(stepOf({ area: 'all', categories: [] })).toBe(2)
    expect(stepOf({ area: 'all', categories: ['malls'] })).toBe(3)
  })
})

describe('toggleCategory', () => {
  it('adds, removes and refuses a fourth', () => {
    expect(toggleCategory([], 'a')).toEqual({ next: ['a'], full: false })
    expect(toggleCategory(['a', 'b'], 'a')).toEqual({ next: ['b'], full: false })
    const many = Array.from({ length: MAX_CATEGORIES }, (_, i) => `k${i}`)
    expect(toggleCategory(many, 'z')).toEqual({ next: many, full: true })
  })
})

describe('counts and areas', () => {
  const rows = countRows(PLACES)
  it('counts per category in an area, a direction and the island', () => {
    expect(Object.fromEntries(categoryCounts(rows, 'seminyak'))).toEqual({
      beaches: 1,
      restaurants: 1,
    })
    expect(Object.fromEntries(categoryCounts(rows, 'south'))).toEqual({
      beaches: 1,
      restaurants: 1,
      malls: 1,
    })
    expect(categoryCounts(rows, ALL_AREA).get('restaurants')).toBe(2)
  })
  it('offers only areas with places, directions first', () => {
    const options = areaOptions(
      [
        { key: 'seminyak', label: { en: 'Seminyak' }, parentKey: 'south' },
        { key: 'north', label: { en: 'North' }, parentKey: null },
        { key: 'central', label: { en: 'Central' }, parentKey: null },
        { key: 'south', label: { en: 'South' }, parentKey: null },
      ],
      rows,
      ['beaches', 'restaurants', 'malls'],
    )
    expect(options.map((one) => one.key)).toEqual(['south', 'central', 'seminyak'])
    expect(options[0]?.count).toBe(3)
  })
  it('carries no place identity', () => {
    expect(JSON.stringify(rows)).not.toMatch(/"[a-f]"/)
  })
})

describe('selectPlaces (access)', () => {
  it('returns only selected categories in the area, locked ones only counted', () => {
    const { open, lockedCount } = selectPlaces(
      PLACES,
      { area: 'south', categories: ['beaches', 'restaurants'] },
      (p) => p.free,
    )
    expect(open.map((p) => p.id)).toEqual(['a'])
    expect(lockedCount).toBe(1)
  })
  it('a subscriber opens everything selected', () => {
    const { open, lockedCount } = selectPlaces(
      PLACES,
      { area: ALL_AREA, categories: ['restaurants'] },
      () => true,
    )
    expect(open.map((p) => p.id)).toEqual(['b', 'c'])
    expect(lockedCount).toBe(0)
  })
})

describe('look and layout', () => {
  it('uses Studio values and falls back to the concept palette', () => {
    const isIcon = (name: string): name is 'food' => name === 'food'
    expect(defaultCategoryStyle('cafes')).toEqual({ color: '#2F6FB5', icon: 'coffee' })
    expect(categoryStyle('restaurants', { color: '#123456', icon: 'nope' }, isIcon)).toEqual({
      color: '#123456',
      icon: 'food',
    })
    expect(categoryStyle('hospital', { color: 'red', icon: null }, isIcon).color).toBe('#D2342F')
  })
  it('card images: hero first, unique, at most three', () => {
    expect(cardImages('h', ['h', 'a', 'b', 'c'])).toEqual(['h', 'a', 'b'])
    expect(cardImages(null, [])).toEqual([])
  })
  it('clusters only truly overlapping pins and never the selected one', () => {
    const pts = [
      { id: '1', x: 0, y: 0 },
      { id: '2', x: 10, y: 0 },
      { id: '3', x: 100, y: 0 },
    ]
    expect(clusterPoints(pts, 30).map((c) => c.ids)).toEqual([['1', '2'], ['3']])
    expect(clusterPoints(pts, 30, '1').map((c) => c.ids)).toEqual([['1'], ['2'], ['3']])
  })
})

describe('map v3 helpers', () => {
  it('traveler types: known values only, display order, unique', () => {
    expect(cleanTravelerTypes(['solo', 'aliens', 'families', 'solo'])).toEqual(['families', 'solo'])
    expect(cleanTravelerTypes(null)).toEqual([])
  })
  it('duration buckets', () => {
    expect(durationBucket(null)).toBeNull()
    expect(durationBucket(0)).toBeNull()
    expect(durationBucket(90)).toBe('short')
    expect(durationBucket(120)).toBe('short')
    expect(durationBucket(121)).toBe('half')
    expect(durationBucket(240)).toBe('half')
    expect(durationBucket(600)).toBe('full')
  })
  it('facet options list only values present in the data (none → hidden chip)', () => {
    expect(facetOptions([{ travelerTypes: null, durationMinutes: null }])).toEqual({
      travelers: [],
      durations: [],
    })
    expect(
      facetOptions([
        { travelerTypes: ['kids', 'couples'], durationMinutes: 300 },
        { travelerTypes: [], durationMinutes: 45 },
      ]),
    ).toEqual({ travelers: ['couples', 'kids'], durations: ['short', 'full'] })
  })
  it('parses and matches fact filters (any-of within, all-of across)', () => {
    const f = parseFactFilter({ traveler: 'couples,bogus', dur: 'short,full,x' })
    expect(f).toEqual({ travelers: ['couples'], durations: ['short', 'full'] })
    expect(matchesFacts({ travelerTypes: ['couples'], durationMinutes: 60 }, f)).toBe(true)
    expect(matchesFacts({ travelerTypes: ['couples'], durationMinutes: 200 }, f)).toBe(false)
    expect(matchesFacts({ travelerTypes: null, durationMinutes: 60 }, f)).toBe(false)
    expect(matchesFacts({ travelerTypes: null, durationMinutes: null }, parseFactFilter({}))).toBe(
      true,
    )
  })
  it('map query leaves defaults out', () => {
    expect(mapQuery({ area: ALL_AREA, categories: [] }, { travelers: [], durations: [] })).toBe('')
    expect(
      mapQuery(
        { area: 'ubud', categories: ['a', 'b'] },
        { travelers: ['solo'], durations: ['half'] },
      ),
    ).toBe('?area=ubud&cat=a,b&traveler=solo&dur=half')
  })
  it('short text cuts at a word', () => {
    expect(shortText('  a   b ')).toBe('a b')
    expect(shortText('')).toBeNull()
    const out = shortText('word '.repeat(60), 40) ?? ''
    expect(out.length).toBeLessThanOrEqual(41)
    expect(out.endsWith('…')).toBe(true)
  })
  it('nearest chain walks to the closest unvisited place', () => {
    const p = (id: string, lon: number) => ({ id, lat: -8.5, lon })
    expect(
      nearestChain([p('a', 115), p('far', 115.5), p('near', 115.01), p('mid', 115.2)]).map(
        (x) => x.id,
      ),
    ).toEqual(['a', 'near', 'mid', 'far'])
    expect(
      byDistance([p('x', 115.3), p('y', 115.1)], { lat: -8.5, lon: 115 }).map((x) => x.id),
    ).toEqual(['y', 'x'])
  })
  it('window range keeps a full window at the edges', () => {
    expect(windowRange(0, 0)).toEqual([0, 0])
    expect(windowRange(5, 2, 10)).toEqual([0, 5])
    expect(windowRange(100, 0, 10)).toEqual([0, 21])
    expect(windowRange(100, 50, 10)).toEqual([40, 61])
    expect(windowRange(100, 99, 10)).toEqual([79, 100])
  })
  it('feature collection carries ids and draw order only', () => {
    const fc = toFeatureCollection([
      {
        id: 'p1',
        slug: 's',
        name: 'n',
        categoryKey: 'c',
        lat: -8.4,
        lon: 115.1,
        rating: null,
        reviews: null,
        desc: null,
        thumb: null,
        images: [],
        priceMinor: null,
        currency: null,
        activitySlug: null,
        canFavorite: false,
      },
    ])
    expect(fc.features[0]).toEqual({
      type: 'Feature',
      id: 0,
      properties: { id: 'p1', i: 0, s: 8.4 },
      geometry: { type: 'Point', coordinates: [115.1, -8.4] },
    })
  })
})
