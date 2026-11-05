import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { itineraries, itineraryDays } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { getAdminI18n } from '../../_lib/i18n'
import { Empty, Pager, Pill, PublishPill, Table, When } from '../../_ui/table'
import { PdfStatusPill } from './[id]/phase1-cards'
import { itineraryKpis, salesByItinerary } from './list-stats'
import { pdfStatusMany } from './pdf-facts'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const LIST = adminHref('/itineraries')

export default async function ItinerariesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const { t, intl, locale } = await getAdminI18n()
  const params = await searchParams

  const q = param(params, 'q')
  const status = param(params, 'status')
  const page = pageParam(params)

  const filters: SQL[] = [isNull(itineraries.deletedAt)]

  if (q) {
    const like = `%${q}%`
    const match = or(ilike(itineraries.slug, like), sql`${itineraries.name} ->> 'en' ilike ${like}`)
    if (match) filters.push(match)
  }
  if (status === 'draft' || status === 'published') {
    filters.push(eq(itineraries.status, status))
  }

  const where = and(...filters)

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: itineraries.id,
        slug: itineraries.slug,
        name: itineraries.name,
        status: itineraries.status,
        days: itineraries.days,
        version: itineraries.version,
        priceMinor: itineraries.priceMinor,
        currency: itineraries.currency,
        updatedAt: itineraries.updatedAt,
        uploadedPdfKeys: itineraries.uploadedPdfKeys,
        isPopular: itineraries.isPopular,
      })
      .from(itineraries)
      .where(where)
      .orderBy(desc(itineraries.updatedAt), asc(itineraries.slug))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(itineraries).where(where),
  ])

  const total = totalRow?.value ?? 0

  // Phase 1: KPIs, the Arabic PDF status and sales per row.
  const pdfFilter = param(params, 'pdf')
  const [kpis, pdfStatuses, sales] = await Promise.all([
    itineraryKpis(),
    pdfStatusMany(rows),
    salesByItinerary(rows.map((row) => row.id)),
  ])
  const shown =
    pdfFilter === 'none' || pdfFilter === 'uploaded' || pdfFilter === 'generated'
      ? rows.filter((row) => pdfStatuses.get(row.id)?.kind === pdfFilter)
      : rows

  /**
   * How many days are actually authored, per row on this page.
   *
   * Counted in its own grouped query rather than a correlated subquery: the
   * stored `days` column and the real row count disagreeing is the exact
   * defect this screen exists to surface, so the number beside it has to be
   * one nobody has to squint at.
   */
  const authoredByItinerary = new Map<string, number>()
  if (rows.length > 0) {
    const counts = await db
      .select({ itineraryId: itineraryDays.itineraryId, value: count() })
      .from(itineraryDays)
      .where(
        inArray(
          itineraryDays.itineraryId,
          rows.map((row) => row.id),
        ),
      )
      .groupBy(itineraryDays.itineraryId)

    for (const row of counts) authoredByItinerary.set(row.itineraryId, row.value)
  }

  return (
    <>
      <PageHead
        title={t('itineraries.title')}
        description={t('itineraries.list_description')}
        actions={
          <>
            {can(session.role, 'content.read') ? (
              <Link className="a-btn ghost" href={adminHref('/itineraries/pricing')}>
                {t('ip1.pricing_t')}
              </Link>
            ) : null}
            {can(session.role, 'capacity.write') ? (
              <Link className="a-btn ghost" href={adminHref('/itineraries/driver')}>
                {t('ip1.driver_t')}
              </Link>
            ) : null}
            {can(session.role, 'content.write') ? (
              <Link className="a-btn" href={adminHref('/itineraries/new')}>
                {t('itineraries.new')}
              </Link>
            ) : null}
          </>
        }
      />
      <Flash searchParams={params} />

      <div className="a-kpis" style={{ marginBlockEnd: 16 }}>
        <div className="a-kpi">
          <span className="a-kpi-label">{t('ip1.kpi_published')}</span>
          <span className="a-kpi-value">{kpis.published}</span>
          <span className="a-kpi-note">{t('ip1.kpi_drafts', { count: kpis.drafts })}</span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">{t('ip1.kpi_sales_month')}</span>
          <span className="a-kpi-value">{kpis.salesThisMonth}</span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">{t('ip1.kpi_map_rate')}</span>
          <span className="a-kpi-value">
            {kpis.mapAttachRate === null ? '—' : `${Math.round(kpis.mapAttachRate * 100)}%`}
          </span>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">{t('ip1.kpi_downloads')}</span>
          <span className="a-kpi-value">{kpis.downloadsThisMonth}</span>
        </div>
      </div>

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">{t('common.search')}</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('itineraries.search_placeholder')}
          />
        </div>
        <div className="a-field">
          <label htmlFor="status">{t('common.status')}</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">{t('common.all')}</option>
            <option value="draft">{t('common.draft')}</option>
            <option value="published">{t('common.published')}</option>
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="pdf">{t('ip1.col_pdf')}</label>
          <select className="a-select" id="pdf" name="pdf" defaultValue={pdfFilter ?? ''}>
            <option value="">{t('common.all')}</option>
            <option value="uploaded">{t('ip1.pdf_filter_uploaded')}</option>
            <option value="generated">{t('ip1.pdf_generated')}</option>
            <option value="none">{t('ip1.pdf_none')}</option>
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('common.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('common.clear')}
          </Link>
        </div>
      </form>

      {shown.length === 0 ? (
        <Empty>{t('itineraries.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('common.status')}</th>
              <th className="num">{t('itineraries.days')}</th>
              <th className="num">{t('itineraries.version')}</th>
              <th>{t('ip1.col_pdf')}</th>
              <th className="num">{t('ip1.col_sales')}</th>
              <th className="num">{t('common.price')}</th>
              <th>{t('common.updated')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const authoredDays = authoredByItinerary.get(row.id) ?? 0
              return (
                <tr key={row.id}>
                  <td>
                    <Link href={adminHref(`/itineraries/${row.id}`)}>
                      {pick(row.name, locale, row.slug)}
                    </Link>
                    {row.isPopular ? (
                      <>
                        {' '}
                        <Pill tone="info">{t('ip1.is_popular')}</Pill>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <PublishPill status={row.status} />
                  </td>
                  <td className="num">
                    {authoredDays}
                    {authoredDays !== row.days ? (
                      <>
                        {' '}
                        <Pill tone="warn">{t('itineraries.stored_days', { days: row.days })}</Pill>
                      </>
                    ) : null}
                  </td>
                  <td className="num">v{row.version}</td>
                  <td>
                    <PdfStatusPill status={pdfStatuses.get(row.id) ?? { kind: 'none' }} t={t} />
                  </td>
                  <td className="num">{sales.get(row.id) ?? 0}</td>
                  <td className="num">{formatMoney(row.priceMinor, row.currency, intl)}</td>
                  <td>
                    <When value={row.updatedAt} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}

      <Pager basePath={LIST} searchParams={params} page={page} pageSize={PAGE_SIZE} total={total} />
    </>
  )
}
