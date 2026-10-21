import Link from 'next/link'

import { buildMapAnalytics } from '@/lib/reports/builders/map'
import { currencyOptions, staffOptions } from '@/lib/reports/data'
import { parseReportFilters } from '@/lib/reports/filters'

import { adminHref } from '../../_lib/admin-path'
import { requireCapability } from '../../_lib/session'
import { FilterBar } from '../../_ui/reports/filter-bar'
import { ReportBody } from '../../_ui/reports/report-view'
import { PageHead } from '../../_ui/shell'
import { buildContext } from '../reports/access'

export const dynamic = 'force-dynamic'

/** Map analytics: Free vs VIP, what people open and filter, what it leads to. */
export default async function MapAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('reports.read')
  const query = await searchParams
  const ctx = await buildContext(session.role)
  const filters = parseReportFilters(query, ctx.now)
  const [result, currencies, staff] = await Promise.all([
    buildMapAnalytics(filters, ctx),
    currencyOptions(),
    staffOptions(),
  ])
  const { t } = ctx
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
      <FilterBar
        action={adminHref('/map-analytics')}
        filters={filters}
        t={t}
        intl={ctx.intl}
        suppliers={[]}
        currencies={currencies}
        staff={staff}
        showType={false}
        showSupplier={false}
      />
      <ReportBody
        result={result}
        t={t}
        intl={ctx.intl}
        rtl={ctx.rtl}
        wideFirstChart={false}
        role={session.role}
      />
    </>
  )
}
