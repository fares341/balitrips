'use server'

/**
 * Itineraries phase 1 — Studio actions (corrected spec §3.1 / §5).
 *
 *  - the public-page preview: preview stats, gallery captions and order,
 *    visible teaser days, «الأكثر طلبًا», SEO;
 *  - day teasers (the only per-day fields the public page may show);
 *  - versioned PDF uploads per locale (MIME + `%PDF-`, size from settings,
 *    archive instead of delete, download filename, «notify buyers» toggle);
 *  - the `itinerarySales` (pricing) and `driver` settings, and per-vehicle
 *    driver fields on `driver_vehicles`.
 */

import { and, eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { itineraries, itineraryDays, itineraryDocuments, siteSettings } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import {
  DRIVER_SETTINGS_KEY,
  ISO_DATE,
  ITINERARY_SALES_KEY,
  driverSettingsSchema,
  itinerarySalesSchema,
} from '@/lib/itineraries/sales-settings'
import { readItinerarySales } from '@/lib/itineraries/sales-settings-store'
import { parseMoneyInput } from '@/lib/money-input'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fbool,
  ffaqRows,
  flocalized,
  flocalizedOrNull,
  fmulti,
  FormError,
  fstr,
  isUuid,
} from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { uploadPdfCore } from './pdf-upload'
import { PREVIEW_STAT_ROWS } from './phase1-shared'

type Outcome = { ok: string } | { err: string }

const editor = (id: string, tab?: string) =>
  adminHref(`/itineraries/${id}${tab ? `?tab=${tab}` : ''}`)
const PRICING = adminHref('/itineraries/pricing')
const DRIVER = adminHref('/vehicles')

function intIn(form: FormData, name: string, min: number, max: number, fallback: number): number {
  const raw = fstr(form, name)
  if (raw === null) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max)
    throw new FormError(`${name}: ${min}–${max}`, 'err.between', {
      field: `i18n:field.${name}`,
      min,
      max,
    })
  return n
}

// ---------------------------------------------------------------------------
// «فعاليات جدولي» (phase 3): the itinerary's own «كل الفعاليات» percent
// ---------------------------------------------------------------------------

export async function saveBuyerPageSettings(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const [before] = await db.select().from(itineraries).where(eq(itineraries.id, id)).limit(1)
    if (!before) throw new Error(t('itineraries.err_gone'))
    const raw = fstr(form, 'bundleDiscountPct')
    const values = {
      bundleDiscountPct: raw === null ? null : intIn(form, 'bundleDiscountPct', 0, 90, 0),
    }
    await db.update(itineraries).set(values).where(eq(itineraries.id, id))
    await writeAudit({
      actor: session,
      action: 'itinerary.buyer_page',
      entityType: 'itinerary',
      entityId: id,
      before,
      after: { ...before, ...values },
    })
    outcome = { ok: t('ip1.ok_buyer') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(id, 'pricing'), outcome))
}

// ---------------------------------------------------------------------------
// Public page preview
// ---------------------------------------------------------------------------

