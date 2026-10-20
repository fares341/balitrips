'use server'

/**
 * Activity editor, phase 2: places and closed dates, child ages, seasonal
 * prices. Every change is audited and refreshes the public activity page.
 */

import { and, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { activities, activityAvailability, activityTiers, tierSeasonalPrices } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { daysInRange } from '@/lib/booking-rules'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fcurrencyOr,
  fdate,
  fenum,
  fintOrNull,
  fmoney,
  fmoneyOrNull,
  fmulti,
  fstr,
} from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

type Outcome = { ok: string } | { err: string }

const tab = (activityId: string, name: string, month?: string | null) =>
  adminHref(
    `/activities/${activityId}?tab=${name}${month && /^\d{4}-\d{2}$/.test(month) ? `&month=${month}` : ''}`,
  )

function refreshPublic(): void {
  revalidatePath('/[locale]/activities/[slug]', 'page')
}

/** Longest range one "close dates" action may touch. */
const MAX_RANGE_DAYS = 400

async function activityRow(activityId: string) {
  const [row] = await db
    .select({ id: activities.id, timeSlots: activities.timeSlots, currency: activities.currency })
    .from(activities)
    .where(and(eq(activities.id, activityId), isNull(activities.deletedAt)))
    .limit(1)
  return row ?? null
}

/** Default places per departure and weekdays the activity never runs. */
export async function saveAvailabilitySettings(activityId: string, form: FormData): Promise<void> {
  const session = await requireCapability('capacity.write')
  const { t } = await getAdminI18n()
  const month = fstr(form, 'month')
  let outcome: Outcome
  try {
    const capacity = fintOrNull(form, 'capacityPerSlot', t('av.capacity'))
    if (capacity !== null && (capacity < 0 || capacity > 100_000))
      throw new Error(t('av.err_capacity'))
    const closedWeekdays = [
      ...new Set(
        fmulti(form, 'closedWeekdays')
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
      ),
    ].sort((a, b) => a - b)
    if (closedWeekdays.length === 7) throw new Error(t('av.err_all_closed'))
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          capacityPerSlot: activities.capacityPerSlot,
          closedWeekdays: activities.closedWeekdays,
        })
        .from(activities)
        .where(and(eq(activities.id, activityId), isNull(activities.deletedAt)))
        .limit(1)
      if (!before) throw new Error(t('activities.err_gone'))
      await tx
        .update(activities)
        .set({ capacityPerSlot: capacity, closedWeekdays, updatedAt: new Date() })
        .where(eq(activities.id, activityId))
      await writeAudit(
        {
          actor: session,
          action: 'activity_availability.settings',
          entityType: 'activity',
          entityId: activityId,
          before,
          after: { capacityPerSlot: capacity, closedWeekdays },
        },
        tx,
      )
    })
    outcome = { ok: t('av.ok_saved') }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(tab(activityId, 'availability', month), outcome))
}

/**
 * Close, reopen or set the places of a date range (one departure or all).
 * Booked counts are never touched.
 */
export async function setAvailabilityRange(activityId: string, form: FormData): Promise<void> {
  const session = await requireCapability('capacity.write')
  const { t } = await getAdminI18n()
  const month = fstr(form, 'month')
  let outcome: Outcome
  try {
    const activity = await activityRow(activityId)
    if (!activity) throw new Error(t('activities.err_gone'))
    const from = fdate(form, 'from', t('av.from'))
    const to = fdate(form, 'to', t('av.to')) ?? from
    if (!from || !to) throw new Error(t('av.err_dates'))
    if (to < from) throw new Error(t('av.err_dates'))
    const days = daysInRange(from, to)
    if (days.length > MAX_RANGE_DAYS) throw new Error(t('av.err_range_long', { n: MAX_RANGE_DAYS }))
    const slot = fstr(form, 'slot') ?? ''
    if (slot !== '' && !(activity.timeSlots ?? []).includes(slot)) throw new Error(t('av.err_slot'))
    const mode = fenum(form, 'mode', ['close', 'open', 'capacity'] as const, 'close')
    const capacity = mode === 'capacity' ? fintOrNull(form, 'capacity', t('av.capacity')) : null
    if (capacity !== null && (capacity < 0 || capacity > 100_000))
      throw new Error(t('av.err_capacity'))
    const note = (fstr(form, 'note') ?? '').trim().slice(0, 500) || null

    await db.transaction(async (tx) => {
      for (const day of days) {
        const set =
          mode === 'close'
            ? { isClosed: true, ...(note !== null ? { note } : {}) }
            : mode === 'open'
              ? { isClosed: false }
              : { capacity, ...(note !== null ? { note } : {}) }
        await tx
          .insert(activityAvailability)
          .values({ activityId, day, slot, booked: 0, ...set })
          .onConflictDoUpdate({
            target: [
              activityAvailability.activityId,
              activityAvailability.day,
              activityAvailability.slot,
            ],
            set: { ...set, updatedAt: new Date() },
          })
      }
      await writeAudit(
        {
          actor: session,
          action: `activity_availability.${mode}`,
          entityType: 'activity',
          entityId: activityId,
          before: null,
          after: { from, to, slot: slot || 'all', capacity, note },
        },
        tx,
      )
    })
    outcome = { ok: t('av.ok_range', { count: days.length }) }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(tab(activityId, 'availability', month), outcome))
}

