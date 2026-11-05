import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import { googleApiUsage } from '@/db/schema'

import { BILLABLE, GoogleCapError, type GoogleCallKind } from './client'
import { dailyCap } from './config'

/** UTC day, `YYYY-MM-DD`. */
export function usageDay(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * The cost guard. Checks today's count for the call's class (billable or
 * free) against the cap, then counts the call. One upsert per call; two
 * racing requests can overshoot the cap by one or two, never by more.
 */
export async function takeGoogleCall(kind: GoogleCallKind): Promise<void> {
  const day = usageDay()
  const cap = dailyCap()
  const billable = BILLABLE.has(kind)
  const kinds = billable ? [...BILLABLE] : [kind]
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${googleApiUsage.count}), 0)::int` })
    .from(googleApiUsage)
    .where(and(eq(googleApiUsage.day, day), inArray(googleApiUsage.kind, kinds)))
  const used = Number(row?.total ?? 0)
  if (used >= (billable ? cap.billable : cap.free)) throw new GoogleCapError(kind)
  await db
    .insert(googleApiUsage)
    .values({ day, kind, count: 1 })
    .onConflictDoUpdate({
      target: [googleApiUsage.day, googleApiUsage.kind],
      set: { count: sql`${googleApiUsage.count} + 1`, updatedAt: new Date() },
    })
}

export interface UsageRow {
  day: string
  kind: string
  count: number
}

/** The last `days` days of counters, newest first (Studio usage table). */
export async function recentGoogleUsage(days = 31): Promise<UsageRow[]> {
  const since = usageDay(new Date(Date.now() - days * 86_400_000))
  return db
    .select({ day: googleApiUsage.day, kind: googleApiUsage.kind, count: googleApiUsage.count })
    .from(googleApiUsage)
    .where(gte(googleApiUsage.day, since))
    .orderBy(desc(googleApiUsage.day), googleApiUsage.kind)
}

/**
 * True once today's billable Google calls reached the cap. Pages then show
 * the fallback photo (free photo / glyph) instead of the Google one, silently.
 */
export async function googleCapReached(): Promise<boolean> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${googleApiUsage.count}), 0)::int` })
    .from(googleApiUsage)
    .where(and(eq(googleApiUsage.day, usageDay()), inArray(googleApiUsage.kind, [...BILLABLE])))
  return Number(row?.total ?? 0) >= dailyCap().billable
}
