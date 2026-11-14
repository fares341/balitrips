/**
 * GET /api/exists?kind=<activity|itinerary|package|article|place|region>&key=<slug>
 *
 * Asked by the proxy before a public detail page renders, so a missing record
 * can be answered with the server-rendered 404 page (see
 * src/lib/seo/not-found-routing.ts). Each kind uses the very lookup its page
 * uses before calling `notFound()`, so the two cannot disagree. It answers
 * only yes or no about records that are public anyway.
 */

import { NextResponse, type NextRequest } from 'next/server'

import { getArticleHead } from '@/lib/content/extra-queries'
import {
  getActivityBySlug,
  getPackageBySlug,
  listRegions,
  mergedActivitySlug,
} from '@/lib/content/queries'
import { getPublicItinerary } from '@/lib/itineraries/public'
import { listMapPlacesCached } from '@/lib/map/cached'
import { isDetailKind, type DetailKind } from '@/lib/seo/not-found-routing'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' } as const

async function exists(kind: DetailKind, key: string): Promise<boolean> {
  switch (kind) {
    case 'activity':
      // A merged activity's old link redirects to its new page: it «exists».
      return (await getActivityBySlug(key)) !== null || (await mergedActivitySlug(key)) !== null
    case 'itinerary':
      return (await getPublicItinerary(key)) !== null
    case 'package':
      return (await getPackageBySlug(key)) !== null
    case 'article':
      return (await getArticleHead(key)) !== null
    case 'place':
      return (await listMapPlacesCached()).some((place) => place.slug === key)
    case 'region':
      return (await listRegions()).some((region) => region.key === key)
  }
}

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get('kind')
  const key = request.nextUrl.searchParams.get('key') ?? ''
  if (!isDetailKind(kind) || key === '' || key.length > 160) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE })
  }
  try {
    return NextResponse.json({ exists: await exists(kind, key) }, { headers: NO_STORE })
  } catch (error) {
    // Unknown is not «missing»: the proxy lets the page decide.
    console.warn('[exists] lookup failed', kind, error)
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
  }
}
