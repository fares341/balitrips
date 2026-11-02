/**
 * Map v2 — server reads. Everything here returns PUBLIC data (category look,
 * counts) or runs behind `selectPlaces` with the viewer's entitlements.
 */

import { and, asc, eq, isNotNull, ne } from 'drizzle-orm'

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
