import { NextResponse } from 'next/server'

import { csvEscape, UTF8_BOM } from '@/lib/reports/export'
import { filterParams, parseReportFilters } from '@/lib/reports/filters'
import { isRecordMetric, recordsTable } from '@/lib/reports/records'

import { writeAudit } from '../../../../_lib/audit'
import { requireCapability } from '../../../../_lib/session'
import { buildContext, reportAccess } from '../../access'

/** CSV of the records behind a number (UTF-8 with BOM for Excel). Audited. */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await requireCapability('reports.read')
  const url = new URL(request.url)
  const query = Object.fromEntries(url.searchParams)
  const metric = query.metric
  if (!isRecordMetric(metric)) return new NextResponse(null, { status: 404 })
  if (metric === 'customers' && !reportAccess(session.role).customers) {
    return new NextResponse(null, { status: 404 })
  }
  const ctx = await buildContext(session.role)
  const filters = parseReportFilters(query, ctx.now)
  const table = await recordsTable(
    {
      metric,
      filters,
      group: query.group ?? null,
      status: query.status ?? null,
      ref: query.ref ?? null,
      kind: query.kind ?? null,
    },
    { t: ctx.t, intl: ctx.intl, finance: ctx.finance },
  )
  await writeAudit({
    actor: session,
    action: 'report.export_records_csv',
    entityType: 'report',
    entityId: null,
    before: null,
    after: { metric, rows: table.rows.length, filters: filterParams(filters) },
  })
  const lines = [
    table.columns.map((c) => csvEscape(c.label)).join(','),
    ...table.rows.map((row) =>
      table.columns.map((c) => csvEscape(row[c.key]?.raw ?? row[c.key]?.text ?? '')).join(','),
    ),
  ]
  return new Response(`${UTF8_BOM}${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="records-${metric}-${filters.period.fromDate}_${filters.period.toDate}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
