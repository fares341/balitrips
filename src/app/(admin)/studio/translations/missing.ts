import { sql } from 'drizzle-orm'

import { db } from '@/db'

/**
 * Missing-translation report across content.
 *
 * English is the authoring locale, so Arabic and Indonesian are always
 * behind — that is the normal state of a freshly authored record, not an
 * anomaly. What matters is knowing HOW far behind, per field, so a
 * translator has a work queue instead of a hunt.
 *
 * `pick()` degrades a blank locale to English rather than rendering
 * "undefined", so nothing here is a rendering bug. It is a completeness
 * report.
 *
 * One raw statement rather than a query per table: it is a report, it runs
 * on a page an operator opens occasionally, and fifteen round trips to
 * count rows would be worse than one union.
 */

export interface MissingRow {
  entity: string
  field: string
  total: number
  missingAr: number
  missingId: number
}

type RawRow = Record<string, unknown> & {
  entity: string
  field: string
  total: number
  missing_ar: number
  missing_id: number
}

function block(entity: string, table: string, field: string, column: string, live: string): string {
  return `select '${entity}' as entity, '${field}' as field,
     count(*)::int as total,
     count(*) filter (where coalesce(${column} ->> 'ar', '') = '')::int as missing_ar,
     count(*) filter (where coalesce(${column} ->> 'id', '') = '')::int as missing_id
   from ${table} ${live}`
}

const NOT_DELETED = 'where deleted_at is null'

const BLOCKS = [
  block('Activities', 'activities', 'name', 'name', NOT_DELETED),
  block('Activities', 'activities', 'description', 'description', NOT_DELETED),
  block('Activities', 'activities', 'cancellation policy', 'cancellation_policy', NOT_DELETED),
  block('Itineraries', 'itineraries', 'name', 'name', NOT_DELETED),
  block('Itineraries', 'itineraries', 'blurb', 'blurb', NOT_DELETED),
  block('Itinerary days', 'itinerary_days', 'title', 'title', ''),
  block('Itinerary days', 'itinerary_days', 'description', 'description', ''),
  block('Packages', 'packages', 'name', 'name', NOT_DELETED),
  block('Packages', 'packages', 'blurb', 'blurb', NOT_DELETED),
  block('Articles', 'articles', 'title', 'title', NOT_DELETED),
  block('Articles', 'articles', 'body', 'body', NOT_DELETED),
  block('Landmarks', 'landmarks', 'name', 'name', NOT_DELETED),
  block('Landmarks', 'landmarks', 'blurb', 'blurb', NOT_DELETED),
  block('Map places', 'map_places', 'name', 'name', NOT_DELETED),
  block('Map places', 'map_places', 'description', 'description', NOT_DELETED),
  block('Categories', 'categories', 'label', 'label', ''),
  block('Regions', 'regions', 'label', 'label', ''),
  block('Article categories', 'article_categories', 'label', 'label', ''),
  block('Driver vehicles', 'driver_vehicles', 'label', 'label', ''),
]

export async function contentTranslationGaps(): Promise<MissingRow[]> {
  const rows = await db.execute<RawRow>(sql.raw(BLOCKS.join('\nunion all\n')))

  return [...rows].map((row) => ({
    entity: row.entity,
    field: row.field,
    total: Number(row.total),
    missingAr: Number(row.missing_ar),
    missingId: Number(row.missing_id),
  }))
}
