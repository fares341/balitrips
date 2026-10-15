/**
 * Per-region view of the real catalogue, for /explore and /explore/[region]
 * (v3 explore.html / region.html). Everything is counted or picked from
 * published records — the package's editorial "dots" and suggested stays are
 * not in the data, so they are not shown.
 */

import type { Locale } from '@/i18n/config'
import {
  listActivities,
  listItineraries,
  listLandmarks,
  listMapPlaces,
  listRegions,
} from '@/lib/content/queries'
import type { ActivitySummary, ItinerarySummary, LandmarkDto, RegionDto } from '@/lib/content/types'
import { buildMapPayload, emptyEntitlements, type MapPlaceForClient } from '@/lib/entitlements'

export type OpenPlace = Extract<MapPlaceForClient, { locked: false }>

export type RegionView = {
  region: RegionDto
  activities: ActivitySummary[]
  /** Free (open) map places only — locked ones are never sent to a visitor. */
  places: OpenPlace[]
  itineraries: ItinerarySummary[]
  landmarks: LandmarkDto[]
  /** First real photo found in the region (activity, landmark or place). */
  image: string | null
}

const CATALOGUE_LIMIT = 200

export async function regionViews(locale: Locale): Promise<RegionView[]> {
  const [regions, activities, itineraries, landmarks, mapPlaces] = await Promise.all([
    listRegions(),
    listActivities({ sort: 'top', limit: CATALOGUE_LIMIT, locale }),
    listItineraries(),
    listLandmarks({ limit: CATALOGUE_LIMIT }),
    listMapPlaces(),
  ])
  const open = buildMapPayload(mapPlaces, emptyEntitlements()).places.filter(
    (place): place is OpenPlace => !place.locked,
  )

  return regions.map((region) => {
    const inRegion = activities.filter((activity) => activity.region?.key === region.key)
    const regionLandmarks = landmarks.filter((landmark) => landmark.region?.key === region.key)
    const places = open.filter((place) => place.regionKey === region.key)
    const image =
      inRegion.find((activity) => activity.hero?.url)?.hero?.url ??
      regionLandmarks.find((landmark) => landmark.hero?.url)?.hero?.url ??
      places.find((place) => place.heroImageUrl)?.heroImageUrl ??
      null
    return {
      region,
      activities: inRegion,
      places,
      itineraries: itineraries.filter((itinerary) =>
        itinerary.regions.some((ref) => ref.key === region.key),
      ),
      landmarks: regionLandmarks,
      image,
    }
  })
}

export function regionHref(key: string): string {
  return `/explore/${encodeURIComponent(key)}`
}
