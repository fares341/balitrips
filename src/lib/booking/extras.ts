/**
 * Phase 2 catalogue facts for pricing: seasonal prices per package and
 * availability rules per activity. One loader for the cart catalogue,
 * checkout and the activity page, so all of them price and check the same.
 *
 * Server-only (database access).
 */

import { and, asc, gte, inArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import { activities, activityAvailability, tierSeasonalPrices } from '@/db/schema'
import { isUnrestricted, weekdayList, type AvailabilityRules } from '@/lib/availability/rules'
import type { CatalogSnapshot } from '@/lib/pricing/quote'

import type { SeasonalPrice } from './seasonal'

type Executor = Pick<typeof db, 'select'>

export interface BookingExtras {
  seasons: Map<string, SeasonalPrice[]>
  /** Only activities with something configured (capacity or closures). */
  availability: Map<string, AvailabilityRules>
}

export async function loadSeasons(
  tierIds: readonly string[],
  executor: Executor = db,
): Promise<Map<string, SeasonalPrice[]>> {
  const out = new Map<string, SeasonalPrice[]>()
  const ids = [...new Set(tierIds)]
  if (ids.length === 0) return out
  const rows = await executor
    .select()
    .from(tierSeasonalPrices)
    .where(inArray(tierSeasonalPrices.tierId, ids))
    .orderBy(asc(tierSeasonalPrices.fromDate))
  for (const row of rows) {
    const list = out.get(row.tierId) ?? []
    list.push({
      fromDate: row.fromDate,
      toDate: row.toDate,
      priceMinor: row.priceMinor,
      childPriceMinor: row.childPriceMinor,
      weekdays: weekdayList(row.weekdays),
      label: row.label,
    })
    out.set(row.tierId, list)
  }
  return out
}

/**
 * Availability rules of activities, with their per-date rows from yesterday
 * on (Bali dates are never more than a day behind the server's).
 *
 * @param all  Include activities with nothing configured (the booking box
 *             wants a definite answer); pricing leaves them out so they
 *             behave exactly as before phase 2.
 */
export async function loadAvailability(
  activityIds: readonly string[],
  executor: Executor = db,
  all = false,
): Promise<Map<string, AvailabilityRules>> {
  const out = new Map<string, AvailabilityRules>()
  const ids = [...new Set(activityIds)]
  if (ids.length === 0) return out
  const [facts, rows] = await Promise.all([
    executor
      .select({
        id: activities.id,
        timeSlots: activities.timeSlots,
        capacityPerSlot: activities.capacityPerSlot,
        closedWeekdays: activities.closedWeekdays,
      })
      .from(activities)
      .where(inArray(activities.id, ids)),
    executor
      .select({
        activityId: activityAvailability.activityId,
        day: activityAvailability.day,
        slot: activityAvailability.slot,
        capacity: activityAvailability.capacity,
        booked: activityAvailability.booked,
        isClosed: activityAvailability.isClosed,
      })
      .from(activityAvailability)
      .where(
        and(
          inArray(activityAvailability.activityId, ids),
          gte(activityAvailability.day, sql`(current_date - 1)`),
        ),
      ),
  ])
  for (const fact of facts) {
    const rules: AvailabilityRules = {
      capacityPerSlot: fact.capacityPerSlot,
      closedWeekdays: weekdayList(fact.closedWeekdays),
      hasSlots: (fact.timeSlots ?? []).length > 0,
      rows: rows
        .filter((row) => row.activityId === fact.id)
        .map((row) => ({
          day: row.day,
          slot: row.slot,
          capacity: row.capacity,
          booked: row.booked,
          isClosed: row.isClosed,
        })),
    }
    if (all || !isUnrestricted(rules)) out.set(fact.id, rules)
  }
  return out
}

export async function loadBookingExtras(
  activityIds: readonly string[],
  tierIds: readonly string[],
  executor: Executor = db,
): Promise<BookingExtras> {
  const [seasons, availability] = await Promise.all([
    loadSeasons(tierIds, executor),
    loadAvailability(activityIds, executor),
  ])
  return { seasons, availability }
}

/** Put the phase 2 facts into a snapshot built by a catalogue loader. */
export function applyExtras(snapshot: CatalogSnapshot, extras: BookingExtras): void {
  for (const [id, facts] of snapshot.activities) {
    const rules = extras.availability.get(id)
    if (rules) facts.availability = rules
  }
  for (const [id, facts] of snapshot.activityTiers) {
    const seasons = extras.seasons.get(id)
    if (seasons && seasons.length > 0) facts.seasons = seasons
  }
}
