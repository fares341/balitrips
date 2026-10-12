import { and, eq, gt, isNull, or } from 'drizzle-orm'

import { db } from '@/db'
import { entitlements } from '@/db/schema'

import {
  emptyEntitlements,
  isEntitlementKind,
  makeEntitlementSet,
  type EntitlementSet,
} from './redaction'

export * from './redaction'

/**
 * Load a user's live entitlements.
 *
 * Called on every request that could expose gated content. Deliberately not
 * cached in a cookie or token: a refund must remove access immediately, and
 * a stale token would keep the map unlocked until it expired.
 *
 * This replaces `mapUnlocked`, which was a localStorage boolean set by
 * clicking either plan tier with no payment involved.
 */
export async function loadEntitlements(userId: string | null): Promise<EntitlementSet> {
  if (!userId) return emptyEntitlements()

  const rows = await db
    .select({ kind: entitlements.kind })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        isNull(entitlements.revokedAt),
        // NULL expiry means lifetime, which is what the design's copy
        // describes ("yours for the whole trip"). A date makes the same
        // table serve recurring plans with no schema change.
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, new Date())),
      ),
    )

  return makeEntitlementSet(rows.map((r) => r.kind).filter(isEntitlementKind))
}
