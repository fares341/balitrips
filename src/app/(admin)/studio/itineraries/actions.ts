'use server'

import { BASE_CURRENCY } from '@/lib/currency/fx'
import { ITINERARY_TIERS, normaliseTierPrices, type TierPrices } from '@/lib/itineraries/tiers'

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { arabicPdfFacts } from './pdf-facts'
import { publishBlock } from '@/lib/itineraries/publish-gate'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import {
  itineraries,
  itineraryDayPlaces,
  itineraryDocuments,
  itineraryDays,
  itineraryPackageLinks,
  itineraryRegions,
  mapPlaces,
  packages,
} from '@/db/schema'
import {
  MAP_ACCESS,
  PACKAGE_PRICE_RULES,
  legacyFlagsFor,
  normaliseVisitTime,
} from '@/lib/itineraries/sale'
import { locales, type Locale } from '@/i18n/config'
import { assertPriceChangeAllowed } from '@/lib/auth/price-guard'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit, type Tx } from '../../_lib/audit'
import {
  fbool,
  fintOrNull,
  flocalizedList,
  flocalizedOrNull,
  flocalizedRequired,
  fenum,
  fmoney,
  fmoneyOrNull,
  fmulti,
  freq,
  fstr,
  fuuidOrNull,
  isUuid,
} from '../../_lib/form'
import type { Translate } from '../../_i18n'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { assertSlug } from '../../_lib/slug'

const LIST = adminHref('/itineraries')
const editor = (id: string) => adminHref(`/itineraries/${id}`)

type Outcome = { ok: string } | { err: string }

/** The priced levels in a fixed order, or null when none is priced. */
function tierPricesOrNull(raw: unknown): TierPrices | null {
  const prices = normaliseTierPrices(raw)
  return Object.keys(prices).length === 0 ? null : prices
}

// ---------------------------------------------------------------------------
// Itinerary core
// ---------------------------------------------------------------------------

