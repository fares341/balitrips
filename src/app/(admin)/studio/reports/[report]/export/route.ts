import { NextResponse } from 'next/server'

import { db } from '@/db'
import { reportExports } from '@/db/schema'
import { buildReport, isReportId, mayOpen } from '@/lib/reports/catalog'
import { rangeLabel } from '@/lib/reports/builders/helpers'
import { reportCsv } from '@/lib/reports/export'
import { filterParams, parseReportFilters } from '@/lib/reports/filters'

import { adminHref } from '../../../../_lib/admin-path'
import { writeAudit } from '../../../../_lib/audit'
import { encodeMessage, withOutcome } from '../../../../_lib/result'
import { requireCapability } from '../../../../_lib/session'
import { buildContext, reportAccess } from '../../access'
import { exportLabels } from '../../labels'

/**
 * Export a report with the page's filters.
 *
 *  - `format=csv`: right now, as a UTF-8 CSV with a byte-order mark (opens in
 *    Excel with Arabic intact).
 *  - `format=pdf`: queued for the worker (PDFs are rendered by Chromium in
 *    the worker only), then listed under Reports → Exports for download.
 *
 * Audited either way: a report export can hold business figures.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const session = await requireCapability('orders.read')
  const { report } = await params
  if (!isReportId(report) || !mayOpen(report, reportAccess(session.role))) {
    return new NextResponse(null, { status: 404 })
  }
  const url = new URL(request.url)
  const query = Object.fromEntries(url.searchParams)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'csv'
  const ctx = await buildContext(session.role)
  const filters = parseReportFilters(query, ctx.now)

  await writeAudit({
    actor: session,
    action: `report.export_${format}`,
    entityType: 'report',
    entityId: null,
    before: null,
    after: { report, filters: filterParams(filters) },
  })

  if (format === 'pdf') {
    const [row] = await db
      .insert(reportExports)
      .values({
        report,
        params: filterParams(filters),
        locale: ctx.locale,
        requestedBy: session.userId,
      })
      .returning({ id: reportExports.id })
    if (row) {
      const { enqueueReportPdf } = await import('@/worker/queues')
      await enqueueReportPdf(row.id)
    }
    return NextResponse.redirect(
      new URL(
        withOutcome(adminHref('/reports/exports'), { ok: encodeMessage('rp.ok_queued') }),
        request.url,
      ),
      303,
    )
  }

  const result = await buildReport(report, filters, ctx)
  const p = filters.period
  const body = reportCsv(result, {
    period: rangeLabel(p.fromDate, p.toDate, ctx.intl),
    compared: filters.compare ? rangeLabel(p.prevFromDate, p.prevToDate, ctx.intl) : null,
    intl: ctx.intl,
    labels: exportLabels(ctx.t),
  })
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="report-${report}-${p.fromDate}_${p.toDate}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