export async function saveItineraryPreview(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const [before] = await db.select().from(itineraries).where(eq(itineraries.id, id)).limit(1)
    if (!before) throw new Error(t('itineraries.err_gone'))

    const previewStats = Array.from({ length: PREVIEW_STAT_ROWS }, (_, i) => ({
      icon: (fstr(form, `stat${i}Icon`) ?? '').slice(0, 32),
      value: (fstr(form, `stat${i}Value`) ?? '').slice(0, 24),
      label: flocalized(form, `stat${i}Label`),
    })).filter((row) => row.value !== '' || Object.values(row.label).some((v) => v !== ''))

    // Gallery: captions and order for the images already in the gallery.
    const gallery = before.galleryImageIds ?? []
    const order = new Map(
      gallery.map((mediaId, index) => {
        const raw = Number(fstr(form, `ord_${mediaId}`))
        return [mediaId, Number.isFinite(raw) ? raw : index + 1] as const
      }),
    )
    const galleryImageIds = [...gallery].sort(
      (a, b) =>
        (order.get(a) ?? 0) - (order.get(b) ?? 0) || gallery.indexOf(a) - gallery.indexOf(b),
    )
    const galleryCaptions: Record<string, Partial<Record<string, string>>> = {}
    for (const mediaId of gallery) {
      const caption = flocalizedOrNull(form, `cap_${mediaId}`)
      if (caption) galleryCaptions[mediaId] = caption
    }

    // No packages here: a question belongs to the whole itinerary.
    const faqRows = ffaqRows(form, 'faq', []).map(({ q, a, hidden }) =>
      hidden ? { q, a, hidden } : { q, a },
    )

    const values = {
      previewStats: previewStats.length > 0 ? previewStats : null,
      galleryImageIds,
      galleryCaptions: Object.keys(galleryCaptions).length > 0 ? galleryCaptions : null,
      teaserDaysVisible: intIn(form, 'teaserDaysVisible', 0, 30, 3),
      isPopular: fbool(form, 'isPopular'),
      seoTitle: flocalizedOrNull(form, 'seoTitle'),
      seoDescription: flocalizedOrNull(form, 'seoDescription'),
      // The editor's «الأسئلة الشائعة» tab saves the FAQ on its own form.
      ...(form.has('faq__json') ? { faq: faqRows.length > 0 ? faqRows : null } : {}),
    }
    await db.update(itineraries).set(values).where(eq(itineraries.id, id))
    await writeAudit({
      actor: session,
      action: 'itinerary.preview',
      entityType: 'itinerary',
      entityId: id,
      before,
      after: { ...before, ...values },
    })
    outcome = { ok: t('ip1.ok_preview') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(id, 'content'), outcome))
}

export async function saveDayTeasers(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const days = await db
      .select({ id: itineraryDays.id })
      .from(itineraryDays)
      .where(eq(itineraryDays.itineraryId, id))
    const known = new Set(days.map((day) => day.id))
    const changes: { dayId: string; teaserImageId: string | null; teaserMood: unknown }[] = []
    await db.transaction(async (tx) => {
      for (const dayId of fmulti(form, 'teaserDay')) {
        if (!known.has(dayId)) continue
        const image = fstr(form, `teaserImage_${dayId}`)
        const teaserImageId = image && isUuid(image) ? image : null
        const teaserMood = flocalizedOrNull(form, `teaserMood_${dayId}`)
        await tx
          .update(itineraryDays)
          .set({ teaserImageId, teaserMood })
          .where(and(eq(itineraryDays.id, dayId), eq(itineraryDays.itineraryId, id)))
        changes.push({ dayId, teaserImageId, teaserMood })
      }
    })
    await writeAudit({
      actor: session,
      action: 'itinerary.day_teasers',
      entityType: 'itinerary',
      entityId: id,
      before: null,
      after: { days: changes },
    })
    outcome = { ok: t('ip1.ok_teasers') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(id, 'content'), outcome))
}

// ---------------------------------------------------------------------------
// Versioned PDF uploads
// ---------------------------------------------------------------------------

/**
 * Upload a PDF for one locale as a new version. The new file becomes current
 * (and `uploaded_pdf_keys` points at it, so delivery is unchanged); older
 * versions stay as archived rows, never deleted.
 */
export async function uploadItineraryPdfVersion(id: string, form: FormData): Promise<void> {
  const outcome = await uploadPdfCore(id, form)
  redirect(withOutcome(editor(id, 'pdf'), outcome))
}

