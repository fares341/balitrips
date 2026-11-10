/**
 * Map v2 — server reads. Everything here returns PUBLIC data (category look,
 * counts) or runs behind `selectPlaces` with the viewer's entitlements.
 */

import { and, asc, eq, isNotNull, isNull, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { isIconName } from '@/components/ui/icon'
import { db } from '@/db'
import { categories } from '@/db/schema'

import { categoryStyle, type CategoryStyle } from './explore'

export interface MapCategory extends CategoryStyle {
  key: string
  label: Record<string, string>
  tier: 'free' | 'vip'
}

/** The map's categories (Free / VIP) with their pin colour and glyph. */
export async function listMapCategories(): Promise<MapCategory[]> {
  const rows = await db
    .select({
      key: categories.key,
      label: categories.label,
      tier: categories.mapTier,
      icon: categories.icon,
      color: categories.mapColor,
    })
    .from(categories)
    .where(
      and(
        eq(categories.status, 'active'),
        ne(categories.key, 'all'),
        isNotNull(categories.mapTier),
        // Sections (migration 0054) filter inside their parent, never as a type.
        isNull(categories.parentId),
      ),
    )
    .orderBy(asc(categories.mapOrder), asc(categories.key))
  return rows.map((row) => ({
    key: row.key,
    label: row.label as Record<string, string>,
    tier: row.tier === 'free' ? 'free' : 'vip',
    ...categoryStyle(row.key, { color: row.color, icon: row.icon }, isIconName),
  }))
}

export interface MapSection {
  key: string
  parentKey: string
  label: Record<string, string>
}

const parentCategory = alias(categories, 'parent_category')

/** Active sections (child categories) of active map categories, in order. */
export async function listMapSections(): Promise<MapSection[]> {
  const rows = await db
    .select({ key: categories.key, label: categories.label, parentKey: parentCategory.key })
    .from(categories)
    .innerJoin(parentCategory, eq(parentCategory.id, categories.parentId))
    .where(
      and(
        eq(categories.status, 'active'),
        eq(parentCategory.status, 'active'),
        isNotNull(parentCategory.mapTier),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.key))
  return rows.map((row) => ({
    key: row.key,
    parentKey: row.parentKey,
    label: row.label as Record<string, string>,
  }))
}
