import { sql } from 'drizzle-orm'

import { mapPlaces } from '@/db/schema'

/** True when another non-deleted place uses this place's hero media row. */
export const heroSharedSql = sql<boolean>`exists (select 1 from map_places mp_hero where mp_hero.hero_image_id = ${mapPlaces.heroImageId} and mp_hero.id <> ${mapPlaces.id} and mp_hero.deleted_at is null)`