/** Make an archived uploaded version current again (no new upload, no notice). */
export async function restoreItineraryPdfVersion(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const docId = fstr(form, 'docId') ?? ''
    if (!isUuid(docId)) throw new Error(t('itineraries.err_gone'))
    const fileVersion = await db.transaction(async (tx) => {
      const [doc] = await tx
        .select()
        .from(itineraryDocuments)
        .where(
          and(
            eq(itineraryDocuments.id, docId),
            eq(itineraryDocuments.itineraryId, id),
            eq(itineraryDocuments.source, 'uploaded'),
          ),
        )
        .limit(1)
      if (!doc) throw new Error(t('itineraries.err_gone'))
      const [row] = await tx.select().from(itineraries).where(eq(itineraries.id, id)).limit(1)
      if (!row) throw new Error(t('itineraries.err_gone'))
      await tx
        .update(itineraryDocuments)
        .set({ isCurrent: sql`${itineraryDocuments.id} = ${doc.id}` })
        .where(
          and(
            eq(itineraryDocuments.itineraryId, id),
            eq(itineraryDocuments.locale, doc.locale),
            eq(itineraryDocuments.source, 'uploaded'),
          ),
        )
      await tx
        .update(itineraries)
        .set({ uploadedPdfKeys: { ...(row.uploadedPdfKeys ?? {}), [doc.locale]: doc.objectKey } })
        .where(eq(itineraries.id, id))
      return doc.fileVersion
    })
    await writeAudit({
      actor: session,
      action: 'itinerary.pdf_restore',
      entityType: 'itinerary',
      entityId: id,
      before: null,
      after: { docId, fileVersion },
    })
    outcome = { ok: t('ip1.ok_pdf_restored', { version: fileVersion }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(id, 'pdf'), outcome))
}

// ---------------------------------------------------------------------------
// Settings: pricing (`itinerarySales`) and driver
// ---------------------------------------------------------------------------

async function writeSetting(key: string, value: unknown, userId: string): Promise<unknown> {
  const [before] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1)
  await db
    .insert(siteSettings)
    .values({ key, value, updatedByActorId: userId })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedByActorId: userId, updatedAt: new Date() },
    })
  return before?.value ?? null
}

function moneyOrZero(form: FormData, name: string, currency: string): number {
  const raw = fstr(form, name)
  if (raw === null) return 0
  const parsed = parseMoneyInput(raw, currency)
  if (!parsed.ok || parsed.value < 0)
    throw new FormError(`${name}: ${raw}`, 'err.invalid', { field: `i18n:field.${name}` })
  return parsed.value
}

export async function saveItinerarySales(form: FormData): Promise<void> {
  // Admin and content_editor (spec §5). Price numbers also need `prices.write`,
  // the same rule as every other price in Studio: without it they stay as stored.
  const session = await requireCapability('content.publish')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const current = await readItinerarySales()
    const mayPrice = can(session.role, 'prices.write')
    const currency = current.currency
    const defaultPrices = mayPrice
      ? Array.from({ length: 12 }, (_, i) => ({
          days: Number(fstr(form, `dp${i}Days`) ?? ''),
          raw: fstr(form, `dp${i}Price`),
        }))
          .filter((row) => Number.isInteger(row.days) && row.days > 0 && row.raw !== null)
          .map((row) => ({
            days: row.days,
            priceMinor: ((r) => (r.ok ? r.value : -1))(parseMoneyInput(row.raw ?? '', currency)),
          }))
      : current.defaultPrices
    const customTripTiers = mayPrice
      ? Array.from({ length: 6 }, (_, i) => ({
          maxDays: Number(fstr(form, `ct${i}Days`) ?? ''),
          raw: fstr(form, `ct${i}Price`),
        }))
          .filter((row) => Number.isInteger(row.maxDays) && row.maxDays > 0 && row.raw !== null)
          .map((row) => ({
            maxDays: row.maxDays,
            priceMinor: ((r) => (r.ok ? r.value : -1))(parseMoneyInput(row.raw ?? '', currency)),
          }))
          .sort((a, b) => a.maxDays - b.maxDays)
      : current.customTripTiers
    const candidate = {
      ...current,
      options: {
        itineraryOnly: {
          enabled: fbool(form, 'optOnlyEnabled'),
          label: flocalized(form, 'optOnlyLabel'),
          badge: flocalized(form, 'optOnlyBadge'),
        },
        withMap: {
          enabled: fbool(form, 'optMapEnabled'),
          label: flocalized(form, 'optMapLabel'),
          badge: flocalized(form, 'optMapBadge'),
        },
      },
      mapPlanId: fstr(form, 'mapPlanId') ?? '',
      popularBadge: flocalized(form, 'popularBadge'),
      usesPerPurchase: intIn(form, 'usesPerPurchase', 1, 20, current.usesPerPurchase),
      linkValidDays: intIn(form, 'linkValidDays', 1, 90, current.linkValidDays),
      linkMaxUses: intIn(form, 'linkMaxUses', 1, 50, current.linkMaxUses),
      maxUploadMb: intIn(form, 'maxUploadMb', 1, 24, current.maxUploadMb),
      discountIncludesDriver: fbool(form, 'discountIncludesDriver'),
      ...(mayPrice
        ? {
            mapBundlePriceMinor: moneyOrZero(form, 'mapBundlePrice', currency),
            allActivitiesDiscountPct: intIn(
              form,
              'allActivitiesDiscountPct',
              0,
              90,
              current.allActivitiesDiscountPct,
            ),
            defaultPrices,
            customTripTiers,
          }
        : {}),
    }
    const parsed = itinerarySalesSchema.safeParse(candidate)
    // Mapped to a sentence in the Studio language by errorMessage().
    if (!parsed.success) throw parsed.error
    const before = await writeSetting(ITINERARY_SALES_KEY, parsed.data, session.userId)
    await writeAudit({
      actor: session,
      action: 'settings.itinerarySales',
      entityType: 'site_settings',
      entityId: null,
      before: (before as Record<string, unknown> | null) ?? null,
      after: parsed.data,
    })
    outcome = { ok: t('ip1.ok_settings') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(PRICING, outcome))
}

