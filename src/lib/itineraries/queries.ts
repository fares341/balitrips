/**
 * Itinerary day places and sale facts — database side (phase 3).
 *
 * Every function that returns places takes the viewer's `EntitlementSet` and
 * returns them already redacted (`buildDayStops` over `placeTeasersById`), so
 * a caller cannot hand a locked place to a Client Component by accident.
 */

import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  entitlements,
  itineraries,
  itineraryDayPlaces,
  itineraryDays,
  orderItems,
  orders,
  plans,
} from '@/db/schema'
import { placeTeasersById } from '@/lib/content/extra-queries'
import type { LocalizedText } from '@/lib/content/localize'
import type { EntitlementSet } from '@/lib/entitlements/redaction'

import { buildDayStops, type DayStop } from './day-route'
import { mapAccessOf } from './sale'

/** The stops of each given day, in order and redacted for `held`. */
export async function loadDayStops(
  dayIds: readonly string[],
  held: EntitlementSet,
): Promise<Map<string, DayStop[]>> {
  const out = new Map<string, DayStop[]>()
  if (dayIds.length === 0) return out
  const rows = await db
    .select({
      dayId: itineraryDayPlaces.dayId,
      placeId: itineraryDayPlaces.placeId,
      sortOrder: itineraryDayPlaces.sortOrder,
      note: itineraryDayPlaces.note,
      visitTime: itineraryDayPlaces.visitTime,
    })
    .from(itineraryDayPlaces)
    .where(inArray(itineraryDayPlaces.dayId, [...dayIds]))
    .orderBy(asc(itineraryDayPlaces.dayId), asc(itineraryDayPlaces.sortOrder))
  const teasers = await placeTeasersById(
    rows.map((row) => row.placeId),
    held,
  )
  for (const dayId of dayIds) {
    out.set(
      dayId,
      buildDayStops(
        rows.filter((row) => row.dayId === dayId),
        teasers,
      ),
    )
  }
  return out
}

export interface VipOffer {
  planId: string
  slug: string
  name: LocalizedText
  priceMinor: number
  currency: string
  durationDays: number | null
}

/**
 * The paid map plan to offer: the one picked in Studio when it is published
 * and VIP, else the cheapest published VIP plan. When no VIP plan is on sale
 * (client, Oct 2026: /plans shows only Free and the $19 map plan) the
 * cheapest published map-access plan is offered instead — unless `userId`
 * already holds map access, which that plan would only repeat. Null when
 * nothing fits.
 */
export async function vipPlanOffer(
  preferredId: string | null,
  userId: string | null = null,
): Promise<VipOffer | null> {
  const rows = await db
    .select({
      id: plans.id,
      slug: plans.slug,
      name: plans.name,
      priceMinor: plans.priceMinor,
      currency: plans.currency,
      durationDays: plans.durationDays,
      kind: plans.entitlementKind,
    })
    .from(plans)
    .where(
      and(
        eq(plans.status, 'published'),
        isNull(plans.deletedAt),
        inArray(plans.entitlementKind, ['vip', 'map_access']),
      ),
    )
    .orderBy(asc(plans.priceMinor))
  const vip = rows.filter((row) => row.kind === 'vip')
  let chosen = vip.find((row) => row.id === preferredId) ?? vip[0]
  if (!chosen) {
    chosen = rows.find((row) => row.kind === 'map_access')
    if (chosen && (await holdsMapAccess(userId))) return null
  }
  if (!chosen) return null
  return {
    planId: chosen.id,
    slug: chosen.slug,
    name: chosen.name,
    priceMinor: chosen.priceMinor,
    currency: chosen.currency,
    durationDays: chosen.durationDays,
  }
}

/** Does the user hold live paid map access (map access or VIP, any source)? */
export async function holdsMapAccess(userId: string | null): Promise<boolean> {
  if (userId === null) return false
  const now = new Date()
  const [row] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        inArray(entitlements.kind, ['vip', 'map_access']),
        isNull(entitlements.revokedAt),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
        lte(entitlements.startsAt, now),
      ),
    )
    .limit(1)
  return row !== undefined
}

/** Does the user hold live VIP right now (any source)? */
export async function holdsVip(userId: string | null): Promise<boolean> {
  if (userId === null) return false
  const now = new Date()
  const [row] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.kind, 'vip'),
        isNull(entitlements.revokedAt),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
        lte(entitlements.startsAt, now),
      ),
    )
    .limit(1)
  return row !== undefined
}

/** Itineraries the user has a live (settled, not refunded) line for, newest first. */
export async function ownedItineraryIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ refId: orderItems.refId, placedAt: orders.placedAt })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orderItems.kind, 'itinerary'),
        inArray(orders.status, ['paid', 'confirmed', 'partially_refunded']),
        sql`${orderItems.fulfilmentStatus} not in ('refunded', 'cancelled')`,
      ),
    )
    .orderBy(desc(orders.placedAt))
  const out: string[] = []
  for (const row of rows) if (row.refId !== null && !out.includes(row.refId)) out.push(row.refId)
  return out
}

export interface OwnedItineraryPlan {
  id: string
  slug: string
  name: LocalizedText
  mapAccess: string
  vipPlanId: string | null
  days: { id: string; dayNumber: number; title: LocalizedText | null }[]
}

/** The live itineraries among `ids`, with their days in order. */
export async function itineraryPlans(ids: readonly string[]): Promise<OwnedItineraryPlan[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({
      id: itineraries.id,
      slug: itineraries.slug,
      name: itineraries.name,
      mapAccess: itineraries.mapAccess,
      includesMap: itineraries.includesMap,
      vipPlanId: itineraries.vipPlanId,
    })
    .from(itineraries)
    .where(
      and(
        inArray(itineraries.id, [...ids]),
        eq(itineraries.status, 'published'),
        isNull(itineraries.deletedAt),
      ),
    )
  if (rows.length === 0) return []
  const days = await db
    .select({
      id: itineraryDays.id,
      itineraryId: itineraryDays.itineraryId,
      dayNumber: itineraryDays.dayNumber,
      title: itineraryDays.title,
    })
    .from(itineraryDays)
    .where(
      inArray(
        itineraryDays.itineraryId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(itineraryDays.dayNumber))
  return ids.flatMap((id) => {
    const row = rows.find((one) => one.id === id)
    if (!row) return []
    return [
      {
        id: row.id,
        slug: row.slug,
        name: row.name,
        mapAccess: mapAccessOf(row),
        vipPlanId: row.vipPlanId,
        days: days
          .filter((day) => day.itineraryId === row.id)
          .map((day) => ({ id: day.id, dayNumber: day.dayNumber, title: day.title })),
      },
    ]
  })
}