export async function saveItinerary(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()

  let target = id === 'new' ? LIST : editor(id)
  let outcome: Outcome

  try {
    const mapAccess = fenum(form, 'mapAccess', MAP_ACCESS, 'free_only')
    // Levels (client, Oct 2026): a blank price = that level is not on sale.
    const tierPrices = tierPricesOrNull(
      Object.fromEntries(
        ITINERARY_TIERS.map((key) => [
          key,
          fmoneyOrNull(form, `tier_${key}`, BASE_CURRENCY, t(`itineraries.tier_${key}`)),
        ]),
      ),
    )
    const values = {
      slug: assertSlug(freq(form, 'slug', t('itineraries.f_slug'))),
      legacyId: fstr(form, 'legacyId'),
      name: flocalizedRequired(form, 'name', t('itineraries.f_name')),
      blurb: flocalizedOrNull(form, 'blurb'),
      spots: fintOrNull(form, 'spots', t('itineraries.f_spots')),
      tripType: flocalizedOrNull(form, 'tripType'),
      audience: flocalizedList(form, 'audience'),
      priceMinor: fmoney(form, 'priceMinor', BASE_CURRENCY, t('common.price')),
      currency: BASE_CURRENCY,
      tierPrices,
      heroImageId: fuuidOrNull(form, 'heroImageId', t('itineraries.hero_image')),
      // الوثيقة 4.2
      detailedDescription: flocalizedOrNull(form, 'detailedDescription'),
      // Phase 3: the map rule decides; the legacy flags follow it.
      mapAccess,
      ...legacyFlagsFor(mapAccess),
      vipPlanId: fuuidOrNull(form, 'vipPlanId', t('p3.vip_plan')),
      saleDigital: fbool(form, 'saleDigital'),
      saleWithActivities: fbool(form, 'saleWithActivities'),
      saleWithPackages: fbool(form, 'saleWithPackages'),
      saleCustomRequest: fbool(form, 'saleCustomRequest'),
      internalNotes: fstr(form, 'internalNotes')?.slice(0, 5000) ?? null,
      galleryImageIds: fmulti(form, 'galleryImageIds').filter(isUuid).slice(0, 24),
      linkedPlaceIds: fmulti(form, 'linkedPlaceIds').filter(isUuid).slice(0, 100),
    }

    const regionIds = fmulti(form, 'regionIds')

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(itineraries).where(eq(itineraries.id, id)).limit(1))[0] ??
            null)

      if (id !== 'new' && !before) throw new Error(t('itineraries.err_gone'))
      // Phase 6: without `prices.write` the price must come back as stored.
      assertPriceChangeAllowed(
        session.role,
        before ? { ...before, tierPrices: tierPricesOrNull(before.tierPrices) } : null,
        values,
        before ? ['priceMinor', 'currency', 'tierPrices'] : ['priceMinor', 'tierPrices'],
        t('team.err_prices'),
      )

      const [row] =
        id === 'new'
          ? await tx
              .insert(itineraries)
              .values({
                ...values,
                // Length is derived from the authored day plan, never typed
                // in — a mismatch between the two is precisely the bug that
                // produced uneditable "free day" filler.
                days: 0,
                status: 'draft',
              })
              .returning()
          : await tx.update(itineraries).set(values).where(eq(itineraries.id, id)).returning()

      if (!row) throw new Error(t('itineraries.err_save_failed'))

      await tx.delete(itineraryRegions).where(eq(itineraryRegions.itineraryId, row.id))
      if (regionIds.length > 0) {
        await tx
          .insert(itineraryRegions)
          .values(regionIds.map((regionId) => ({ itineraryId: row.id, regionId })))
      }

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'itinerary.create' : 'itinerary.update',
          entityType: 'itinerary',
          entityId: row.id,
          before,
          after: { ...row, regionIds },
        },
        tx,
      )

      return row.id
    })

    target = editor(savedId)
    outcome = { ok: t('itineraries.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(target, outcome))
}

/**
 * Publish, bumping the version.
 *
 * An order pins the version it bought, so a customer who purchased the
 * March plan keeps downloading the March PDF even after the plan is
 * restructured. That only works if every publish moves the number.
 */
export async function publishItinerary(id: string): Promise<void> {
  const session = await requireCapability('content.publish')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(itineraries).where(eq(itineraries.id, id)).limit(1)
      if (!before) throw new Error(t('itineraries.err_gone'))

      const days = await tx
        .select({
          id: itineraryDays.id,
          activityId: itineraryDays.activityId,
          isFreeDay: itineraryDays.isFreeDay,
        })
        .from(itineraryDays)
        .where(eq(itineraryDays.itineraryId, id))
        .orderBy(asc(itineraryDays.dayNumber))

      if (days.length === 0) {
        throw new Error(t('itineraries.err_publish_no_days'))
      }

      const unresolved = days.filter((day) => !day.activityId && !day.isFreeDay)
      if (unresolved.length > 0) {
        throw new Error(t('itineraries.err_publish_unresolved', { count: unresolved.length }))
      }

      // Phase 1 (spec §3.1/§9): no ready Arabic PDF — uploaded or generated — no publish.
      const arabic = await arabicPdfFacts(tx, before, days)
      if (publishBlock(arabic) === 'no_pdf') throw new Error(t('ip1.err_publish_no_pdf'))

      const [after] = await tx
        .update(itineraries)
        .set({
          status: 'published',
          publishedAt: before.publishedAt ?? new Date(),
          version: before.version + 1,
          days: days.length,
        })
        .where(eq(itineraries.id, id))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: 'itinerary.publish',
          entityType: 'itinerary',
          entityId: id,
          before,
          after: after ?? null,
        },
        tx,
      )
    })

    outcome = { ok: t('itineraries.ok_published') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(editor(id), outcome))
}

