import 'server-only'

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { mapPlaces } from '@/db/schema'
import { listMapPlacesCached } from '@/lib/map/cached'

import { viewer } from '@/app/api/places/_viewer'

import { googlePhotosEnabled } from './config'
import { isUsableMatch } from './photo-urls'

/**
 * The Google place ID behind a slug — only when this viewer may open the
 * place (the map's lock rule: `isFree`, or the viewer holds the place's
 * `requiredEntitlement`) and the match is usable. Anything else is null, and
 * the routes answer the same 404 for locked, hidden, unmatched and unknown,
 * so a response never tells a locked place apart from a missing one.
 */
export async function googlePlaceForViewer(slug: string): Promise<string | null> {
  if (!googlePhotosEnabled()) return null
  const [{ held }, places] = await Promise.all([viewer('map'), listMapPlacesCached()])
  const place = places.find((one) => one.slug === slug)
  if (!place || !(place.isFree || held.has(place.requiredEntitlement))) return null
  const [row] = await db
    .select({ id: mapPlaces.googlePlaceId, status: mapPlaces.googleMatchStatus })
    .from(mapPlaces)
    .where(and(eq(mapPlaces.id, place.id), isNull(mapPlaces.deletedAt)))
    .limit(1)
  return row && isUsableMatch(row.status, row.id) ? row.id : null
}
