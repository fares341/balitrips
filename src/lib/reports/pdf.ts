import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { reportExports, users } from '@/db/schema'
import { translator } from '@/app/(admin)/_i18n'
import { exportLabels } from '@/app/(admin)/studio/reports/labels'
import { can, isRole } from '@/lib/auth/roles'
import { renderPdf } from '@/lib/pdf/gotenberg'
import { uploadPrivate } from '@/lib/storage'

import { rangeLabel } from './builders/helpers'
import { buildReport, isReportId, mayOpen } from './catalog'
import { reportHtml } from './export'
import { buildListing, listingKindOf, mayExportListing, parseListingFilters } from './listing'
import { listingAssets, listingFooterHtml, listingHtml } from './listing-html'
import { parseReportFilters } from './filters'

/**
 * Render one queued report export to PDF (worker only — Chromium never runs
 * on the request path). The report is rebuilt with the requester's CURRENT
 * role, so a person who lost access in the meantime gets nothing.
 */
export async function renderReportExport(exportId: string): Promise<void> {
  const [row] = await db.select().from(reportExports).where(eq(reportExports.id, exportId)).limit(1)
  if (!row || row.status === 'ready') return
  const fail = async (error: string) => {
    await db
      .update(reportExports)
      .set({ status: 'failed', error: error.slice(0, 500) })
      .where(eq(reportExports.id, exportId))
  }
  if (listingKindOf(row.report) !== null && row.requestedBy !== null) {
    const kind = listingKindOf(row.report)
    try {
      const pdf = await renderListingPdf(
        row.report,
        row.params,
        row.locale,
        row.requestedBy,
        row.createdAt,
      )
      if (pdf === null || kind === null) return fail('no access')
      const objectKey = `reports/${row.id}.pdf`
      const upload = await uploadPrivate({
        key: objectKey,
        body: pdf,
        contentType: 'application/pdf',
      })
      await db
        .update(reportExports)
        .set({ status: 'ready', objectKey: upload.key, bytes: upload.bytes, error: null })
        .where(eq(reportExports.id, exportId))
      return
    } catch (error) {
      await fail(error instanceof Error ? error.message : String(error))
      throw error
    }
  }
  if (!isReportId(row.report) || row.requestedBy === null) return fail('unknown report')
  const [requester] = await db
    .select({ role: users.role, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, row.requestedBy))
    .limit(1)
  const role =
    requester && requester.deletedAt === null && isRole(requester.role)
      ? requester.role
      : 'customer'
  const access = {
    finance: can(role, 'finance.read'),
    customers: can(role, 'customers.read'),
    orders: can(role, 'reports.read'),
  }
  if (!access.orders || !mayOpen(row.report, access)) return fail('no access')

  const locale = row.locale === 'en' ? 'en' : 'ar'
  const t = translator(locale)
  const intl = locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB'
  const now = new Date()
  const filters = parseReportFilters(row.params, row.createdAt)
  const result = await buildReport(row.report, filters, {
    t,
    intl,
    finance: access.finance,
    customers: access.customers,
    now,
  })
  const p = filters.period
  const html = reportHtml(result, {
    period: rangeLabel(p.fromDate, p.toDate, intl),
    compared: filters.compare ? rangeLabel(p.prevFromDate, p.prevToDate, intl) : null,
    intl,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    lang: locale,
    brand: 'Bali Trips',
    generatedAt: new Intl.DateTimeFormat(intl, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Makassar',
    }).format(now),
    labels: exportLabels(t),
  })
  const pdf = await renderPdf({
    html,
    metadata: { Title: result.title, Author: 'Bali Trips', Creator: 'Bali Trips' },
  })
  const objectKey = `reports/${row.id}.pdf`
  const upload = await uploadPrivate({ key: objectKey, body: pdf, contentType: 'application/pdf' })
  await db
    .update(reportExports)
    .set({ status: 'ready', objectKey: upload.key, bytes: upload.bytes, error: null })
    .where(eq(reportExports.id, exportId))
}

/**
 * A listing PDF (orders, payments, refunds, payables, customers, sales,
 * itinerary sales, the accountant's month) for `userId`, with that person's
 * CURRENT role. Null when they may no longer make it.
 */
export async function renderListingPdf(
  report: string,
  params: Record<string, string>,
  localeValue: string,
  userId: string,
  createdAt: Date,
): Promise<Uint8Array | null> {
  const kind = listingKindOf(report)
  if (kind === null) return null
  const [requester] = await db
    .select({ role: users.role, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  const role =
    requester && requester.deletedAt === null && isRole(requester.role)
      ? requester.role
      : 'customer'
  if (!mayExportListing(role, kind)) return null

  const locale = localeValue === 'en' ? 'en' : 'ar'
  const t = translator(locale)
  const intl = locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB'
  await loadStudioRates() // the Studio SAR rate for any non-SAR amount
  const filters = parseListingFilters(params)
  const doc = await buildListing(kind, filters, { t, intl, role, locale })
  const day = (iso: string) =>
    new Intl.DateTimeFormat(intl, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(`${iso}T12:00:00Z`),
    )
  const period =
    filters.from || filters.to
      ? `${filters.from ? day(filters.from) : '…'} – ${filters.to ? day(filters.to) : '…'}`
      : t('pdf.all_time')
  const shownFilters: [string, string][] = []
  if (filters.status) shownFilters.push([t('common.status'), filters.status])
  if (filters.q) shownFilters.push([t('list.search'), filters.q])
  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  const brand = 'Bali Trips'
  const html = listingHtml(doc, {
    dir,
    lang: locale,
    brand,
    period,
    filters: shownFilters,
    generatedAt: new Intl.DateTimeFormat(intl, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Makassar',
    }).format(createdAt),
    labels: {
      period: t('pdf.period'),
      filters: t('pdf.filters'),
      noFilters: t('pdf.no_filters'),
      generated: t('pdf.generated'),
      totals: t('pdf.totals'),
      truncated: (n) => t('pdf.truncated', { n }),
      empty: t('rp.empty'),
    },
  })
  return renderPdf({
    html,
    files: await listingAssets(),
    footerHtml: listingFooterHtml({ dir, page: t('pdf.page'), of: t('pdf.of'), brand }),
    margins: { top: 0.55, bottom: 0.7, left: 0.5, right: 0.5 },
    metadata: { Title: doc.title, Author: brand, Creator: brand },
  })
}

/**
 * `readFx()` for the worker: fx-store is `server-only` (a Next import guard
 * the worker cannot load), so the same three steps are done here.
 */
async function loadStudioRates(): Promise<void> {
  try {
    const { readSettings } = await import('@/app/(admin)/_lib/settings')
    const { resolveFx } = await import('@/lib/currency/fx')
    const { setStudioRates } = await import('@/lib/currency/studio')
    const { values, missing } = await readSettings()
    const storedUsd = values.currencies.rates?.USD
    const legacy =
      storedUsd === undefined && !missing.includes('vehicles') ? values.vehicles.sarPerUsd : null
    setStudioRates(resolveFx(values.currencies, legacy).rates)
  } catch {
    // The shipped table stays in force.
  }
}
