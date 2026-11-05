/**
 * One Google photo of a place: `/api/places/<slug>/gphoto/<i>?w=<px>`.
 *
 * Per request, nothing stored (Places API policy: photo names cannot be
 * cached and may expire; photo bytes and URIs are not ours to keep):
 *  1. lock rule — a place this viewer cannot open answers 404, exactly like
 *     the map APIs (`googlePlaceForViewer`);
 *  2. Place Details, `photos` only (no-charge IDs-Only SKU) → photo name #i;
 *  3. Place Photos (New) with `skipHttpRedirect=true` → `photoUri`;
 *  4. 302 to that URI. The browser loads the image from Google directly.
 *
 * Cache-Control is `private` with a short max-age (default 300 s): only the
 * viewer's own browser may keep the redirect, never a shared cache.
 */

import { NextResponse, type NextRequest } from 'next/server'

import { photoRedirectMaxAge } from '@/lib/google-places/config'
import { GoogleCapError } from '@/lib/google-places/client'
import { googlePlaceForViewer } from '@/lib/google-places/place-access'
import { GOOGLE_PHOTO_MAX, snapWidth } from '@/lib/google-places/photo-urls'
import { googleClient, livePlacePhotos } from '@/lib/google-places/server'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const
function notFound() {
  return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; i: string }> },
) {
  const { slug, i } = await params
  const index = Number(i)
  if (!/^\d+$/.test(i) || index >= GOOGLE_PHOTO_MAX) return notFound()

  const placeId = await googlePlaceForViewer(slug)
  const client = googleClient()
  if (placeId === null || client === null) return notFound()

  try {
    const photos = await livePlacePhotos(placeId)
    const photo = photos[index]
    if (!photo) return notFound()
    const uri = await client.photoUri(photo.name, snapWidth(request.nextUrl.searchParams.get('w')))
    if (uri === null) return notFound()
    const maxAge = photoRedirectMaxAge()
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: uri,
        'Cache-Control': maxAge > 0 ? `private, max-age=${maxAge}` : 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (error) {
    // Over the daily cap or Google failing: the image slot falls back to the
    // placeholder (useImageFallback), the page itself is unaffected.
    const capped = error instanceof GoogleCapError
    if (!capped)
      console.warn('[gphoto] google error', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json(
      { error: capped ? 'daily_cap' : 'unavailable' },
      { status: 503, headers: { ...NO_STORE, 'Retry-After': '300' } },
    )
  }
}