export async function unpublishItinerary(id: string): Promise<void> {
  const session = await requireCapability('content.publish')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(itineraries).where(eq(itineraries.id, id)).limit(1)
      if (!before) throw new Error(t('itineraries.err_gone'))

      const [after] = await tx
        .update(itineraries)
        .set({ status: 'draft' })
        .where(eq(itineraries.id, id))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: 'itinerary.unpublish',
          entityType: 'itinerary',
          entityId: id,
          before,
          after: after ?? null,
        },
        tx,
      )
    })

    outcome = { ok: t('itineraries.ok_drafted') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(editor(id), outcome))
}

export async function deleteItinerary(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(itineraries).where(eq(itineraries.id, id)).limit(1)
      if (!before) throw new Error(t('itineraries.err_gone'))

      await tx
        .update(itineraries)
        .set({ deletedAt: new Date(), status: 'draft' })
        .where(eq(itineraries.id, id))

      await writeAudit(
        {
          actor: session,
          action: 'itinerary.delete',
          entityType: 'itinerary',
          entityId: id,
          before,
          after: { deletedAt: new Date().toISOString(), status: 'draft' },
        },
        tx,
      )
    })

    outcome = { ok: t('itineraries.ok_archived') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

// ---------------------------------------------------------------------------
// Day plan
// ---------------------------------------------------------------------------

/**
 * Append a day.
 *
 * The prototype had no day table at all: it synthesized the plan by
 * assigning `acts[i]` to day `i`, so an 8-day itinerary with 5 linked
 * activities rendered three hard-coded "Free day to explore & relax" cards
 * that nobody could edit or translate. Days are authored here, one row each.
 */
export async function addItineraryDay(itineraryId: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    const activityId = fuuidOrNull(form, 'activityId', t('itineraries.day_activity'))
    const isFreeDay = fbool(form, 'isFreeDay')
    assertDayShape(activityId, isFreeDay, t)

    await db.transaction(async (tx) => {
      const [last] = await tx
        .select({ dayNumber: itineraryDays.dayNumber })
        .from(itineraryDays)
        .where(eq(itineraryDays.itineraryId, itineraryId))
        .orderBy(sql`${itineraryDays.dayNumber} desc`)
        .limit(1)

      const [row] = await tx
        .insert(itineraryDays)
        .values({
          itineraryId,
          dayNumber: (last?.dayNumber ?? 0) + 1,
          activityId,
          isFreeDay,
          title: null,
          description: null,
        })
        .returning()

      await syncDayCount(tx, itineraryId)

      await writeAudit(
        {
          actor: session,
          action: 'itinerary_day.create',
          entityType: 'itinerary_day',
          entityId: row?.id ?? null,
          before: null,
          after: row ?? null,
        },
        tx,
      )
    })

    outcome = { ok: t('itineraries.ok_day_added') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(editor(itineraryId), outcome))
}

export async function saveItineraryDay(
  itineraryId: string,
  dayId: string,
  form: FormData,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      await persistDay(tx, session, t, itineraryId, dayId, form)
    })
    outcome = { ok: t('itineraries.ok_day_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(editor(itineraryId), outcome))
}

/**
 * Move a day up or down, renumbering the whole plan.
 *
 * The day's own fields are saved first, so reordering never silently
 * discards edits the operator has already typed into that card.
 */
export async function moveItineraryDay(
  itineraryId: string,
  dayId: string,
  direction: 'up' | 'down',
  form: FormData,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      await persistDay(tx, session, t, itineraryId, dayId, form)

      const ordered = await tx
        .select({ id: itineraryDays.id })
        .from(itineraryDays)
        .where(eq(itineraryDays.itineraryId, itineraryId))
        .orderBy(asc(itineraryDays.dayNumber))

      const ids = ordered.map((row) => row.id)
      const index = ids.indexOf(dayId)
      if (index === -1) throw new Error(t('itineraries.err_day_gone'))

      const swapWith = direction === 'up' ? index - 1 : index + 1
      if (swapWith < 0 || swapWith >= ids.length) {
        throw new Error(
          t(direction === 'up' ? 'itineraries.err_day_at_start' : 'itineraries.err_day_at_end', {
            number: index + 1,
          }),
        )
      }

      const moved = ids[index]
      const other = ids[swapWith]
      if (!moved || !other) throw new Error(t('itineraries.err_reorder'))
      ids[index] = other
      ids[swapWith] = moved

      await renumberDays(tx, itineraryId, ids)

      await writeAudit(
        {
          actor: session,
          action: 'itinerary_day.reorder',
          entityType: 'itinerary',
          entityId: itineraryId,
          before: { order: ordered.map((row) => row.id) },
          after: { order: ids },
        },
        tx,
      )
    })

    outcome = { ok: t('itineraries.ok_day_moved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(editor(itineraryId), outcome))
}

export async function removeItineraryDay(itineraryId: string, dayId: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(itineraryDays)
        .where(and(eq(itineraryDays.id, dayId), eq(itineraryDays.itineraryId, itineraryId)))
        .limit(1)

      if (!before) throw new Error(t('itineraries.err_day_gone'))

      await tx.delete(itineraryDays).where(eq(itineraryDays.id, dayId))

      const remaining = await tx
        .select({ id: itineraryDays.id })
        .from(itineraryDays)
        .where(eq(itineraryDays.itineraryId, itineraryId))
        .orderBy(asc(itineraryDays.dayNumber))

      await renumberDays(
        tx,
        itineraryId,
        remaining.map((row) => row.id),
      )
      await syncDayCount(tx, itineraryId)

      await writeAudit(
        {
          actor: session,
          action: 'itinerary_day.delete',
          entityType: 'itinerary_day',
          entityId: dayId,
          before,
          after: null,
        },
        tx,
      )
    })

    outcome = { ok: t('itineraries.ok_day_removed') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(editor(itineraryId), outcome))
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type SessionArg = Awaited<ReturnType<typeof requireCapability>>

