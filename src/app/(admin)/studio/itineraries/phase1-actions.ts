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

import { randomUUID } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { itineraries, itineraryDays, itineraryDocuments, siteSettings } from '@/db/schema'
import { isLocale } from '@/i18n/config'
import { can } from '@/lib/auth/roles'
import { cleanDownloadFilename, isPdfMime, looksLikePdf } from '@/lib/itineraries/publish-gate'
import {
  DRIVER_SETTINGS_KEY,
  ISO_DATE,
  ITINERARY_SALES_KEY,
  driverSettingsSchema,
  itinerarySalesSchema,
} from '@/lib/itineraries/sales-settings'
import { readItinerarySales } from '@/lib/itineraries/sales-settings-store'
import { parseMoneyInput } from '@/lib/money-input'
import { isPrivateStorageAvailable, uploadPrivate } from '@/lib/storage'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fbool,
  ffaqRows,
  flocalized,
  flocalizedOrNull,
  fmulti,
  fstr,
  isUuid,
} from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { notifyItineraryHolders } from './notify-holders'
import { PREVIEW_STAT_ROWS } from './phase1-shared'

type Outcome = { ok: string } | { err: string }

const editor = (id: string) => adminHref(`/itineraries/${id}`)
const PRICING = adminHref('/itineraries/pricing')
const DRIVER = adminHref('/vehicles')

function intIn(form: FormData, name: string, min: number, max: number, fallback: number): number {
  const raw = fstr(form, name)
  if (raw === null) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name}: ${min}–${max}`)
  return n
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
      faq: faqRows.length > 0 ? faqRows : null,
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
  redirect(withOutcome(editor(id), outcome))
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
  redirect(withOutcome(editor(id), outcome))
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
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const rawLocale = fstr(form, 'locale') ?? ''
    if (!isLocale(rawLocale)) throw new Error(t('itineraries.err_pdf_language'))
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0)
      throw new Error(t('itineraries.err_pdf_missing'))
    const settings = await readItinerarySales()
    if (file.size > settings.maxUploadMb * 1024 * 1024) {
      throw new Error(t('ip1.err_pdf_size', { mb: settings.maxUploadMb }))
    }
    if (!isPdfMime(file.type)) throw new Error(t('itineraries.err_pdf_not_pdf'))
    if (!isPrivateStorageAvailable() && process.env.NODE_ENV === 'production') {
      throw new Error(t('itineraries.err_pdf_storage'))
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!looksLikePdf(bytes)) throw new Error(t('itineraries.err_pdf_not_pdf'))

    const [before] = await db.select().from(itineraries).where(eq(itineraries.id, id)).limit(1)
    if (!before) throw new Error(t('itineraries.err_gone'))

    const notify = fbool(form, 'notifyBuyers')
    const downloadFilename =
      cleanDownloadFilename(fstr(form, 'downloadFilename')) ??
      cleanDownloadFilename(file.name) ??
      `${before.slug}-${rawLocale}.pdf`

    // An unguessable key: the original is never exposed (delivered stamped).
    const objectKey = `itineraries/${id}/uploaded/${rawLocale}-${randomUUID()}.pdf`
    if (isPrivateStorageAvailable()) {
      await uploadPrivate({ key: objectKey, body: bytes, contentType: 'application/pdf' })
    } else {
      // Local development only (production without storage is refused above).
      const { mkdir, writeFile } = await import('node:fs/promises')
      const path = await import('node:path')
      const target = path.join(process.cwd(), 'public', objectKey)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, bytes)
    }

    const keys = { ...(before.uploadedPdfKeys ?? {}), [rawLocale]: objectKey }
    const fileVersion = await db.transaction(async (tx) => {
      // Serialise uploads of the same itinerary so versions never collide.
      await tx.execute(sql`select 1 from ${itineraries} where ${itineraries.id} = ${id} for update`)
      const [last] = await tx
        .select({ v: itineraryDocuments.fileVersion })
        .from(itineraryDocuments)
        .where(
          and(
            eq(itineraryDocuments.itineraryId, id),
            eq(itineraryDocuments.locale, rawLocale),
            eq(itineraryDocuments.source, 'uploaded'),
          ),
        )
        .orderBy(desc(itineraryDocuments.fileVersion))
        .limit(1)
      const next = (last?.v ?? 0) + 1
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
      await tx.insert(itineraryDocuments).values({
        itineraryId: id,
        // 0 = never an itinerary version, so generated-file readers skip it.
        version: 0,
        locale: rawLocale,
        objectKey,
        bytes: bytes.byteLength,
        source: 'uploaded',
        fileVersion: next,
        isCurrent: true,
        downloadFilename,
        notifyBuyers: notify,
        uploadedById: session.userId,
      })
      await tx.update(itineraries).set({ uploadedPdfKeys: keys }).where(eq(itineraries.id, id))
      return next
    })

    await writeAudit({
      actor: session,
      action: 'itinerary.pdf_upload',
      entityType: 'itinerary',
      entityId: id,
      before: { uploadedPdfKeys: before.uploadedPdfKeys },
      after: { uploadedPdfKeys: keys, bytes: bytes.byteLength, fileVersion, downloadFilename },
    })
    const notified = notify ? await notifyItineraryHolders(before, rawLocale, keys) : 0
    outcome = {
      ok:
        t('ip1.ok_pdf_version', {
          version: fileVersion,
          locale: t(`translations.lang_${rawLocale}`),
        }) + (notified > 0 ? ` ${t('itineraries.ok_pdf_notified', { count: notified })}` : ''),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editor(id), outcome))
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
  redirect(withOutcome(editor(id), outcome))
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
  if (!parsed.ok || parsed.value < 0) throw new Error(`${name}: ${raw}`)
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
          }
        : {}),
    }
    const parsed = itinerarySalesSchema.safeParse(candidate)
    if (!parsed.success)
      throw new Error(
        t('ip1.err_settings', { detail: parsed.error.issues[0]?.path.join('.') ?? '' }),
      )
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
    if (!parsed.success)
      throw new Error(
        t('ip1.err_settings', { detail: parsed.error.issues[0]?.path.join('.') ?? '' }),
      )

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
