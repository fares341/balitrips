/**
 * Region bubbles — computed on the SERVER from region data.
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
 * No region is free any more (client, Oct 2026): access follows the place's
 * CATEGORY, so a bubble is "locked" only when it holds places this viewer
 * cannot see.
 */
export function buildRegionBubbles(
  places: readonly FullMapPlace[],
  regions: readonly MapRegion[],
  held: EntitlementSet,
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

  // Chip/bubble order: neighbourhoods, then broad regions.
  const rank = (region: MapRegion) => (region.parentKey !== null ? 1 : 2)
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
      locked: !unlocked && lockedCount > 0,
      image: REGION_IMAGES[region.key] ?? REGION_IMAGES[region.parentKey ?? ''] ?? null,
    }
  })
}

/**
 * The region a point belongs to, for a new place: the closest neighbourhood
 * (a region with a parent) whose circle holds the point, else the closest
 * broad region within its circle, else the closest broad region centre
 * within 40 km. Regions with no centre (and no fallback) are skipped. Null
 * when nothing is near (the admin picks one in the editor).
 */
export function regionAt(
  regions: readonly MapRegion[],
  point: { lat: number; lon: number },
): MapRegion | null {
  const measured = regions
    .map((region) => {
      const center = centerOf(region)
      if (center === null) return null
      const km = haversineKm(center, point)
      const radius = region.radiusKm ?? (region.parentKey !== null ? 4 : 15)
      return { region, km, inside: km <= radius }
    })
    .filter((entry): entry is { region: MapRegion; km: number; inside: boolean } => entry !== null)
  const closest = (list: typeof measured) =>
    list.reduce<(typeof measured)[number] | null>(
      (best, entry) => (best === null || entry.km < best.km ? entry : best),
      null,
    )?.region ?? null
  return (
    closest(measured.filter((e) => e.inside && e.region.parentKey !== null)) ??
    closest(measured.filter((e) => e.inside)) ??
    closest(measured.filter((e) => e.region.parentKey === null && e.km <= 40))
  )
}