async function persistDay(
  tx: Tx,
  session: SessionArg,
  t: Translate,
  itineraryId: string,
  dayId: string,
  form: FormData,
): Promise<void> {
  const [before] = await tx
    .select()
    .from(itineraryDays)
    .where(and(eq(itineraryDays.id, dayId), eq(itineraryDays.itineraryId, itineraryId)))
    .limit(1)

  if (!before) throw new Error(t('itineraries.err_day_gone'))

  const activityId = fuuidOrNull(form, `activityId_${dayId}`, t('itineraries.day_activity'))
  const isFreeDay = fbool(form, `isFreeDay_${dayId}`)
  assertDayShape(activityId, isFreeDay, t)

  const [after] = await tx
    .update(itineraryDays)
    .set({
      activityId,
      isFreeDay,
      title: flocalizedOrNull(form, `title_${dayId}`),
      description: flocalizedOrNull(form, `description_${dayId}`),
      // Sale mode B: only a day with an activity can be booked.
      bookable: activityId !== null && fbool(form, `bookable_${dayId}`),
    })
    .where(eq(itineraryDays.id, dayId))
    .returning()

  await writeAudit(
    {
      actor: session,
      action: 'itinerary_day.update',
      entityType: 'itinerary_day',
      entityId: dayId,
      before,
      after: after ?? null,
    },
    tx,
  )
}

/**
 * A day is either an activity day or an explicitly-chosen free day.
 *
 * Rejecting the empty case is the whole point of this table: a day with
 * neither is the silent gap the renderer used to paper over with untranslated
 * filler copy.
 */
function assertDayShape(activityId: string | null, isFreeDay: boolean, t: Translate): void {
  if (isFreeDay && activityId) {
    throw new Error(t('itineraries.err_free_day_with_activity'))
  }
  if (!isFreeDay && !activityId) {
    throw new Error(t('itineraries.err_day_empty'))
  }
}

