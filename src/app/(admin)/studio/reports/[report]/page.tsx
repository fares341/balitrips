import Link from 'next/link'
import { notFound } from 'next/navigation'

import { buildReport, isReportId, mayOpen, type ReportId } from '@/lib/reports/catalog'
import { currencyOptions, staffOptions, supplierOptions } from '@/lib/reports/data'
import { filterQuery, parseReportFilters } from '@/lib/reports/filters'
import type { ListingKind } from '@/lib/reports/listing'

import { adminHref } from '../../../_lib/admin-path'
import { requireCapability } from '../../../_lib/session'
import { Flash } from '../../../_ui/flash'
import { PdfExportButton } from '../../../_ui/pdf-export'
import { FilterBar } from '../../../_ui/reports/filter-bar'
import { ReportBody } from '../../../_ui/reports/report-view'
import { PageHead } from '../../../_ui/shell'
import { buildContext, reportAccess } from '../access'

export const dynamic = 'force-dynamic'

/** Studio v2: the row-level SAR listing that goes with a report («تصدير PDF»). */
const LISTING_FOR: Partial<Record<ReportId, ListingKind>> = {
  financial: 'sales',
  bookings: 'orders',
  itineraries: 'itinerary_sales',
  suppliers: 'payables',
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('reports.read')
  const { report } = await params
  if (!isReportId(report) || !mayOpen(report, reportAccess(session.role))) notFound()
  const query = await searchParams
  const ctx = await buildContext(session.role)
  const filters = parseReportFilters(query, ctx.now)
  const [result, suppliers, currencies, staff] = await Promise.all([
    buildReport(report, filters, ctx),
    supplierOptions(),
    currencyOptions(),
    staffOptions(),
  ])
  const { t } = ctx
  const qs = filterQuery(filters)
  const listing = LISTING_FOR[report]

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
        staff={staff}
      >
        <a className="a-btn ghost" href={adminHref(`/reports/${report}/export?${qs}&format=csv`)}>
          {t('rp.export_csv')}
        </a>
        <a className="a-btn ghost" href={adminHref(`/reports/${report}/export?${qs}&format=pdf`)}>
          {t('rp.export_pdf')}
        </a>
        {listing ? (
          <PdfExportButton
            kind={listing}
            role={session.role}
            searchParams={{ from: filters.period.fromDate, to: filters.period.toDate }}
            back={`/reports/${report}`}
            label={`${t('pdf.export')} · ${t(`pdf.l_${listing}`)}`}
          />
        ) : null}
      </FilterBar>
      <ReportBody result={result} t={t} intl={ctx.intl} rtl={ctx.rtl} role={session.role} />
    </>
  )
}
