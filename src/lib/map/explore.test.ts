import { describe, expect, it } from 'vitest'

import {
  ALL_AREA,
  areaOptions,
  cardImages,
  categoryCounts,
  categoryStyle,
  clusterPoints,
  countRows,
  defaultCategoryStyle,
  parseSelection,
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
  it('reads area and up to three known categories', () => {
    expect(
      parseSelection({ area: 'seminyak', cat: 'restaurants,cafes,beaches,malls' }, AREAS, CATS),
    ).toEqual({ area: 'seminyak', categories: ['restaurants', 'cafes', 'beaches'] })
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
    expect(toggleCategory(['a', 'b', 'c'], 'd')).toEqual({ next: ['a', 'b', 'c'], full: true })
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
