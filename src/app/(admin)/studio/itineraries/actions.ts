'use server'

import { and, asc, eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { itineraries, itineraryDays, itineraryRegions } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit, type Tx } from '../../_lib/audit'
import {
  fbool,
  fcurrency,
  fintOrNull,
  flocalizedList,
  flocalizedOrNull,
  flocalizedRequired,
  fminor,
  fmulti,
  freq,
  fstr,
  fuuidOrNull,
} from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { assertSlug } from '../../_lib/slug'

const LIST = adminHref('/itineraries')
const editor = (id: string) => adminHref(`/itineraries/${id}`)

type Outcome = { ok: string } | { err: string }

// ---------------------------------------------------------------------------
// Itinerary core
// ---------------------------------------------------------------------------

export async function saveItinerary(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')

  let target = id === 'new' ? LIST : editor(id)
  let outcome: Outcome

  try {
    const values = {
      slug: assertSlug(freq(form, 'slug', 'Slug')),
      legacyId: fstr(form, 'legacyId'),
      name: flocalizedRequired(form, 'name', 'Name'),
      blurb: flocalizedOrNull(form, 'blurb'),
      spots: fintOrNull(form, 'spots', 'Spots'),
      tripType: flocalizedOrNull(form, 'tripType'),
      audience: flocalizedList(form, 'audience'),
      priceMinor: fminor(form, 'priceMinor', 'Price'),
      currency: fcurrency(form, 'currency'),
      heroImageId: fuuidOrNull(form, 'heroImageId', 'Hero image'),
    }

    const regionIds = fmulti(form, 'regionIds')

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(itineraries).where(eq(itineraries.id, id)).limit(1))[0] ??
            null)

      if (id !== 'new' && !before) throw new Error('That itinerary no longer exists')

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

      if (!row) throw new Error('Save failed')

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
    outcome = { ok: 'Itinerary saved.' }
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
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(itineraries).where(eq(itineraries.id, id)).limit(1)
      if (!before) throw new Error('That itinerary no longer exists')

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
        throw new Error(
          'Add at least one day before publishing. An itinerary with no plan is not a product.',
        )
      }

      const unresolved = days.filter((day) => !day.activityId && !day.isFreeDay)
      if (unresolved.length > 0) {
        throw new Error(
          `${unresolved.length} day(s) have neither an activity nor an explicit free-day flag. Resolve them before publishing.`,
        )
      }

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

    outcome = { ok: 'Published. Version bumped — orders pin the version they bought.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(editor(id), outcome))
}

export async function unpublishItinerary(id: string): Promise<void> {
  const session = await requireCapability('content.publish')
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(itineraries).where(eq(itineraries.id, id)).limit(1)
      if (!before) throw new Error('That itinerary no longer exists')

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

    outcome = { ok: 'Moved to draft. The version was not changed.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(editor(id), outcome))
}

export async function deleteItinerary(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(itineraries).where(eq(itineraries.id, id)).limit(1)
      if (!before) throw new Error('That itinerary no longer exists')

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

    outcome = { ok: 'Itinerary archived.' }
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
  let outcome: Outcome

  try {
    const activityId = fuuidOrNull(form, 'activityId', 'Activity')
    const isFreeDay = fbool(form, 'isFreeDay')
    assertDayShape(activityId, isFreeDay)

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

    outcome = { ok: 'Day added.' }
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
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      await persistDay(tx, session, itineraryId, dayId, form)
    })
    outcome = { ok: 'Day saved.' }
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
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      await persistDay(tx, session, itineraryId, dayId, form)

      const ordered = await tx
        .select({ id: itineraryDays.id })
        .from(itineraryDays)
        .where(eq(itineraryDays.itineraryId, itineraryId))
        .orderBy(asc(itineraryDays.dayNumber))

      const ids = ordered.map((row) => row.id)
      const index = ids.indexOf(dayId)
      if (index === -1) throw new Error('That day no longer exists')

      const swapWith = direction === 'up' ? index - 1 : index + 1
      if (swapWith < 0 || swapWith >= ids.length) {
        throw new Error(
          `Day ${index + 1} is already at the ${direction === 'up' ? 'start' : 'end'}`,
        )
      }

      const moved = ids[index]
      const other = ids[swapWith]
      if (!moved || !other) throw new Error('Could not reorder the plan')
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

    outcome = { ok: 'Day moved. The plan was renumbered.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(editor(itineraryId), outcome))
}

export async function removeItineraryDay(itineraryId: string, dayId: string): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(itineraryDays)
        .where(and(eq(itineraryDays.id, dayId), eq(itineraryDays.itineraryId, itineraryId)))
        .limit(1)

      if (!before) throw new Error('That day no longer exists')

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

    outcome = { ok: 'Day removed. The plan was renumbered.' }
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
  itineraryId: string,
  dayId: string,
  form: FormData,
): Promise<void> {
  const [before] = await tx
    .select()
    .from(itineraryDays)
    .where(and(eq(itineraryDays.id, dayId), eq(itineraryDays.itineraryId, itineraryId)))
    .limit(1)

  if (!before) throw new Error('That day no longer exists')

  const activityId = fuuidOrNull(form, `activityId_${dayId}`, 'Activity')
  const isFreeDay = fbool(form, `isFreeDay_${dayId}`)
  assertDayShape(activityId, isFreeDay)

  const [after] = await tx
    .update(itineraryDays)
    .set({
      activityId,
      isFreeDay,
      title: flocalizedOrNull(form, `title_${dayId}`),
      description: flocalizedOrNull(form, `description_${dayId}`),
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
function assertDayShape(activityId: string | null, isFreeDay: boolean): void {
  if (isFreeDay && activityId) {
    throw new Error('A free day cannot also have an activity attached. Choose one.')
  }
  if (!isFreeDay && !activityId) {
    throw new Error(
      'Attach an activity or tick "free day". A day with neither would render as an untranslated placeholder.',
    )
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
