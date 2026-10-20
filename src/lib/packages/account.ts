/**
 * Does a trip have to be bought with an account? (Phase 3.)
 *
 * Itineraries, plans and custom plans always do (`ACCOUNT_ONLY_KINDS`): what
 * they deliver lives in an account. A package does when it comes with an
 * itinerary or VIP — those are granted to an account on payment, and a guest
 * order has nobody to give them to.
 */

import { and, eq, inArray, isNotNull, or } from 'drizzle-orm'

import { db } from '@/db'
import { itineraries, packages, plans } from '@/db/schema'

export async function needsAccount(
  lines: readonly { kind: string; refId: string | null }[],
  accountOnlyKinds: readonly string[],
): Promise<boolean> {
  if (lines.some((line) => accountOnlyKinds.includes(line.kind))) return true
  const packageIds = lines
    .filter((line) => line.kind === 'package' && line.refId !== null)
    .map((line) => line.refId as string)
  if (packageIds.length === 0) return false
  const [row] = await db
    .select({ id: packages.id })
    .from(packages)
    .where(
      and(
        inArray(packages.id, packageIds),
        or(isNotNull(packages.itineraryId), eq(packages.includesVip, true)),
      ),
    )
    .limit(1)
  return row !== undefined
}

/** Does anything in the trip already give VIP (so no "add VIP" offer)? */
export async function tripIncludesVip(
  lines: readonly { kind: string; refId: string | null }[],
): Promise<boolean> {
  const ids = (kind: string) =>
    lines.filter((line) => line.kind === kind && line.refId !== null).map((l) => l.refId as string)
  const [planIds, itineraryIds, packageIds] = [ids('plan'), ids('itinerary'), ids('package')]
  if (planIds.length > 0) {
    const [row] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(and(inArray(plans.id, planIds), eq(plans.entitlementKind, 'vip')))
      .limit(1)
    if (row) return true
  }
  if (itineraryIds.length > 0) {
    const [row] = await db
      .select({ id: itineraries.id })
      .from(itineraries)
      .where(
        and(
          inArray(itineraries.id, itineraryIds),
          eq(itineraries.mapAccess, 'vip_included'),
          eq(itineraries.isVip, true),
        ),
      )
      .limit(1)
    if (row) return true
  }
  if (packageIds.length > 0) {
    const [row] = await db
      .select({ id: packages.id })
      .from(packages)
      .where(and(inArray(packages.id, packageIds), eq(packages.includesVip, true)))
      .limit(1)
    if (row) return true
  }
  return false
}
