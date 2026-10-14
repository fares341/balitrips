/**
 * Loading activity add-ons for pricing.
 *
 * One loader for the cart catalogue, checkout and the activity page, so all
 * three see the same rows: every non-deleted add-on of the activity,
 * *including* switched-off ones — an unavailable add-on in a cart must be
 * rejected as `unavailable`, not reported as an id nobody recognises.
 *
 * Server-only (database access).
 */

import { and, asc, inArray, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { activityAddons } from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'

import { addonPricing, type AddonRule } from './price'

export interface ActivityAddonRow extends AddonRule {
  activityId: string
  name: Localized
  description: Localized | null
  sortOrder: number
}

type Executor = Pick<typeof db, 'select'>

export async function loadActivityAddons(
  activityIds: readonly string[],
  executor: Executor = db,
): Promise<Map<string, ActivityAddonRow[]>> {
  const out = new Map<string, ActivityAddonRow[]>()
  const ids = [...new Set(activityIds)]
  if (ids.length === 0) return out

  const rows = await executor
    .select()
    .from(activityAddons)
    .where(and(inArray(activityAddons.activityId, ids), isNull(activityAddons.deletedAt)))
    .orderBy(asc(activityAddons.sortOrder), asc(activityAddons.createdAt))

  for (const row of rows) {
    const list = out.get(row.activityId) ?? []
    list.push({
      id: row.id,
      activityId: row.activityId,
      name: row.name,
      description: row.description,
      priceMinor: row.priceMinor,
      currency: row.currency,
      pricing: addonPricing(row.pricing),
      maxQty: row.maxQty,
      onlyPackages: Array.isArray(row.onlyPackages) ? row.onlyPackages : [],
      requiresAddonId: row.requiresAddonId,
      available: row.available,
      sortOrder: row.sortOrder,
    })
    out.set(row.activityId, list)
  }
  return out
}

/** Strip display fields: the shape `CatalogSnapshot.activityAddons` holds. */
export function addonRules(map: ReadonlyMap<string, ActivityAddonRow[]>): Map<string, AddonRule[]> {
  return new Map(
    [...map].map(([activityId, rows]) => [
      activityId,
      rows.map(
        (row): AddonRule => ({
          id: row.id,
          priceMinor: row.priceMinor,
          currency: row.currency,
          pricing: row.pricing,
          maxQty: row.maxQty,
          onlyPackages: row.onlyPackages,
          requiresAddonId: row.requiresAddonId,
          available: row.available,
        }),
      ),
    ]),
  )
}
