/**
 * Per-region view of the real catalogue, for /explore and /explore/[region]
 * (v3 explore.html / region.html). Everything is counted or picked from
 * published records — the package's editorial "dots" and suggested stays are
 * not in the data, so they are not shown.
 */

import { cache } from 'react'

import type { Locale } from '@/i18n/config'
import {
  listActivities,
  listItineraries,
  listLandmarks,
  listRegions,
  regionParentKeys,
} from '@/lib/content/queries'
import { listMapCategoriesCached, listMapPlacesCached } from '@/lib/map/cached'
import type { ActivitySummary, ItinerarySummary, LandmarkDto, RegionDto } from '@/lib/content/types'
import { buildMapPayload, emptyEntitlements, type MapPlaceForClient } from '@/lib/entitlements'

export type OpenPlace = Extract<MapPlaceForClient, { locked: false }>

export type RegionView = {
  region: RegionDto
  activities: ActivitySummary[]
  /** Free (open) map places only — locked ones are never sent to a visitor. */
  places: OpenPlace[]
  /** Every live map place in the region, free or VIP (a count only). */
  placeCount: number
  itineraries: ItinerarySummary[]
  landmarks: LandmarkDto[]
  /** First real photo found in the region (activity, landmark or place). */
  image: string | null
}

const CATALOGUE_LIMIT = 200

/**
 * Built once per request: generateMetadata and the page both need it, and
 * before this every /explore/<region> view ran the whole catalogue query set
 * twice (a 502 was seen on /ar/explore/south under load). Map places come
 * from the same 60 s cache the map uses.
 */
export const regionViews = cache(loadRegionViews)

async function loadRegionViews(locale: Locale): Promise<RegionView[]> {
  const [regions, activities, itineraries, landmarks, mapPlaces, parents, mapCategories] =
    await Promise.all([
      listRegions(),
      listActivities({ sort: 'top', limit: CATALOGUE_LIMIT, locale }),
      listItineraries(),
      listLandmarks({ limit: CATALOGUE_LIMIT }),
      listMapPlacesCached(),
      regionParentKeys(),
      listMapCategoriesCached(),
    ])
  // «N places» counts what the map shows as places: a category that is on the
  // map (not a hidden one, e.g. barbers) and not the activities' own markers,
  // which the «N activities» figure beside it already counts (site audit).
  const placeKeys = new Set(
    mapCategories.map((one) => one.key).filter((key) => key !== 'activities'),
  )
  const countedPlaces = mapPlaces.filter(
    (place) => place.categoryKey !== null && placeKeys.has(place.categoryKey),
  )
  // An area (Ubud) counts towards its broad region (Central Bali) — list H9:
  // the table compared broad regions against records filed under areas.
  const within = (key: string | null | undefined, region: string) =>
    key != null && (key === region || parents.get(key) === region)
  const open = buildMapPayload(mapPlaces, emptyEntitlements()).places.filter(
    (place): place is OpenPlace => !place.locked,
  )

  return regions.map((region) => {
    const inRegion = activities.filter((activity) => within(activity.region?.key, region.key))
    const regionLandmarks = landmarks.filter((landmark) => within(landmark.region?.key, region.key))
    const places = open.filter(
      (place) => within(place.regionKey, region.key) || place.parentRegionKey === region.key,
    )
    const placeCount = countedPlaces.filter(
      (place) => within(place.regionKey, region.key) || place.parentRegionKey === region.key,
    ).length
    const image =
      inRegion.find((activity) => activity.hero?.url)?.hero?.url ??
      regionLandmarks.find((landmark) => landmark.hero?.url)?.hero?.url ??
      places.find((place) => place.heroImageUrl)?.heroImageUrl ??
      null
    return {
      region,
      activities: inRegion,
      places,
      placeCount,
      itineraries: itineraries.filter((itinerary) =>
        itinerary.regions.some((ref) => within(ref.key, region.key)),
      ),
      landmarks: regionLandmarks,
      image,
    }
  })
}

export function regionHref(key: string): string {
  return `/explore/${encodeURIComponent(key)}`
}
