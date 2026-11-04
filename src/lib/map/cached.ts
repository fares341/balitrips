/**
 * The map's place list, cached across requests (map v3).
 *
 * `listMapPlaces()` joins media, activities, regions, tags, galleries and a
 * popularity aggregate — every /map visit and every filter change used to run
 * all of it. The list itself is the same for every viewer (redaction happens
 * per request, after this), so it is safe to share: Studio's place / taxonomy
 * saves drop the tag, and 60 s is the ceiling for any other writer (activity
 * price edits, imports).
 */

import { unstable_cache } from 'next/cache'

import { listMapPlaces } from '@/lib/content/queries'

import { listMapCategories } from './queries'

export const MAP_PLACES_TAG = 'map-places'

export const listMapPlacesCached = unstable_cache(listMapPlaces, ['map-places-v3'], {
  tags: [MAP_PLACES_TAG],
  revalidate: 60,
})

export const listMapCategoriesCached = unstable_cache(listMapCategories, ['map-categories-v3'], {
  tags: [MAP_PLACES_TAG],
  revalidate: 60,
})
