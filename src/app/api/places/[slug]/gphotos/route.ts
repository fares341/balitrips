/**
 * The attribution of a place's Google photos, live, for the credit line under
 * each photo («Photo: <author> · Google Maps»). Same lock rule and same 404
 * as the photo route. No-store: author attributions are Places content and
 * are not cached anywhere.
 */

import { NextResponse } from 'next/server'

import { googlePlaceForViewer } from '@/lib/google-places/place-access'
import { googleMaxPhotos } from '@/lib/google-places/config'
import { GOOGLE_PHOTO_MAX } from '@/lib/google-places/photo-urls'
import { livePlacePhotos } from '@/lib/google-places/server'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const placeId = await googlePlaceForViewer(slug)
  if (placeId === null) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  }
  try {
    const photos = (await livePlacePhotos(placeId)).slice(
      0,
      Math.min(GOOGLE_PHOTO_MAX, googleMaxPhotos()),
    )
    return NextResponse.json(
      {
        photos: photos.map((photo) => ({
          authors: photo.authors.map((a) => ({ name: a.displayName, uri: a.uri })),
          mapsUri: photo.mapsUri,
        })),
      },
      { headers: NO_STORE },
    )
  } catch {
    return NextResponse.json({ photos: [] }, { status: 503, headers: NO_STORE })
  }
}
