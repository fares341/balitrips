import { eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

import { db } from '@/db'
import {
  activities,
  activityImages,
  articles,
  itineraries,
  landmarks,
  mapPlaces,
  packages,
} from '@/db/schema'

import type { Tx } from './audit'

/**
 * Who points at a media row.
 *
 * Needed for exactly one rule: **an image referenced by a PUBLISHED record
 * cannot be archived.** Soft-deleting it would not break the foreign key —
 * `hero_image_id` stays valid — but `toMedia()` in `lib/content/queries.ts`
 * treats a soft-deleted row as no image at all, so the live page would
 * quietly lose its hero and nothing would appear in an error log. The refusal
 * turns a silent regression into a message an operator can act on.
 *
 * Draft records do NOT block. Archiving an image out from under a draft is
 * recoverable by opening the draft and picking another; doing it to a page
 * that is being crawled and linked is not.
 *
 * The seven referencing columns are enumerated here rather than discovered
 * from `pg_constraint`. Reflection would also find any table a future
 * migration adds, with no way to know whether that table has a publish state —
 * an explicit list breaks the build when the schema grows, which is the right
 * direction to fail.
 */

/** Marks rows written by `scripts/seed-media.mjs`. Kept in sync with it. */
export const PLACEHOLDER_CREDIT = 'Generated placeholder — replace with licensed photography'

/** Object-key prefix the generator writes under. */
export const PLACEHOLDER_KEY_PREFIX = 'seed-media/'

/**
 * Is this row generated artwork rather than licensed photography?
 *
 * Keyed on the credit rather than the object key: the credit is what an
 * operator reads and what they clear when they replace the art, and it
 * survives the same image being re-uploaded under a different key.
 */
export function isPlaceholder(credit: string | null | undefined): boolean {
  return (credit ?? '').trim() === PLACEHOLDER_CREDIT
}

export interface MediaReference {
  /** Human label for the referencing kind, e.g. `activity`. */
  entity: string
  /** Admin section the record lives in, e.g. `activities`. */
  section: string
  id: string
  label: string
  status: string
  mediaId: string
}

interface RefSource {
  entity: string
  section: string
  /** Table the query reads from. */
  from: PgTable
  /** The column holding the media id. */
  column: PgColumn
  /** Selected columns of the referencing record. */
  id: PgColumn
  label: SQL<string>
  status: PgColumn
  /** Set for the gallery join table, which carries no label of its own. */
  joinsActivities?: true
}

/**
 * One descriptor per referencing table.
 *
 * `name ->> 'en'` rather than the whole jsonb: the label only has to be
 * recognisable in an error message, and the authoring locale always has a
 * value because `flocalizedRequired` refuses to save a record without one.
 */
const SOURCES: RefSource[] = [
  {
    entity: 'activity',
    section: 'activities',
    from: activities,
    column: activities.heroImageId,
    id: activities.id,
    label: sql<string>`coalesce(${activities.name} ->> 'en', ${activities.slug})`,
    status: activities.status,
  },
  {
    entity: 'itinerary',
    section: 'itineraries',
    from: itineraries,
    column: itineraries.heroImageId,
    id: itineraries.id,
    label: sql<string>`coalesce(${itineraries.name} ->> 'en', ${itineraries.slug})`,
    status: itineraries.status,
  },
  {
    entity: 'package',
    section: 'packages',
    from: packages,
    column: packages.heroImageId,
    id: packages.id,
    label: sql<string>`coalesce(${packages.name} ->> 'en', ${packages.slug})`,
    status: packages.status,
  },
  {
    entity: 'landmark',
    section: 'landmarks',
    from: landmarks,
    column: landmarks.heroImageId,
    id: landmarks.id,
    label: sql<string>`coalesce(${landmarks.name} ->> 'en', ${landmarks.slug})`,
    status: landmarks.status,
  },
  {
    entity: 'article',
    section: 'articles',
    from: articles,
    column: articles.heroImageId,
    id: articles.id,
    label: sql<string>`coalesce(${articles.title} ->> 'en', ${articles.slug})`,
    status: articles.status,
  },
  {
    entity: 'map place',
    section: 'places',
    from: mapPlaces,
    column: mapPlaces.heroImageId,
    id: mapPlaces.id,
    label: sql<string>`coalesce(${mapPlaces.name} ->> 'en', ${mapPlaces.slug})`,
    status: mapPlaces.status,
  },
  {
    /**
     * Gallery attachment. It has no publish state of its own, so it inherits
     * the activity's — a gallery image on a live page is every bit as visible
     * as the hero.
     */
    entity: 'activity gallery',
    section: 'activities',
    from: activityImages,
    column: activityImages.mediaId,
    id: activities.id,
    label: sql<string>`coalesce(${activities.name} ->> 'en', ${activities.slug})`,
    status: activities.status,
    joinsActivities: true,
  },
]

/**
 * A `db` handle or a transaction handle.
 *
 * The delete path needs the reference check to run inside its OWN
 * transaction: performed on `db` instead, an operator publishing a draft in
 * another tab between the check and the write would slip straight through it.
 */
export type Runner = typeof db | Tx

async function query(
  runner: Runner,
  source: RefSource,
  mediaIds: readonly string[],
): Promise<MediaReference[]> {
  const columns = {
    mediaId: source.column,
    id: source.id,
    label: source.label,
    status: source.status,
  }

  const rows = source.joinsActivities
    ? await runner
        .select(columns)
        .from(activityImages)
        .innerJoin(activities, eq(activities.id, activityImages.activityId))
        .where(inArray(source.column, [...mediaIds]))
    : await runner
        .select(columns)
        .from(source.from)
        .where(inArray(source.column, [...mediaIds]))

  return rows.map((row) => ({
    entity: source.entity,
    section: source.section,
    id: String(row.id),
    label: String(row.label),
    status: String(row.status),
    mediaId: String(row.mediaId),
  }))
}

/**
 * Every record pointing at any of these images, published or not.
 *
 * Batched across ids — seven queries total, not seven per row. The media grid
 * calls this once for the whole page.
 */
export async function referencesFor(
  mediaIds: readonly string[],
  runner: Runner = db,
): Promise<Map<string, MediaReference[]>> {
  const byMedia = new Map<string, MediaReference[]>()
  const ids = [...new Set(mediaIds)]
  if (ids.length === 0) return byMedia

  const found = (await Promise.all(SOURCES.map((source) => query(runner, source, ids)))).flat()

  for (const reference of found) {
    const list = byMedia.get(reference.mediaId)
    if (list) list.push(reference)
    else byMedia.set(reference.mediaId, [reference])
  }

  return byMedia
}

/** Every record pointing at one image. */
export async function referencesTo(
  mediaId: string,
  runner: Runner = db,
): Promise<MediaReference[]> {
  return (await referencesFor([mediaId], runner)).get(mediaId) ?? []
}

export function publishedReferences(references: readonly MediaReference[]): MediaReference[] {
  return references.filter((reference) => reference.status === 'published')
}
