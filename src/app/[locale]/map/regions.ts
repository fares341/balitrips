/**
 * Region bubbles and the free zone — computed on the SERVER from region data.
 *
 * Pure (no database) so it can be unit-tested. Input is the unredacted place
 * list, which never leaves the server; output is region-level only: a key, a
 * label, the region's own centre (from the `regions` table, or a fixed
 * geographic fallback below — never derived from a place's coordinates), and
 * how many places in it are locked for this viewer. No place id, name or
 * coordinate of a locked place is in the result.
 */

import type { EntitlementSet, FullMapPlace } from '@/lib/entitlements'
import { haversineKm } from '@/lib/geo'
import type { MapRegion } from '@/lib/search/query'

/** Where to put a bubble for a top-level region the admin gave no centre. */
const FALLBACK_CENTERS: Record<string, { lat: number; lon: number }> = {
  north: { lat: -8.2, lon: 115.2 },
  kintamani: { lat: -8.255, lon: 115.355 },
  east: { lat: -8.4, lon: 115.6 },
  'east-bali': { lat: -8.4, lon: 115.6 },
  islands: { lat: -8.73, lon: 115.53 },
  'nusa-penida': { lat: -8.73, lon: 115.53 },
  central: { lat: -8.45, lon: 115.24 },
  south: { lat: -8.76, lon: 115.18 },
  west: { lat: -8.3, lon: 114.7 },
}

/** Decorative bubble thumbnails from the brand package (public/brand). */
const REGION_IMAGES: Record<string, string> = {
  ubud: '/brand/rice-walk.jpg',
  central: '/brand/jungle.jpg',
  canggu: '/brand/beach-palms.jpg',
  seminyak: '/brand/sunset.jpg',
  kuta: '/brand/beach-palms.jpg',
  sanur: '/brand/beach-palms.jpg',
  'nusa-dua': '/brand/jungle-pool.jpg',
  south: '/brand/cliff-beach.jpg',
  uluwatu: '/brand/cliff-beach.jpg',
  islands: '/brand/kelingking.jpg',
  'nusa-penida': '/brand/kelingking.jpg',
  north: '/brand/aerial-cliff.jpg',
  kintamani: '/brand/aerial-cliff.jpg',
  east: '/brand/lempuyang.jpg',
  'east-bali': '/brand/lempuyang.jpg',
}

export interface RegionBubble {
  key: string
  label: Record<string, string>
  lat: number
  lon: number
  radiusKm: number
  /** Places in this region the viewer cannot see (count only). */
  lockedCount: number
  /** Covered by the paywall for this viewer (shows the lock icon). */
  locked: boolean
  image: string | null
}

export interface FreeZone {
  key: string
  label: Record<string, string>
  lat: number
  lon: number
  radiusKm: number
}

/** The configurable free area: `MAP_FREE_REGION` (a region key), Ubud by default. */
export function freeRegionKey(): string {
  const raw = (process.env.MAP_FREE_REGION ?? '').trim().toLowerCase()
  return /^[a-z0-9-]{1,64}$/.test(raw) ? raw : 'ubud'
}

function inRegion(place: FullMapPlace, key: string): boolean {
  return place.regionKey === key || place.parentRegionKey === key
}

function centerOf(region: MapRegion): { lat: number; lon: number } | null {
  if (region.centerLat !== null && region.centerLon !== null) {
    return { lat: region.centerLat, lon: region.centerLon }
  }
  return FALLBACK_CENTERS[region.key] ?? null
}

/**
 * The free area's outline: the region's centre and radius, widened so every
 * FREE place in that region sits inside it. Free places are public to every
 * visitor, so reading their coordinates here exposes nothing; locked places
 * never influence the circle.
 */
export function buildFreeZone(
  regions: readonly MapRegion[],
  key: string,
  places: readonly FullMapPlace[] = [],
): FreeZone | null {
  const region = regions.find((entry) => entry.key === key)
  if (region === undefined) return null
  const center = centerOf(region)
  if (center === null) return null
  let radiusKm = region.radiusKm ?? 6
  for (const place of places) {
    if (!place.isFree || !inRegion(place, key)) continue
    radiusKm = Math.max(radiusKm, haversineKm(center, place) + 1.5)
  }
  return { key, label: region.label, ...center, radiusKm: Math.min(radiusKm, 25) }
}

export function buildRegionBubbles(
  places: readonly FullMapPlace[],
  regions: readonly MapRegion[],
  held: EntitlementSet,
  freeKey: string,
): RegionBubble[] {
  const unlocked = held.has('map_access')
  const visible = (place: FullMapPlace) => place.isFree || held.has(place.requiredEntitlement)

  const withCenter = regions.filter((region) => centerOf(region) !== null)
  const hasPlaces = (key: string) => places.some((place) => inRegion(place, key))
  const shown = withCenter.filter((region) => hasPlaces(region.key))
  const shownKeys = new Set(shown.map((region) => region.key))
  // A parent whose areas have their own bubbles would double-count them.
  const leaf = shown.filter(
    (region) =>
      !regions.some((child) => child.parentKey === region.key && shownKeys.has(child.key)),
  )

  // Chip/bubble order: the free area first, then neighbourhoods, then broad regions.
  const rank = (region: MapRegion) =>
    region.key === freeKey ? 0 : region.parentKey !== null ? 1 : 2
  const ordered = [...leaf].sort((a, b) => rank(a) - rank(b))

  return ordered.map((region) => {
    const center = centerOf(region) ?? { lat: 0, lon: 0 }
    const lockedCount = places.filter(
      (place) => inRegion(place, region.key) && !visible(place),
    ).length
    return {
      key: region.key,
      label: region.label,
      lat: center.lat,
      lon: center.lon,
      radiusKm: region.radiusKm ?? 4,
      lockedCount,
      locked: !unlocked && region.key !== freeKey,
      image: REGION_IMAGES[region.key] ?? REGION_IMAGES[region.parentKey ?? ''] ?? null,
    }
  })
}
