'use server'

/**
 * Studio itinerary editor (Nov 2026, owner: «كل التخصيصات في الداشبورد»):
 * the «محتوى الصفحة» and «الأسئلة الشائعة» tabs, duplicate, hide / show.
 * Delete lives in `./actions` (`deleteItinerary`), guarded by
 * `assertNoBuyers` below. Every write is audited.
 */

import { and, eq, inArray, isNull, like } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { itineraries, itineraryDayPlaces, itineraryDays, itineraryRegions } from '@/db/schema'
import { MAX_AREAS, normaliseAreas } from '@/lib/itineraries/areas'
import { normalisePageContent } from '@/lib/itineraries/page-content'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fbool, ffaqRows, fstr } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

type Outcome = { ok: string } | { err: string }

const LIST = adminHref('/itineraries')
const editor = (id: string, tab?: string) =>
  adminHref(`/itineraries/${id}${tab ? `?tab=${tab}` : ''}`)

/** Parse the JSON the «محتوى الصفحة» editor posts; a broken post is refused. */
export async function parsePageContentPost(form: FormData): Promise<Record<string, unknown>> {
  const raw = fstr(form, 'pageContent__json')
  if (raw === null) throw new Error('missing')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('json')
  }
  const content = normalisePageContent(parsed)
  return { ...content }
}

export async function savePageContent(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const [before] = await db
      .select({ id: itineraries.id, pageContent: itineraries.pageContent })
      .from(itineraries)
      .where(and(eq(itineraries.id, id), isNull(itineraries.deletedAt)))
      .limit(1)
    if (!before) throw new Error(t('itineraries.err_gone'))
    let pageContent: Record<string, unknown>
    try {
      pageContent = await parsePageContentPost(form)
    } catch {
      throw new Error(t('ie.err_content_post'))
    }
    await db.update(itineraries).set({ pageContent }).where(eq(itineraries.id, id))
    await writeAudit({
      actor: session,
      action: 'itinerary.page_content',
      entityType: 'itinerary',
      entityId: id,
      before: { pageContent: before.pageContent },
      after: { pageContent },
    })
    outcome = { ok: t('ie.ok_content') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(id, 'content'), outcome))
}

export async function saveItineraryFaq(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const [before] = await db
      .select({ id: itineraries.id, faq: itineraries.faq })
      .from(itineraries)
      .where(and(eq(itineraries.id, id), isNull(itineraries.deletedAt)))
      .limit(1)
    if (!before) throw new Error(t('itineraries.err_gone'))
    const rows = ffaqRows(form, 'faq', []).map(({ q, a, hidden }) =>
      hidden ? { q, a, hidden } : { q, a },
    )
    const faq = rows.length > 0 ? rows : null
    await db.update(itineraries).set({ faq }).where(eq(itineraries.id, id))
    await writeAudit({
      actor: session,
      action: 'itinerary.faq',
      entityType: 'itinerary',
      entityId: id,
      before: { faq: before.faq },
      after: { faq },
    })
    outcome = { ok: t('ie.ok_faq', { count: rows.length }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(id, 'faq'), outcome))
}

/**
 * «المناطق» (owner, Nov 2026): the ordered areas the trip covers, with
 * nights, and whether the public page shows the nights (off by default).
 * Rows `area{i}Key` / `area{i}Nights`, top to bottom; a blank key is skipped.
 */
export async function saveItineraryAreas(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const [before] = await db
      .select({ id: itineraries.id, areas: itineraries.areas })
      .from(itineraries)
      .where(and(eq(itineraries.id, id), isNull(itineraries.deletedAt)))
      .limit(1)
    if (!before) throw new Error(t('itineraries.err_gone'))
    const cleaned = normaliseAreas({
      showNights: fbool(form, 'areasShowNights'),
      items: Array.from({ length: MAX_AREAS }, (_, i) => ({
        key: fstr(form, `area${i}Key`) ?? '',
        nights: fstr(form, `area${i}Nights`),
      })),
    })
    const areas = cleaned.items.length > 0 || cleaned.showNights ? cleaned : null
    await db.update(itineraries).set({ areas }).where(eq(itineraries.id, id))
    await writeAudit({
      actor: session,
      action: 'itinerary.areas',
      entityType: 'itinerary',
      entityId: id,
      before: { areas: before.areas },
      after: { areas },
    })
    outcome = { ok: t('ie.ok_areas', { count: cleaned.items.length }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(id, 'content'), outcome))
}

