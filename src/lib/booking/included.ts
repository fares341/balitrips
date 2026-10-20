/**
 * Activities a package (tier) includes, for pricing and display.
 *
 * Shared by the cart catalogue, checkout and the activity page so they read
 * the same rows in the same order. Server-only (database access).
 */

import { asc, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { tierIncludedActivities } from '@/db/schema'
import { includedTiming, type IncludedTiming } from '@/lib/pricing/quote'

export interface TierIncluded {
  activityId: string
  timing: IncludedTiming
}

type Executor = Pick<typeof db, 'select'>

export async function loadTierIncluded(
  tierIds: readonly string[],
  executor: Executor = db,
): Promise<Map<string, TierIncluded[]>> {
  const out = new Map<string, TierIncluded[]>()
  const ids = [...new Set(tierIds)]
  if (ids.length === 0) return out
  const rows = await executor
    .select({
      tierId: tierIncludedActivities.tierId,
      activityId: tierIncludedActivities.activityId,
      timing: tierIncludedActivities.timing,
    })
    .from(tierIncludedActivities)
    .where(inArray(tierIncludedActivities.tierId, ids))
    .orderBy(asc(tierIncludedActivities.sortOrder), asc(tierIncludedActivities.createdAt))
  for (const row of rows) {
    const list = out.get(row.tierId) ?? []
    list.push({ activityId: row.activityId, timing: includedTiming(row.timing) })
    out.set(row.tierId, list)
  }
  return out
}
