import { inArray } from 'drizzle-orm'

import { db } from '@/db'
import { activities, itineraries, mapPlaces, packages, plans } from '@/db/schema'

/**
 * Browsers report items by slug (it is what the URL has). The id is looked
 * up here so reports can join on it. Unknown slugs keep `item_id` empty.
 */
export async function resolveItemIds(
  wanted: readonly { kind: string; ref: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const byKind = new Map<string, Set<string>>()
  for (const { kind, ref } of wanted) {
    if (!/^[a-z0-9][a-z0-9-]{0,127}$/i.test(ref)) continue
    const set = byKind.get(kind) ?? new Set<string>()
    set.add(ref)
    byKind.set(kind, set)
  }
  const lookup = async (kind: string, refs: string[]): Promise<{ id: string; slug: string }[]> => {
    switch (kind) {
      case 'activity':
        return db
          .select({ id: activities.id, slug: activities.slug })
          .from(activities)
          .where(inArray(activities.slug, refs))
      case 'itinerary':
        return db
          .select({ id: itineraries.id, slug: itineraries.slug })
          .from(itineraries)
          .where(inArray(itineraries.slug, refs))
      case 'package':
        return db
          .select({ id: packages.id, slug: packages.slug })
          .from(packages)
          .where(inArray(packages.slug, refs))
      case 'place':
        return db
          .select({ id: mapPlaces.id, slug: mapPlaces.slug })
          .from(mapPlaces)
          .where(inArray(mapPlaces.slug, refs))
      case 'plan':
        return db
          .select({ id: plans.id, slug: plans.slug })
          .from(plans)
          .where(inArray(plans.slug, refs))
      default:
        return []
    }
  }
  await Promise.all(
    [...byKind.entries()].map(async ([kind, refs]) => {
      for (const row of await lookup(kind, [...refs])) out.set(`${kind}:${row.slug}`, row.id)
    }),
  )
  return out
}
