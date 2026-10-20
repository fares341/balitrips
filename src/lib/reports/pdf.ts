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
