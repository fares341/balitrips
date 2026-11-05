/**
 * The widely-shared media set (`./shared-media-rule`), computed once from all
 * non-archived places and cached with the place lists (same tag, 60 s
 * ceiling), so a public request pays nothing for it.
 */

import { and, isNull, ne } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'

import { db } from '@/db'
import { mapPlaces } from '@/db/schema'

import { widelySharedIds } from './shared-media-rule'
import { MAP_PLACES_TAG } from './tags'

export async function loadWidelySharedMediaIds(): Promise<string[]> {
  const rows = await db
    .select({
      placeId: mapPlaces.id,
      heroId: mapPlaces.heroImageId,
      galleryIds: mapPlaces.galleryImageIds,
    })
    .from(mapPlaces)
    .where(and(isNull(mapPlaces.deletedAt), ne(mapPlaces.status, 'archived')))
  return [...widelySharedIds(rows)]
}

const cached = unstable_cache(loadWidelySharedMediaIds, ['shared-media-v1'], {
  tags: [MAP_PLACES_TAG],
  revalidate: 60,
})

/** Cached; outside a Next request (scripts, tests) it reads directly. */
export async function widelySharedMediaIds(): Promise<ReadonlySet<string>> {
  try {
    return new Set(await cached())
  } catch {
    return new Set(await loadWidelySharedMediaIds())
  }
}
