/**
 * «احجز كل الفعاليات» — the server half (itineraries phase 3).
 *
 * Called by the cart (what is shown) and by checkout (what is charged), the
 * same call in both places, so the discount cannot be set by the browser:
 * it reads the tagged cart lines, checks the cart's owner bought each
 * itinerary (settled order, line not refunded) and has uses left, and hands
 * the server-priced lines to the pure `cartBundleDiscounts`.
 *
 * Server-only.
 */

import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import { activities, itineraries, itineraryDays, orders } from '@/db/schema'
import type { ExtraDiscount } from '@/lib/finance/adjustments'
import { BOOKABLE_STATUSES } from '@/lib/content/activity-status'
import { ownsItinerary } from '@/lib/content/extra-queries'
import type { CatalogSnapshot, Quote, QuoteRequestItem } from '@/lib/pricing/quote'

import { bundlePct, cartBundleDiscounts, type BundleCartLine, type BundleRule } from './bundle'
import { readItinerarySales } from './sales-settings-store'

export const BUNDLE_CODE = 'ALL-ACTIVITIES'

const BUNDLE_LABEL = {
  ar: 'خصم «كل الفعاليات»',
  en: '«All activities» discount',
  id: 'Diskon «semua aktivitas»',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SETTLED = ['paid', 'confirmed', 'partially_refunded'] as const

/** The bookable activities linked to an itinerary's days, in day order (one per activity). */
export async function linkedBookableActivities(
  itineraryId: string,
): Promise<{ activityId: string; dayNumber: number }[]> {
  const rows = await db
    .select({ activityId: itineraryDays.activityId, dayNumber: itineraryDays.dayNumber })
    .from(itineraryDays)
    .innerJoin(activities, eq(activities.id, itineraryDays.activityId))
    .where(
      and(
        eq(itineraryDays.itineraryId, itineraryId),
        eq(itineraryDays.bookable, true),
        inArray(activities.status, [...BOOKABLE_STATUSES]),
        isNull(activities.deletedAt),
      ),
    )
    .orderBy(asc(itineraryDays.dayNumber))
  const out: { activityId: string; dayNumber: number }[] = []
  for (const row of rows) {
    if (row.activityId !== null && !out.some((one) => one.activityId === row.activityId))
      out.push({ activityId: row.activityId, dayNumber: row.dayNumber })
  }
  return out
}

/** Settled orders of this user that already used the discount for this itinerary. */
async function usesSoFar(userId: string, itineraryId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(orders)
    .where(
      and(
        eq(orders.userId, userId),
        inArray(orders.status, [...SETTLED]),
        sql`${orders.adjustments} @> ${JSON.stringify([{ itineraryId }])}::jsonb`,
      ),
    )
  return row?.value ?? 0
}

/** The rule for one itinerary as this user would get it (eligibility checked here). */
export async function bundleRuleFor(
  itineraryId: string,
  userId: string | null,
): Promise<BundleRule & { usesLeft: number }> {
  const settings = await readItinerarySales()
  const [row] = await db
    .select({ own: itineraries.bundleDiscountPct })
    .from(itineraries)
    .where(eq(itineraries.id, itineraryId))
    .limit(1)
  const linked = await linkedBookableActivities(itineraryId)
  const owner = userId !== null && (await ownsItinerary(userId, itineraryId))
  const usesLeft = owner
    ? Math.max(0, settings.usesPerPurchase - (await usesSoFar(userId, itineraryId)))
    : 0
  return {
    itineraryId,
    linkedActivityIds: linked.map((one) => one.activityId),
    pct: bundlePct(row?.own, settings.allActivitiesDiscountPct),
    includesDriver: settings.discountIncludesDriver,
    eligible: owner && usesLeft > 0,
    usesLeft,
  }
}

/** Cart lines as the pure function needs them. */
export function bundleLinesOf(
  items: readonly QuoteRequestItem[],
  quote: Quote,
  snapshot: Pick<CatalogSnapshot, 'activityTiers'>,
): BundleCartLine[] {
  const totals = new Map(quote.lines.map((line) => [line.itemId, line.lineTotalMinor]))
  return items.map((item) => ({
    itemId: item.id,
    kind: item.kind,
    activityId:
      item.refId === null
        ? null
        : item.kind === 'activity'
          ? item.refId
          : item.kind === 'activity_tier'
            ? (snapshot.activityTiers.get(item.refId)?.activityId ?? null)
            : null,
    parentItemId: item.parentItemId,
    bundleItineraryId:
      typeof item.options?.itineraryBundle === 'string' ? item.options.itineraryBundle : null,
    lineTotalMinor: totals.get(item.id) ?? null,
  }))
}

/**
 * The «كل الفعاليات» discount lines for a cart. Empty for a guest cart, a
 * cart with no tagged lines, a non-owner, or an incomplete selection.
 */
export async function itineraryBundleDiscounts(
  items: readonly QuoteRequestItem[],
  quote: Quote,
  snapshot: Pick<CatalogSnapshot, 'activityTiers'>,
  userId: string | null,
): Promise<ExtraDiscount[]> {
  if (userId === null || !quote.ok) return []
  const lines = bundleLinesOf(items, quote, snapshot)
  const ids = [
    ...new Set(
      lines
        .map((line) => line.bundleItineraryId)
        .filter((id): id is string => id !== null && UUID.test(id)),
    ),
  ].slice(0, 5)
  if (ids.length === 0) return []
  const rules = await Promise.all(ids.map((id) => bundleRuleFor(id, userId)))
  return cartBundleDiscounts(lines, rules).map((one) => ({
    amountMinor: one.amountMinor,
    code: BUNDLE_CODE,
    label: BUNDLE_LABEL,
    itineraryId: one.itineraryId,
  }))
}
