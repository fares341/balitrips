import Link from 'next/link'
import { notFound } from 'next/navigation'

import { filterQuery, parseReportFilters } from '@/lib/reports/filters'
import { isRecordMetric, recordsTable } from '@/lib/reports/records'
import { currencyOptions, staffOptions, supplierOptions } from '@/lib/reports/data'

import { adminHref } from '../../../_lib/admin-path'
import { param } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'
import { FilterBar } from '../../../_ui/reports/filter-bar'
import { DataTable } from '../../../_ui/reports/report-view'
import { PageHead } from '../../../_ui/shell'
import { buildContext, reportAccess } from '../access'

export const dynamic = 'force-dynamic'

/**
 * The records behind a number (drill-down from any KPI, bar or table row):
 * same filters, same definition, each row linked to its order.
 */
export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('reports.read')
  const query = await searchParams
  const metric = param(query, 'metric')
  if (!isRecordMetric(metric)) notFound()
  const access = reportAccess(session.role)
  // Customer lists are personal data.
  if (metric === 'customers' && !access.customers) notFound()
  const ctx = await buildContext(session.role)
  const filters = parseReportFilters(query, ctx.now)
  const extra: Record<string, string> = { metric }
  for (const key of ['group', 'status', 'ref', 'kind']) {
    const value = param(query, key)
    if (value) extra[key] = value.slice(0, 64)
  }
  const [table, suppliers, currencies, staff] = await Promise.all([
    recordsTable(
      {
        metric,
        filters,
        group: extra.group ?? null,
        status: extra.status ?? null,
        ref: extra.ref ?? null,
        kind: extra.kind ?? null,
      },
      { t: ctx.t, intl: ctx.intl, finance: ctx.finance },
    ),
    supplierOptions(),
    currencyOptions(),
    staffOptions(),
  ])
  const { t } = ctx

  return (
    <>
      <PageHead
        title={table.title}
        description={t('rp.records_description')}
        actions={
          <>
            <a
              className="a-btn ghost"
              href={adminHref(`/reports/records/export?${filterQuery(filters, extra)}`)}
            >
              {t('rp.export_csv')}
            </a>
            <Link className="a-btn ghost" href={adminHref('/')}>
              {t('rp.back_to_dashboard')}
            </Link>
          </>
        }
      />
      <FilterBar
        action={adminHref('/reports/records')}
        filters={filters}
        t={t}
        intl={ctx.intl}
        suppliers={suppliers}
        currencies={currencies}
        staff={staff}
        extra={extra}
      />
      <section className="a-card" style={{ marginBlockStart: 14 }}>
        <p className="a-hint" style={{ marginBlockEnd: 10 }}>
          {t('rp.records_count', { n: table.rows.length })}
        </p>
        {table.staffNA ? <p className="rp-staff-na-note">{t('rp.staff_na')}</p> : null}
        <DataTable block={table} role={session.role} staffNALabel={t('rp.staff_na')} />
      </section>
    </>
  )
}
