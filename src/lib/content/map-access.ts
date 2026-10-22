/**
 * Map access by CATEGORY (client, Oct 2026 — list A1).
 *
 * Two levels: Free and VIP. A place's main category decides which one it is
 * (`categories.map_tier`), or the place's own `free_override`; VIP is what the published map plan grants
 * (`map_access`). Hidden gems and places without a map category stay locked.
 * The same rule is in migration 0026 for the existing rows.
 */

import { sql, type SQL } from 'drizzle-orm'

/** The map categories, in chip order (keys of the `categories` rows). */
export const MAP_FREE_CATEGORY_KEYS = [
  'activities',
  'sights',
  'malls',
  'beaches',
  'hospital',
] as const
export const MAP_VIP_CATEGORY_KEYS = [
  'restaurants',
  'cafes',
  'spa',
  'kids-care',
  'beauty',
  'waterfalls',
  'barbers',
] as const

export const MAP_TIERS = ['free', 'vip'] as const
export type MapTier = (typeof MAP_TIERS)[number]

export function isMapTier(value: unknown): value is MapTier {
  return value === 'free' || value === 'vip'
}

/**
 * Is a place in this category free on the map? `freeOverride` opens one place
 * of a VIP category on its own (client, Oct 2026: Sekumpul waterfall).
 */
export function freeOnMap(
  tier: string | null | undefined,
  isHiddenGem: boolean,
  freeOverride = false,
): boolean {
  return (tier === 'free' || freeOverride) && !isHiddenGem
}

/**
 * Recompute `is_free` / `required_entitlement` from the main category for the
 * places matched by `where` (a condition on `map_places`, or every place).
 */
export function syncPlaceAccessSql(where?: SQL): SQL {
  return sql`update map_places mp set
      is_free = (coalesce((select c.map_tier = 'free' from categories c where c.id = mp.category_id), false)
        or mp.free_override) and not mp.is_hidden_gem,
      required_entitlement = 'map_access'
    ${where === undefined ? sql`` : sql`where ${where}`}`
}

type Executor = { execute: (query: SQL) => PromiseLike<unknown> }

export async function syncPlaceAccess(db: Executor, where?: SQL): Promise<void> {
  await db.execute(syncPlaceAccessSql(where))
}