/**
 * Rewrite dayNumber to 1..n in the given order.
 *
 * Two passes, because (itinerary_id, day_number) is UNIQUE: assigning the
 * final numbers directly collides with the row that still holds the target
 * number. The first pass parks every row on a negative number, which no real
 * plan uses.
 */
async function renumberDays(tx: Tx, itineraryId: string, orderedIds: string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    await tx
      .update(itineraryDays)
      .set({ dayNumber: -(index + 1) })
      .where(and(eq(itineraryDays.id, id), eq(itineraryDays.itineraryId, itineraryId)))
  }
  for (const [index, id] of orderedIds.entries()) {
    await tx
      .update(itineraryDays)
      .set({ dayNumber: index + 1 })
      .where(and(eq(itineraryDays.id, id), eq(itineraryDays.itineraryId, itineraryId)))
  }
}

/** `itineraries.days` always equals the number of authored days. */
async function syncDayCount(tx: Tx, itineraryId: string): Promise<void> {
  const rows = await tx
    .select({ id: itineraryDays.id })
    .from(itineraryDays)
    .where(eq(itineraryDays.itineraryId, itineraryId))

  await tx.update(itineraries).set({ days: rows.length }).where(eq(itineraries.id, itineraryId))
}

// ---------------------------------------------------------------------------
// PDF مرفوع للجدول (الوثيقة 4.2: "ملف PDF مرتبط بالجدول"، لوحة التحكم: "رفع PDF")
// ---------------------------------------------------------------------------

/** يزيل الملف المرفوع للغة — يعود التسليم إلى الملف المولّد تلقائياً. */
export async function removeItineraryPdf(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const rawLocale = freq(form, 'locale', t('itineraries.pdf_language'))
    if (!(locales as readonly string[]).includes(rawLocale))
      throw new Error(t('itineraries.err_pdf_unknown_language'))
    const [before] = await db.select().from(itineraries).where(eq(itineraries.id, id)).limit(1)
    if (!before) throw new Error(t('itineraries.err_gone'))
    const keys = { ...(before.uploadedPdfKeys ?? {}) }
    delete keys[rawLocale]
    await db.transaction(async (tx) => {
      await tx
        .update(itineraries)
        .set({ uploadedPdfKeys: Object.keys(keys).length > 0 ? keys : null })
        .where(eq(itineraries.id, id))
      // Phase 1: the versions stay archived; none is current any more.
      await tx
        .update(itineraryDocuments)
        .set({ isCurrent: false })
        .where(
          and(
            eq(itineraryDocuments.itineraryId, id),
            eq(itineraryDocuments.locale, rawLocale),
            eq(itineraryDocuments.source, 'uploaded'),
          ),
        )
    })
    await writeAudit({
      actor: session,
      action: 'itinerary.pdf_remove',
      entityType: 'itinerary',
      entityId: id,
      before: { uploadedPdfKeys: before.uploadedPdfKeys },
      after: { uploadedPdfKeys: keys },
    })
    outcome = { ok: t('itineraries.ok_pdf_removed') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(id), outcome))
}

// ---------------------------------------------------------------------------
// Phase 3: places on each day
// ---------------------------------------------------------------------------

const MAX_DAY_PLACES = 30

export interface DayPlaceInput {
  placeId: string
  note: Record<string, string>
  visitTime: string
}

/**
 * Replace one day's places with the ordered list from the editor. Called from
 * a Client Component, so it returns a result instead of redirecting.
 */
