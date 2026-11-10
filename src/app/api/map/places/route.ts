/**
 * Map results: the open places of the chosen area, categories, traveler
 * types and durations (`?area=&cat=a,b&traveler=&dur=&locale=`), in one
 * compact response. Each open place carries its restaurant section keys;
 * the section pills filter client-side. No `cat` = every map category.
 *
 * The redaction is the same rule as everywhere else (`canSeePlace` via the
 * place's own `isFree` / `requiredEntitlement`): a place the viewer cannot
 * open adds 1 to `lockedCount` and nothing else — no id, name, image or
 * coordinate of it is in the response.
 *
 * The place list itself is cached across requests (`listMapPlacesCached`);
 * the entitlement check and the redaction run per request.
 */

import { NextResponse, type NextRequest } from 'next/server'

import { pick } from '@/lib/content/localize'
import { listMapCategoriesCached, listMapPlacesCached } from '@/lib/map/cached'
import {
  ALL_AREA,
  cardImages,
  matchesFacts,
  parseFactFilter,
  parseSelection,
  selectPlaces,
  shortText,
  type ResultPlace,
} from '@/lib/map/explore'

import { localeOf, NO_STORE, viewer } from '../../places/_viewer'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const locale = localeOf(url.searchParams.get('locale'))

  const [{ held }, places, cats] = await Promise.all([
    viewer('map'),
    listMapPlacesCached(),
    listMapCategoriesCached(),
  ])

  const areaKeys = new Set<string>()
  for (const place of places) {
    if (place.regionKey) areaKeys.add(place.regionKey)
    if (place.parentRegionKey) areaKeys.add(place.parentRegionKey)
  }
  const known = new Set(cats.map((one) => one.key))
  const selection = parseSelection(
    { area: url.searchParams.get('area'), cat: url.searchParams.get('cat') },
    areaKeys,
    known,
  )
  const facts = parseFactFilter({
    traveler: url.searchParams.get('traveler'),
    dur: url.searchParams.get('dur'),
  })
  // An explicit but unknown `cat` matches nothing (not «everything»).
  const rawCat = (url.searchParams.get('cat') ?? '').trim()
  if (rawCat !== '' && selection.categories.length === 0) {
    return NextResponse.json(
      { places: [], lockedCount: 0, total: 0, nextPage: null },
      { headers: NO_STORE },
    )
  }
  const categories = selection.categories.length > 0 ? selection.categories : [...known]

  const { open, lockedCount } = selectPlaces(
    places.filter((place) => matchesFacts(place, facts)),
    { area: selection.area ?? ALL_AREA, categories },
    (place) => place.isFree || held.has(place.requiredEntitlement),
  )

  const out: ResultPlace[] = open.map((place) => ({
    id: place.id,
    slug: place.slug,
    name: pick(place.name, locale, place.slug),
    categoryKey: place.categoryKey ?? '',
    area: place.regionLabel ? pick(place.regionLabel, locale, place.regionKey ?? '') : null,
    lat: place.lat,
    lon: place.lon,
    rating: place.rating,
    reviews: place.reviewCount,
    desc: shortText(place.description ? pick(place.description, locale) : null),
    thumb: place.heroThumbUrl,
    // One photo on the map (owner, Nov 2026); the gallery is for /places pages.
    images: cardImages(place.heroImageUrl, []),
    priceMinor: place.fromPriceMinor,
    currency: place.fromCurrency,
    activitySlug: place.activitySlug,
    canFavorite: place.canFavorite,
    // Sections ride with open places only: a locked place is a count above.
    sections: place.sectionKeys,
  }))

  return NextResponse.json(
    { places: out, lockedCount, total: out.length, nextPage: null },
    { headers: NO_STORE },
  )
}
