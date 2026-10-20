import Link from 'next/link'
import { notFound } from 'next/navigation'

import { buildReport, isReportId, mayOpen } from '@/lib/reports/catalog'
import { currencyOptions, supplierOptions } from '@/lib/reports/data'
import { filterQuery, parseReportFilters } from '@/lib/reports/filters'

import { adminHref } from '../../../_lib/admin-path'
import { requireCapability } from '../../../_lib/session'
import { Flash } from '../../../_ui/flash'
import { FilterBar } from '../../../_ui/reports/filter-bar'
import { ReportBody } from '../../../_ui/reports/report-view'
import { PageHead } from '../../../_ui/shell'
import { buildContext, reportAccess } from '../access'

export const dynamic = 'force-dynamic'

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('orders.read')
  const { report } = await params
  if (!isReportId(report) || !mayOpen(report, reportAccess(session.role))) notFound()
  const query = await searchParams
  const ctx = await buildContext(session.role)
  const filters = parseReportFilters(query, ctx.now)
  const [result, suppliers, currencies] = await Promise.all([
    buildReport(report, filters, ctx),
    supplierOptions(),
    currencyOptions(),
  ])
  const { t } = ctx
  const qs = filterQuery(filters)

  return (
    <>
      <PageHead
        title={result.title}
        description={result.description}
        actions={
          <Link className="a-btn ghost" href={adminHref('/reports')}>
            {t('rp.back_to_reports')}
          </Link>
        }
      />
      <Flash searchParams={query} />
      <FilterBar
        action={adminHref(`/reports/${report}`)}
        filters={filters}
        t={t}
        intl={ctx.intl}
        suppliers={suppliers}
        currencies={currencies}
      >
        <a className="a-btn ghost" href={adminHref(`/reports/${report}/export?${qs}&format=csv`)}>
          {t('rp.export_csv')}
        </a>
        <a className="a-btn ghost" href={adminHref(`/reports/${report}/export?${qs}&format=pdf`)}>
          {t('rp.export_pdf')}
        </a>
      </FilterBar>
      <ReportBody result={result} t={t} intl={ctx.intl} rtl={ctx.rtl} />
    </>
  )
}