export async function saveDriverSettings(form: FormData): Promise<void> {
  // Admin and operations_manager (spec §5): the capability that runs capacity.
  const session = await requireCapability('capacity.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const maxDaysRaw = fstr(form, 'maxDays')
    const candidate = {
      showOnBuyerPage: fbool(form, 'showOnBuyerPage'),
      noticeDays: intIn(form, 'noticeDays', 0, 30, 4),
      cutoffTime: fstr(form, 'cutoffTime') ?? '18:00',
      maxAdvanceDays: intIn(form, 'maxAdvanceDays', 1, 730, 180),
      timezone: fstr(form, 'timezone') ?? 'Asia/Makassar',
      maxPax: intIn(form, 'maxPax', 1, 60, 12),
      minDays: intIn(form, 'minDays', 1, 60, 1),
      maxDays: maxDaysRaw === null ? null : intIn(form, 'maxDays', 1, 60, 1),
      blockedDates: [
        ...new Set(
          (fstr(form, 'blockedDates') ?? '')
            .split(/[\s,]+/)
            .map((s) => s.trim())
            .filter((s) => ISO_DATE.test(s)),
        ),
      ].sort(),
      includeInFullTripDiscount: fbool(form, 'includeInFullTripDiscount'),
      cancellationPolicy: flocalized(form, 'cancellationPolicy'),
    }
    // An unknown time zone would make every date wrong; refuse it here.
    try {
      new Intl.DateTimeFormat('en', { timeZone: candidate.timezone })
    } catch {
      throw new Error(t('ip1.err_timezone'))
    }
    const parsed = driverSettingsSchema.safeParse(candidate)
    // Mapped to a sentence in the Studio language by errorMessage().
    if (!parsed.success) throw parsed.error

    const before = await writeSetting(DRIVER_SETTINGS_KEY, parsed.data, session.userId)
    await writeAudit({
      actor: session,
      action: 'settings.driver',
      entityType: 'site_settings',
      entityId: null,
      before: (before as Record<string, unknown> | null) ?? null,
      after: parsed.data,
    })
    outcome = { ok: t('ip1.ok_settings') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(`${withOutcome(DRIVER, outcome)}#rules`)
}
