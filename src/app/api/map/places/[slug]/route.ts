/**
 * One place's sheet details (map v3 sheet): the full description, the gallery
 * (hero first, up to 12 real images) and the opening hours.
 *
 * Same lock rule as the results list (`isFree` or the viewer holds the place's
 * `requiredEntitlement`). A locked, hidden or unknown slug answers the same
 * 404, so the response never tells a locked place apart from a missing one.
 */

import { NextResponse, type NextRequest } from 'next/server'

import { pick } from '@/lib/content/localize'
import { listMapCategoriesCached, listMapPlacesCached } from '@/lib/map/cached'

import { localeOf, NO_STORE, viewer } from '../../../places/_viewer'

export const dynamic = 'force-dynamic'

const GALLERY_MAX = 12

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const locale = localeOf(request.nextUrl.searchParams.get('locale'))
  const [{ held }, places, cats] = await Promise.all([
    viewer('map'),
    listMapPlacesCached(),
    listMapCategoriesCached(),
  ])
  const mapKeys = new Set(cats.map((one) => one.key))

  const place = places.find((one) => one.slug === slug)
  const open =
    place !== undefined &&
    place.categoryKey !== null &&
    mapKeys.has(place.categoryKey) &&
    (place.isFree || held.has(place.requiredEntitlement))
  if (!open) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }

  const images: string[] = []
  for (const url of [place.heroImageUrl, ...place.gallery]) {
    if (!url || images.includes(url)) continue
    images.push(url)
    if (images.length === GALLERY_MAX) break
  }
  const long = place.detailedDescription ? pick(place.detailedDescription, locale) : ''
  const short = place.description ? pick(place.description, locale) : ''
  const hours = (place.openingHours ?? '').trim()

  return NextResponse.json(
    {
      slug: place.slug,
      description: (long || short).trim() || null,
      images,
      hours: hours === '' ? null : hours,
    },
    { headers: NO_STORE },
  )
}
