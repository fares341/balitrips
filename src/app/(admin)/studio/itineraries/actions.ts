'use server'

import { randomUUID } from 'node:crypto'

import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import {
  itineraries,
  itineraryDays,
  itineraryRegions,
  orderItems,
  orders,
  users,
} from '@/db/schema'
import { defaultLocale, locales, isLocale, type Locale } from '@/i18n/config'
import { pick } from '@/lib/content/localize'
import { notifyUsers } from '@/lib/notify'
import { isPrivateStorageAvailable, uploadPrivate } from '@/lib/storage'

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

// ---------------------------------------------------------------------------
// Itinerary core
// ---------------------------------------------------------------------------

export async function saveItinerary(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()

  let target = id === 'new' ? LIST : editor(id)
  let outcome: Outcome

  try {
    const values = {
      slug: assertSlug(freq(form, 'slug', t('itineraries.f_slug'))),
      legacyId: fstr(form, 'legacyId'),
      name: flocalizedRequired(form, 'name', t('itineraries.f_name')),
      blurb: flocalizedOrNull(form, 'blurb'),
      spots: fintOrNull(form, 'spots', t('itineraries.f_spots')),
      tripType: flocalizedOrNull(form, 'tripType'),
      audience: flocalizedList(form, 'audience'),
      priceMinor: fminor(form, 'priceMinor', t('common.price')),
      currency: fcurrency(form, 'currency'),
      heroImageId: fuuidOrNull(form, 'heroImageId', t('itineraries.hero_image')),
      // الوثيقة 4.2
      detailedDescription: flocalizedOrNull(form, 'detailedDescription'),
      includesMap: fbool(form, 'includesMap'),
      isVip: fbool(form, 'isVip'),
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

// أقل من حد جسم Server Action (25mb في next.config) مع هامش لترميز multipart.
const MAX_ITINERARY_PDF_BYTES = 24 * 1024 * 1024

function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
}

/**
 * يرفع PDF جاهزاً لهذا الجدول بلغة معيّنة إلى التخزين الخاص. يُسلَّم للعملاء
 * بدل الملف المولّد تلقائياً، وبنفس الحماية (علامة مائية، عارض، سجل).
 */
export async function uploadItineraryPdf(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const rawLocale = freq(form, 'locale', t('itineraries.pdf_language'))
    if (!isLocale(rawLocale)) throw new Error(t('itineraries.err_pdf_language'))
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0)
      throw new Error(t('itineraries.err_pdf_missing'))
    if (file.size > MAX_ITINERARY_PDF_BYTES) throw new Error(t('itineraries.err_pdf_too_large'))
    if (!isPrivateStorageAvailable() && process.env.NODE_ENV === 'production') {
      throw new Error(t('itineraries.err_pdf_storage'))
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!looksLikePdf(bytes)) throw new Error(t('itineraries.err_pdf_not_pdf'))

    const [before] = await db.select().from(itineraries).where(eq(itineraries.id, id)).limit(1)
    if (!before) throw new Error(t('itineraries.err_gone'))

    // مفتاح لا يُخمَّن: الملف الأصلي لا يُكشف أبداً (يُسلَّم مختوماً عبر الحساب).
    const objectKey = `itineraries/${id}/uploaded/${rawLocale}-${randomUUID()}.pdf`
    if (isPrivateStorageAvailable()) {
      await uploadPrivate({ key: objectKey, body: bytes, contentType: 'application/pdf' })
    } else {
      // تطوير محلي فقط (الإنتاج بلا تخزين مرفوض أعلاه)، كما في الجداول المخصصة.
      const { mkdir, writeFile } = await import('node:fs/promises')
      const path = await import('node:path')
      const target = path.join(process.cwd(), 'public', objectKey)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, bytes)
    }

    const keys = { ...(before.uploadedPdfKeys ?? {}), [rawLocale]: objectKey }
    await db.update(itineraries).set({ uploadedPdfKeys: keys }).where(eq(itineraries.id, id))
    await writeAudit({
      actor: session,
      action: 'itinerary.pdf_upload',
      entityType: 'itinerary',
      entityId: id,
      before: { uploadedPdfKeys: before.uploadedPdfKeys },
      after: { uploadedPdfKeys: keys, bytes: bytes.byteLength },
    })
    const notified = await notifyItineraryHolders(before, rawLocale, keys)
    outcome = {
      ok:
        t('itineraries.ok_pdf_uploaded', { locale: t(`translations.lang_${rawLocale}`) }) +
        (notified > 0 ? ` ${t('itineraries.ok_pdf_notified', { count: notified })}` : ''),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(id), outcome))
}

/**
 * بعد رفع ملف جديد: إشعار `itinerary_pdf_updated` (داخل الموقع + بريد) لكل من
 * يملك هذا الجدول (بند مسدَّد غير مسترد/ملغى) ويستلم ملف هذه اللغة — لغته هي
 * لغة الملف، أو ملف اللغة الافتراضية ولا ملف مرفوع للغته. إدراج جماعي بلغة كل
 * مجموعة. لا يرمي: فشل الإشعار لا يُفشل الرفع.
 */
async function notifyItineraryHolders(
  itinerary: typeof itineraries.$inferSelect,
  uploadedLocale: Locale,
  keys: Partial<Record<string, string>>,
): Promise<number> {
  try {
    const receives = locales.filter(
      (locale) => locale === uploadedLocale || (uploadedLocale === defaultLocale && !keys[locale]),
    )
    const holders = await db
      .selectDistinct({ userId: orders.userId, locale: users.locale })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(users, eq(users.id, orders.userId))
      .where(
        and(
          eq(orderItems.refId, itinerary.id),
          eq(orderItems.kind, 'itinerary'),
          inArray(orders.status, ['paid', 'confirmed', 'partially_refunded']),
          notInArray(orderItems.fulfilmentStatus, ['refunded', 'cancelled']),
          isNull(users.deletedAt),
        ),
      )
    const byLocale = new Map<Locale, string[]>()
    for (const holder of holders) {
      if (!holder.userId) continue
      const locale = isLocale(holder.locale) ? holder.locale : defaultLocale
      if (!receives.includes(locale)) continue
      byLocale.set(locale, [...(byLocale.get(locale) ?? []), holder.userId])
    }
    let total = 0
    for (const [locale, userIds] of byLocale) {
      total += await notifyUsers(
        userIds,
        'itinerary_pdf_updated',
        { name: pick(itinerary.name, locale, itinerary.slug) },
        '/account/schedules',
      )
    }
    return total
  } catch (error) {
    console.error('[itineraries] holder notification failed', { id: itinerary.id, error })
    return 0
  }
}

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
    await db
      .update(itineraries)
      .set({ uploadedPdfKeys: Object.keys(keys).length > 0 ? keys : null })
      .where(eq(itineraries.id, id))
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
