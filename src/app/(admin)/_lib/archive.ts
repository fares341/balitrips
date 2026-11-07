import { and, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'

import { db } from '@/db'
import {
  activities,
  addonsLibrary,
  articles,
  landmarks,
  mapPlaces,
  packages,
  reviews,
} from '@/db/schema'
import { plans, suppliers } from '@/db/schema'

/**
 * «المحذوفات» — every Studio "delete" of catalogue content is an archive
 * (soft delete), so bookings, orders and history never lose what they point
 * at. This registry lists the archived rows of each kind and restores them.
 * A restored record comes back hidden (draft / unpublished / paused): the
 * owner reviews it and publishes it again on purpose.
 */

export const ARCHIVE_KINDS = [
  'activities',
  'packages',
  'places',
  'articles',
  'landmarks',
  'reviews',
  'addons',
  'suppliers',
  'plans',
] as const
export type ArchiveKind = (typeof ARCHIVE_KINDS)[number]

interface KindDef {
  table: PgTable
  id: PgColumn
  deletedAt: PgColumn
  label: SQL<string>
  /** Studio section of the edit screen. */
  section: string
}

export const ARCHIVE_REGISTRY: Record<ArchiveKind, KindDef> = {
  activities: {
    table: activities,
    id: activities.id,
    deletedAt: activities.deletedAt,
    label: sql<string>`coalesce(nullif(${activities.name} ->> 'ar', ''), ${activities.name} ->> 'en', ${activities.slug})`,
    section: 'activities',
  },
  packages: {
    table: packages,
    id: packages.id,
    deletedAt: packages.deletedAt,
    label: sql<string>`coalesce(nullif(${packages.name} ->> 'ar', ''), ${packages.name} ->> 'en', ${packages.slug})`,
    section: 'packages',
  },
  places: {
    table: mapPlaces,
    id: mapPlaces.id,
    deletedAt: mapPlaces.deletedAt,
    label: sql<string>`coalesce(nullif(${mapPlaces.name} ->> 'ar', ''), ${mapPlaces.name} ->> 'en', ${mapPlaces.slug})`,
    section: 'places',
  },
  articles: {
    table: articles,
    id: articles.id,
    deletedAt: articles.deletedAt,
    label: sql<string>`coalesce(nullif(${articles.title} ->> 'ar', ''), ${articles.title} ->> 'en', ${articles.slug})`,
    section: 'articles',
  },
  landmarks: {
    table: landmarks,
    id: landmarks.id,
    deletedAt: landmarks.deletedAt,
    label: sql<string>`coalesce(nullif(${landmarks.name} ->> 'ar', ''), ${landmarks.name} ->> 'en', ${landmarks.slug})`,
    section: 'landmarks',
  },
  reviews: {
    table: reviews,
    id: reviews.id,
    deletedAt: reviews.deletedAt,
    label: sql<string>`${reviews.authorName}`,
    section: 'reviews',
  },
  addons: {
    table: addonsLibrary,
    id: addonsLibrary.id,
    deletedAt: addonsLibrary.deletedAt,
    label: sql<string>`coalesce(nullif(${addonsLibrary.name} ->> 'ar', ''), ${addonsLibrary.name} ->> 'en', '')`,
    section: 'addons',
  },
  suppliers: {
    table: suppliers,
    id: suppliers.id,
    deletedAt: suppliers.deletedAt,
    label: sql<string>`${suppliers.name}`,
    section: 'suppliers',
  },
  plans: {
    table: plans,
    id: plans.id,
    deletedAt: plans.deletedAt,
    label: sql<string>`coalesce(nullif(${plans.name} ->> 'ar', ''), ${plans.name} ->> 'en', ${plans.slug})`,
    section: 'plans',
  },
}

export function isArchiveKind(value: unknown): value is ArchiveKind {
  return typeof value === 'string' && (ARCHIVE_KINDS as readonly string[]).includes(value)
}

export interface ArchivedRow {
  kind: ArchiveKind
  id: string
  label: string
  deletedAt: Date
}

export async function listArchived(limitPerKind = 100): Promise<ArchivedRow[]> {
  const lists = await Promise.all(
    ARCHIVE_KINDS.map(async (kind) => {
      const def = ARCHIVE_REGISTRY[kind]
      const rows = await db
        .select({ id: def.id, label: def.label, deletedAt: def.deletedAt })
        .from(def.table)
        .where(isNotNull(def.deletedAt))
        .orderBy(desc(def.deletedAt))
        .limit(limitPerKind)
      return rows.map((row) => ({
        kind,
        id: String(row.id),
        label: String(row.label),
        deletedAt: row.deletedAt as Date,
      }))
    }),
  )
  return lists.flat().sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime())
}

/** Un-archive one row; returns false when it is not archived (or gone). */
export async function restoreArchived(
  kind: ArchiveKind,
  id: string,
  runner: Pick<typeof db, 'update'> = db,
): Promise<boolean> {
  const def = ARCHIVE_REGISTRY[kind]
  const rows = await runner
    .update(def.table)
    .set({ deletedAt: null } as never)
    .where(and(eq(def.id, id), isNotNull(def.deletedAt)))
    .returning({ id: def.id })
  return rows.length > 0
}