/** The calendar's one-click close / reopen of a whole day. */
export async function toggleAvailabilityDay(
  activityId: string,
  day: string,
  close: boolean,
  month: string,
): Promise<void> {
  const session = await requireCapability('capacity.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(t('av.err_dates'))
    await db
      .insert(activityAvailability)
      .values({ activityId, day, slot: '', booked: 0, isClosed: close })
      .onConflictDoUpdate({
        target: [
          activityAvailability.activityId,
          activityAvailability.day,
          activityAvailability.slot,
        ],
        set: { isClosed: close, updatedAt: new Date() },
      })
    await writeAudit({
      actor: session,
      action: close ? 'activity_availability.close' : 'activity_availability.open',
      entityType: 'activity',
      entityId: activityId,
      before: null,
      after: { from: day, to: day, slot: 'all' },
    })
    outcome = { ok: close ? t('av.ok_closed_day', { day }) : t('av.ok_opened_day', { day }) }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(tab(activityId, 'availability', month), outcome))
}

/** Child age band; both blank switches child pricing off for the activity. */
export async function saveChildAges(activityId: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const min = fintOrNull(form, 'childAgeMin', t('av.child_min'))
    const max = fintOrNull(form, 'childAgeMax', t('av.child_max'))
    if ((min === null) !== (max === null)) throw new Error(t('av.err_child_ages'))
    if (min !== null && max !== null && (min < 0 || max > 17 || min > max)) {
      throw new Error(t('av.err_child_ages'))
    }
    await db
      .update(activities)
      .set({ childAgeMin: min, childAgeMax: max, updatedAt: new Date() })
      .where(and(eq(activities.id, activityId), isNull(activities.deletedAt)))
    await writeAudit({
      actor: session,
      action: 'activity.child_ages',
      entityType: 'activity',
      entityId: activityId,
      before: null,
      after: { childAgeMin: min, childAgeMax: max },
    })
    outcome = { ok: t('av.ok_child_ages') }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(tab(activityId, 'packages'), outcome))
}

/** Add a seasonal price to one package. */
export async function addSeasonalPrice(
  activityId: string,
  tierId: string,
  form: FormData,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    if (!can(session.role, 'prices.write')) throw new Error(t('team.err_prices'))
    const [tier] = await db
      .select({ id: activityTiers.id, currency: activityTiers.currency })
      .from(activityTiers)
      .where(
        and(
          eq(activityTiers.id, tierId),
          eq(activityTiers.activityId, activityId),
          isNull(activityTiers.deletedAt),
        ),
      )
      .limit(1)
    if (!tier) throw new Error(t('activities.err_tier_gone'))
    const currency = fcurrencyOr(form, 'currency', tier.currency)
    const fromDate = fdate(form, 'fromDate', t('av.from'))
    const toDate = fdate(form, 'toDate', t('av.to'))
    if (!fromDate || !toDate || toDate < fromDate) throw new Error(t('av.err_dates'))
    const priceMinor = fmoney(form, 'price', currency, t('common.price'))
    const childPriceMinor = fmoneyOrNull(form, 'childPrice', currency, t('av.child_price'))
    const weekdays = [
      ...new Set(
        fmulti(form, 'weekdays')
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
      ),
    ].sort((a, b) => a - b)
    const label = (fstr(form, 'label') ?? '').trim().slice(0, 80) || null
    const [row] = await db
      .insert(tierSeasonalPrices)
      .values({
        tierId,
        fromDate,
        toDate,
        priceMinor,
        childPriceMinor,
        weekdays: weekdays.length === 7 ? [] : weekdays,
        label,
      })
      .returning()
    await writeAudit({
      actor: session,
      action: 'seasonal_price.create',
      entityType: 'activity_tier',
      entityId: tierId,
      before: null,
      after: row ?? null,
    })
    outcome = { ok: t('av.ok_season_added') }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(`${tab(activityId, 'packages')}#seasons-${tierId}`, outcome))
}

export async function removeSeasonalPrice(activityId: string, seasonId: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    if (!can(session.role, 'prices.write')) throw new Error(t('team.err_prices'))
    const [row] = await db
      .select({ season: tierSeasonalPrices })
      .from(tierSeasonalPrices)
      .innerJoin(activityTiers, eq(activityTiers.id, tierSeasonalPrices.tierId))
      .where(and(eq(tierSeasonalPrices.id, seasonId), eq(activityTiers.activityId, activityId)))
      .limit(1)
    if (!row) throw new Error(t('av.err_season_gone'))
    await db.delete(tierSeasonalPrices).where(eq(tierSeasonalPrices.id, seasonId))
    await writeAudit({
      actor: session,
      action: 'seasonal_price.delete',
      entityType: 'activity_tier',
      entityId: row.season.tierId,
      before: row.season,
      after: null,
    })
    outcome = { ok: t('av.ok_season_removed') }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(tab(activityId, 'packages'), outcome))
}