/** A free slug: `<slug>-copy`, then `-copy-2`, `-copy-3`… */
export async function freeCopySlug(slug: string): Promise<string> {
  const base = `${slug.slice(0, 110)}-copy`
  const taken = new Set(
    (
      await db
        .select({ slug: itineraries.slug })
        .from(itineraries)
        .where(like(itineraries.slug, `${base}%`))
    ).map((row) => row.slug),
  )
  if (!taken.has(base)) return base
  for (let n = 2; n < 1000; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
  return `${base}-${Date.now()}`
}

/**
 * Copy an itinerary as a new draft: copy, days, day places and regions.
 * Not copied: the uploaded PDFs (a file belongs to its itinerary), the
 * version (starts at 1) and the sales.
 */
export async function duplicateItinerary(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let target = LIST
  let outcome: Outcome
  try {
    const [source] = await db
      .select()
      .from(itineraries)
      .where(and(eq(itineraries.id, id), isNull(itineraries.deletedAt)))
      .limit(1)
    if (!source) throw new Error(t('itineraries.err_gone'))
    const slug = await freeCopySlug(source.slug)
    const copyId = await db.transaction(async (tx) => {
      const {
        id: _id,
        createdAt: _c,
        updatedAt: _u,
        deletedAt: _d,
        publishedAt: _p,
        legacyId: _l,
        ...rest
      } = source
      const suffix = { ar: ' (نسخة)', en: ' (copy)', id: ' (salinan)' } as Record<string, string>
      const name = Object.fromEntries(
        Object.entries(source.name ?? {}).map(([locale, text]) => [
          locale,
          text ? `${text}${suffix[locale] ?? ' (copy)'}` : text,
        ]),
      ) as typeof source.name
      const [row] = await tx
        .insert(itineraries)
        .values({
          ...rest,
          slug,
          name,
          status: 'draft',
          version: 1,
          uploadedPdfKeys: null,
        })
        .returning({ id: itineraries.id })
      if (!row) throw new Error(t('itineraries.err_save_failed'))

      const days = await tx.select().from(itineraryDays).where(eq(itineraryDays.itineraryId, id))
      const dayMap = new Map<string, string>()
      for (const day of days) {
        const { id: dayId, itineraryId: _i, ...dayRest } = day
        const [copy] = await tx
          .insert(itineraryDays)
          .values({ ...dayRest, itineraryId: row.id })
          .returning({ id: itineraryDays.id })
        if (copy) dayMap.set(dayId, copy.id)
      }
      if (dayMap.size > 0) {
        const stops = await tx
          .select()
          .from(itineraryDayPlaces)
          .where(inArray(itineraryDayPlaces.dayId, [...dayMap.keys()]))
        for (const stop of stops) {
          const { id: _s, dayId, createdAt: _sc, updatedAt: _su, ...stopRest } = stop
          const newDay = dayMap.get(dayId)
          if (newDay) await tx.insert(itineraryDayPlaces).values({ ...stopRest, dayId: newDay })
        }
      }
      const regions = await tx
        .select({ regionId: itineraryRegions.regionId })
        .from(itineraryRegions)
        .where(eq(itineraryRegions.itineraryId, id))
      if (regions.length > 0) {
        await tx
          .insert(itineraryRegions)
          .values(regions.map((region) => ({ itineraryId: row.id, regionId: region.regionId })))
      }
      await writeAudit(
        {
          actor: session,
          action: 'itinerary.duplicate',
          entityType: 'itinerary',
          entityId: row.id,
          before: { sourceId: id },
          after: { slug, days: days.length },
        },
        tx,
      )
      return row.id
    })
    target = editor(copyId)
    outcome = { ok: t('ie.ok_duplicated') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}

/**
 * «إخفاء»: off the public site and the list, but every buyer keeps their
 * files, pages and activities (buyer access never reads the status).
 */
export async function setItineraryVisibility(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.publish')
  const { t } = await getAdminI18n()
  const hide = fstr(form, 'visibility') === 'hidden'
  const back = fstr(form, 'back') === 'list' ? LIST : editor(id)
  let outcome: Outcome
  try {
    const [before] = await db
      .select({ status: itineraries.status, publishedAt: itineraries.publishedAt })
      .from(itineraries)
      .where(and(eq(itineraries.id, id), isNull(itineraries.deletedAt)))
      .limit(1)
    if (!before) throw new Error(t('itineraries.err_gone'))
    // Showing again needs a version published before (else: «نشر»).
    if (!hide && before.publishedAt === null) throw new Error(t('ie.err_show_unpublished'))
    const status = hide ? 'hidden' : 'published'
    await db.update(itineraries).set({ status }).where(eq(itineraries.id, id))
    await writeAudit({
      actor: session,
      action: hide ? 'itinerary.hide' : 'itinerary.show',
      entityType: 'itinerary',
      entityId: id,
      before: { status: before.status },
      after: { status },
    })
    outcome = { ok: hide ? t('ie.ok_hidden') : t('ie.ok_shown') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(back, outcome))
}
