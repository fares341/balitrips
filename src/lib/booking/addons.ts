/**
 * Loading activity add-ons for pricing.
 *
 * One loader for the cart catalogue, checkout and the activity page, so all
 * three see the same rows: every non-deleted add-on of the activity — its own
 * (`activity_addons`) and the library ones linked to it (`activity_addon_links`,
 * with the link's price override, package restriction and "required" flag) —
 * *including* switched-off ones — an unavailable add-on in a cart must be
 * rejected as `unavailable`, not reported as an id nobody recognises.
 *
 * Server-only (database access).
 */

import { and, asc, eq, inArray, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { activityAddonLinks, activityAddons, addonsLibrary } from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'

import { addonPricing, type AddonPriceTier, type AddonRule } from './price'

export interface ActivityAddonRow extends AddonRule {
  activityId: string
  name: Localized
  description: Localized | null
  sortOrder: number
  /** `activity` = the older per-activity add-on; `library` = linked from the shared library. */
  source: 'activity' | 'library'
  /** Library add-ons only: picture and unit label for the add-on card. */
  imageId: string | null
  unitLabel: Localized | null
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
      priceTiers: cleanTiers(row.priceTiers),
      incompatibleWith: Array.isArray(row.incompatibleWith) ? row.incompatibleWith : [],
      sortOrder: row.sortOrder,
      source: 'activity',
      imageId: null,
      unitLabel: null,
    })
    out.set(row.activityId, list)
  }

  // Library add-ons linked to these activities. The library row's own id is
  // the add-on id in carts and orders (uuids: no clash with the older table).
  const links = await executor
    .select({ link: activityAddonLinks, addon: addonsLibrary })
    .from(activityAddonLinks)
    .innerJoin(addonsLibrary, eq(addonsLibrary.id, activityAddonLinks.addonId))
    .where(and(inArray(activityAddonLinks.activityId, ids), isNull(addonsLibrary.deletedAt)))
    .orderBy(asc(activityAddonLinks.sortOrder), asc(addonsLibrary.sortOrder))

  for (const { link, addon } of links) {
    const list = out.get(link.activityId) ?? []
    list.push({
      id: addon.id,
      activityId: link.activityId,
      name: addon.name,
      description: addon.description,
      priceMinor: link.priceMinor ?? addon.priceMinor,
      currency: addon.currency,
      pricing: addonPricing(addon.pricing),
      maxQty: addon.maxQty,
      onlyPackages: Array.isArray(link.onlyPackages) ? link.onlyPackages : [],
      requiresAddonId: null,
      available: addon.available,
      priceTiers: cleanTiers(addon.priceTiers),
      incompatibleWith: Array.isArray(addon.incompatibleWith) ? addon.incompatibleWith : [],
      required: link.required,
      sortOrder: link.sortOrder,
      source: 'library',
      imageId: addon.imageId,
      unitLabel: addon.unitLabel,
    })
    out.set(link.activityId, list)
  }
  // One display order across both sources (stable: per-activity ones first on a tie).
  for (const [key, list] of out) {
    out.set(
      key,
      list
        .map((row, index) => ({ row, index }))
        .sort((a, b) => a.row.sortOrder - b.row.sortOrder || a.index - b.index)
        .map(({ row }) => row),
    )
  }
  return out
}

/** Stored price steps, malformed ones dropped, lowest quantity first. */
export function cleanTiers(value: unknown): AddonPriceTier[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (tier): tier is AddonPriceTier =>
        typeof tier === 'object' &&
        tier !== null &&
        Number.isInteger((tier as AddonPriceTier).minQty) &&
        (tier as AddonPriceTier).minQty >= 1 &&
        Number.isInteger((tier as AddonPriceTier).priceMinor) &&
        (tier as AddonPriceTier).priceMinor >= 0,
    )
    .map((tier) => ({ minQty: tier.minQty, priceMinor: tier.priceMinor }))
    .sort((a, b) => a.minQty - b.minQty)
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
          ...(row.required === true ? { required: true } : {}),
          ...(row.priceTiers && row.priceTiers.length > 0 ? { priceTiers: row.priceTiers } : {}),
          ...(row.incompatibleWith && row.incompatibleWith.length > 0
            ? { incompatibleWith: row.incompatibleWith }
            : {}),
        }),
      ),
    ]),
  )
}
