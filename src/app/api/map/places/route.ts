/**
 * Map v2 results: only the places of the chosen area and categories, one
 * page at a time (`?area=&cat=a,b&page=&locale=`).
 *
 * The redaction is the same rule as everywhere else (`canSeePlace` via the
 * place's own `isFree` / `requiredEntitlement`): a place the viewer cannot
 * open adds 1 to `lockedCount` and nothing else — no id, name, image or
 * coordinate of it is in the response.
 */

import { NextResponse, type NextRequest } from 'next/server'

import { pick } from '@/lib/content/localize'
import { listMapPlaces } from '@/lib/content/queries'
import {
  ALL_AREA,
  cardImages,
  PAGE_SIZE,
  parseSelection,
  selectPlaces,
  type ResultPlace,
} from '@/lib/map/explore'
import { listMapCategories } from '@/lib/map/queries'

import { localeOf, NO_STORE, viewer } from '../../places/_viewer'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const locale = localeOf(url.searchParams.get('locale'))
  const pageNo = Math.max(1, Math.min(50, Number(url.searchParams.get('page') ?? '1') || 1))

  const [{ held }, places, cats] = await Promise.all([
    viewer('map'),
    listMapPlaces(),
    listMapCategories(),
  ])

  const areaKeys = new Set<string>()
  for (const place of places) {
    if (place.regionKey) areaKeys.add(place.regionKey)
    if (place.parentRegionKey) areaKeys.add(place.parentRegionKey)
  }
  const selection = parseSelection(
    { area: url.searchParams.get('area'), cat: url.searchParams.get('cat') },
    areaKeys,
    new Set(cats.map((one) => one.key)),
  )
  if (selection.categories.length === 0) {
    return NextResponse.json(
      { places: [], lockedCount: 0, total: 0, nextPage: null },
      { headers: NO_STORE },
    )
  }

  const { open, lockedCount } = selectPlaces(
    places,
    { area: selection.area ?? ALL_AREA, categories: selection.categories },
    (place) => place.isFree || held.has(place.requiredEntitlement),
  )

  const start = (pageNo - 1) * PAGE_SIZE
  const slice = open.slice(start, start + PAGE_SIZE)
  const out: ResultPlace[] = slice.map((place) => ({
    id: place.id,
    slug: place.slug,
    name: pick(place.name, locale, place.slug),
    categoryKey: place.categoryKey ?? '',
    lat: place.lat,
    lon: place.lon,
    rating: place.rating,
    images: cardImages(place.heroImageUrl, place.gallery),
    activitySlug: place.activitySlug,
    canFavorite: place.canFavorite,
  }))

  return NextResponse.json(
    {
      places: out,
      lockedCount,
      total: open.length,
      nextPage: start + PAGE_SIZE < open.length ? pageNo + 1 : null,
    },
    { headers: NO_STORE },
  )
}
