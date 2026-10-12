import { asc, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { activities, articleCategories, categories, mapPlaces, media, regions } from '@/db/schema'
import type { Localized } from '@/db/schema'
import { pick } from '@/lib/content/localize'

/**
 * Reference data for the editors' select boxes.
 *
 * Everything is labelled in English — the admin is English-only — but the
 * underlying values are the full localized objects, so `pick()` still
 * resolves a sensible label when a row was authored in another locale first.
 */

export interface Option {
  value: string
  label: string
}

export async function regionOptions(): Promise<Option[]> {
  const rows = await db
    .select({ id: regions.id, key: regions.key, label: regions.label })
    .from(regions)
    .orderBy(asc(regions.sortOrder), asc(regions.key))

  return rows.map((row) => ({ value: row.id, label: pick(row.label, 'en', row.key) }))
}

export async function categoryOptions(): Promise<Option[]> {
  const rows = await db
    .select({ id: categories.id, key: categories.key, label: categories.label })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.key))

  return rows.map((row) => ({ value: row.id, label: pick(row.label, 'en', row.key) }))
}

export async function articleCategoryOptions(): Promise<Option[]> {
  const rows = await db
    .select({
      id: articleCategories.id,
      key: articleCategories.key,
      label: articleCategories.label,
    })
    .from(articleCategories)
    .orderBy(asc(articleCategories.sortOrder), asc(articleCategories.key))

  return rows.map((row) => ({ value: row.id, label: pick(row.label, 'en', row.key) }))
}

export async function activityOptions(): Promise<Option[]> {
  const rows = await db
    .select({ id: activities.id, slug: activities.slug, name: activities.name })
    .from(activities)
    .where(isNull(activities.deletedAt))
    .orderBy(asc(activities.sortOrder), asc(activities.slug))

  return rows.map((row) => ({
    value: row.id,
    label: `${pick(row.name, 'en', row.slug)} (${row.slug})`,
  }))
}

export async function mediaOptions(): Promise<Option[]> {
  const rows = await db
    .select({ id: media.id, objectKey: media.objectKey, alt: media.alt })
    .from(media)
    .where(isNull(media.deletedAt))
    .orderBy(asc(media.objectKey))
    .limit(500)

  return rows.map((row) => ({
    value: row.id,
    label: labelForMedia(row.objectKey, row.alt),
  }))
}

function labelForMedia(objectKey: string, alt: Localized | null): string {
  const altText = pick(alt, 'en')
  return altText === '' ? objectKey : `${objectKey} — ${altText}`
}

/** أماكن الخريطة (غير المحذوفة) — لربطها بجدول. */
export async function placeOptions(): Promise<Option[]> {
  const rows = await db
    .select({ id: mapPlaces.id, slug: mapPlaces.slug, name: mapPlaces.name })
    .from(mapPlaces)
    .where(isNull(mapPlaces.deletedAt))
    .orderBy(asc(mapPlaces.slug))
  return rows.map((row) => ({ value: row.id, label: pick(row.name, 'en', row.slug) }))
}
