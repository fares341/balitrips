import { describe, expect, it } from 'vitest'

import { emptyEntitlements, makeEntitlementSet, type FullMapPlace } from '@/lib/entitlements'
import type { MapRegion } from '@/lib/search/query'

import { buildRegionBubbles, regionAt } from './regions'

const region = (key: string, extra: Partial<MapRegion> = {}): MapRegion => ({
  key,
  label: { en: key },
  parentKey: null,
  centerLat: null,
  centerLon: null,
  radiusKm: null,
  ...extra,
})

const REGIONS: MapRegion[] = [
  region('central'),
  region('ubud', { parentKey: 'central', centerLat: -8.5069, centerLon: 115.2625, radiusKm: 6 }),
  region('islands'),
]

const place = (id: string, regionKey: string, parent: string | null, isFree: boolean) =>
  ({
    id,
    slug: id,
    name: { en: `Secret ${id}` },
    lat: -8.777777,
    lon: 115.555555,
    isFree,
    requiredEntitlement: 'map_access',
    regionKey,
    parentRegionKey: parent,
  }) as unknown as FullMapPlace

const PLACES = [
  place('a', 'ubud', 'central', true),
  place('b', 'islands', null, false),
  place('c', 'islands', null, false),
]

describe('buildRegionBubbles', () => {
  it('reports locked counts per region without any place data', () => {
    const bubbles = buildRegionBubbles(PLACES, REGIONS, emptyEntitlements())
    const json = JSON.stringify(bubbles)
    expect(json).not.toContain('Secret')
    expect(json).not.toContain('777777')
    expect(json).not.toContain('555555')
    const islands = bubbles.find((b) => b.key === 'islands')
    expect(islands?.lockedCount).toBe(2)
    expect(islands?.locked).toBe(true)
    const ubud = bubbles.find((b) => b.key === 'ubud')
    expect(ubud?.locked).toBe(false)
    // `central` is represented by its area (ubud), not double-counted.
    expect(bubbles.some((b) => b.key === 'central')).toBe(false)
  })

  it('unlocks everything for map_access', () => {
    const bubbles = buildRegionBubbles(PLACES, REGIONS, makeEntitlementSet(['map_access']))
    expect(bubbles.every((b) => !b.locked && b.lockedCount === 0)).toBe(true)
  })
})

describe('regionAt (a new place from the Studio assistant)', () => {
  it('prefers the neighbourhood holding the point, then the broad region', () => {
    expect(regionAt(REGIONS, { lat: -8.51, lon: 115.26 })?.key).toBe('ubud')
    // central has only a fallback centre (-8.45, 115.24) and the default 15 km circle
    expect(regionAt(REGIONS, { lat: -8.3, lon: 115.3 })?.key).toBe('central')
    // far from everything: none, the admin picks one in the editor
    expect(regionAt(REGIONS, { lat: -8.1, lon: 114.5 })).toBeNull()
  })
})