export async function saveDayPlaces(
  itineraryId: string,
  dayId: string,
  input: DayPlaceInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  try {
    if (!isUuid(itineraryId) || !isUuid(dayId)) throw new Error(t('itineraries.err_day_gone'))
    if (!Array.isArray(input)) throw new Error(t('p3.save_failed'))
    if (input.length > MAX_DAY_PLACES) {
      throw new Error(t('p3.err_too_many_places', { max: MAX_DAY_PLACES }))
    }
    const seen = new Set<string>()
    const rows = input.map((entry, index) => {
      const placeId = typeof entry?.placeId === 'string' ? entry.placeId : ''
      if (!isUuid(placeId)) throw new Error(t('p3.save_failed'))
      if (seen.has(placeId)) throw new Error(t('p3.err_place_twice'))
      seen.add(placeId)
      const note: Record<string, string> = {}
      let hasNote = false
      for (const locale of locales) {
        const text = typeof entry.note?.[locale] === 'string' ? entry.note[locale].trim() : ''
        note[locale] = text.slice(0, 280)
        if (text !== '') hasNote = true
      }
      const rawTime = typeof entry.visitTime === 'string' ? entry.visitTime.trim() : ''
      const visitTime = rawTime === '' ? null : normaliseVisitTime(rawTime)
      if (rawTime !== '' && visitTime === null) throw new Error(t('p3.err_time'))
      return {
        dayId,
        placeId,
        sortOrder: index,
        note: hasNote ? (note as Record<Locale, string>) : null,
        visitTime,
      }
    })

    await db.transaction(async (tx) => {
      const [day] = await tx
        .select({ id: itineraryDays.id })
        .from(itineraryDays)
        .where(and(eq(itineraryDays.id, dayId), eq(itineraryDays.itineraryId, itineraryId)))
        .limit(1)
      if (!day) throw new Error(t('itineraries.err_day_gone'))
      if (rows.length > 0) {
        const known = await tx
          .select({ id: mapPlaces.id })
          .from(mapPlaces)
          .where(
            and(
              inArray(
                mapPlaces.id,
                rows.map((row) => row.placeId),
              ),
              isNull(mapPlaces.deletedAt),
            ),
          )
        if (known.length !== rows.length) throw new Error(t('p3.place_gone'))
      }
      const before = await tx
        .select({ placeId: itineraryDayPlaces.placeId })
        .from(itineraryDayPlaces)
        .where(eq(itineraryDayPlaces.dayId, dayId))
        .orderBy(asc(itineraryDayPlaces.sortOrder))
      await tx.delete(itineraryDayPlaces).where(eq(itineraryDayPlaces.dayId, dayId))
      if (rows.length > 0) await tx.insert(itineraryDayPlaces).values(rows)
      await writeAudit(
        {
          actor: session,
          action: 'itinerary_day.places',
          entityType: 'itinerary_day',
          entityId: dayId,
          before: { places: before.map((row) => row.placeId) },
          after: { places: rows.map((row) => row.placeId) },
        },
        tx,
      )
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

// ---------------------------------------------------------------------------
// Phase 3: packages this itinerary is sold inside (sale mode C)
// ---------------------------------------------------------------------------

export async function addItineraryPackageLink(itineraryId: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const packageId = fuuidOrNull(form, 'packageId', t('p3.link_package'))
    if (packageId === null) throw new Error(t('p3.err_pick_package'))
    const priceRule = fenum(form, 'priceRule', PACKAGE_PRICE_RULES, 'included')
    // The price rule decides what the customer pays for this itinerary inside
    // the package: without `prices.write` a new link keeps the default.
    assertPriceChangeAllowed(
      session.role,
      { priceRule: 'included' },
      { priceRule },
      ['priceRule'],
      t('team.err_prices'),
    )
    await db.transaction(async (tx) => {
      const [pkg] = await tx
        .select({ id: packages.id })
        .from(packages)
        .where(and(eq(packages.id, packageId), isNull(packages.deletedAt)))
        .limit(1)
      if (!pkg) throw new Error(t('packages.err_gone'))
      const existing = await tx
        .select({ packageId: itineraryPackageLinks.packageId })
        .from(itineraryPackageLinks)
        .where(eq(itineraryPackageLinks.itineraryId, itineraryId))
      if (existing.some((row) => row.packageId === packageId)) {
        throw new Error(t('p3.err_link_exists'))
      }
      await tx.insert(itineraryPackageLinks).values({
        itineraryId,
        packageId,
        priceRule,
        isDefault: existing.length === 0,
        sortOrder: existing.length,
      })
      await writeAudit(
        {
          actor: session,
          action: 'itinerary.package_link',
          entityType: 'itinerary',
          entityId: itineraryId,
          before: null,
          after: { packageId, priceRule },
        },
        tx,
      )
    })
    outcome = { ok: t('p3.ok_link_added') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(itineraryId), outcome))
}

export async function saveItineraryPackageLink(
  itineraryId: string,
  packageId: string,
  form: FormData,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const priceRule = fenum(form, 'priceRule', PACKAGE_PRICE_RULES, 'included')
    const isDefault = fbool(form, 'isDefault')
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ priceRule: itineraryPackageLinks.priceRule })
        .from(itineraryPackageLinks)
        .where(
          and(
            eq(itineraryPackageLinks.itineraryId, itineraryId),
            eq(itineraryPackageLinks.packageId, packageId),
          ),
        )
        .limit(1)
      if (!current) throw new Error(t('p3.err_link_gone'))
      // Without `prices.write` the price rule must come back as stored.
      assertPriceChangeAllowed(
        session.role,
        { priceRule: current.priceRule },
        { priceRule },
        ['priceRule'],
        t('team.err_prices'),
      )
      if (isDefault) {
        await tx
          .update(itineraryPackageLinks)
          .set({ isDefault: false })
          .where(eq(itineraryPackageLinks.itineraryId, itineraryId))
      }
      const changed = await tx
        .update(itineraryPackageLinks)
        .set({ priceRule, isDefault })
        .where(
          and(
            eq(itineraryPackageLinks.itineraryId, itineraryId),
            eq(itineraryPackageLinks.packageId, packageId),
          ),
        )
        .returning({ packageId: itineraryPackageLinks.packageId })
      if (changed.length === 0) throw new Error(t('p3.err_link_gone'))
      await writeAudit(
        {
          actor: session,
          action: 'itinerary.package_link_update',
          entityType: 'itinerary',
          entityId: itineraryId,
          before: { packageId, priceRule: current.priceRule },
          after: { packageId, priceRule, isDefault },
        },
        tx,
      )
    })
    outcome = { ok: t('p3.ok_link_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(itineraryId), outcome))
}

export async function removeItineraryPackageLink(
  itineraryId: string,
  packageId: string,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(itineraryPackageLinks)
        .where(
          and(
            eq(itineraryPackageLinks.itineraryId, itineraryId),
            eq(itineraryPackageLinks.packageId, packageId),
          ),
        )
      await writeAudit(
        {
          actor: session,
          action: 'itinerary.package_unlink',
          entityType: 'itinerary',
          entityId: itineraryId,
          before: { packageId },
          after: null,
        },
        tx,
      )
    })
    outcome = { ok: t('p3.ok_link_removed') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(itineraryId), outcome))
}

/** New order of the linked packages (ids, first = shown first). */
export async function reorderItineraryPackageLinks(
  itineraryId: string,
  packageIds: string[],
): Promise<boolean> {
  const session = await requireCapability('content.write')
  if (!isUuid(itineraryId) || !Array.isArray(packageIds)) return false
  const ids = packageIds.filter((id) => typeof id === 'string' && isUuid(id))
  try {
    await db.transaction(async (tx) => {
      for (const [index, packageId] of ids.entries()) {
        await tx
          .update(itineraryPackageLinks)
          .set({ sortOrder: index })
          .where(
            and(
              eq(itineraryPackageLinks.itineraryId, itineraryId),
              eq(itineraryPackageLinks.packageId, packageId),
            ),
          )
      }
      await writeAudit(
        {
          actor: session,
          action: 'itinerary.package_reorder',
          entityType: 'itinerary',
          entityId: itineraryId,
          before: null,
          after: { order: ids },
        },
        tx,
      )
    })
    return true
  } catch {
    return false
  }
}
