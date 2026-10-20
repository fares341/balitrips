import { asc, count, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { activitySupplierOffers, suppliers } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { supplierType } from '@/lib/suppliers/assign'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table } from '../../_ui/table'

export const dynamic = 'force-dynamic'

/** الموردون — the companies and people who run what the site sells. */
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('orders.read')
  const { t } = await getAdminI18n()
  const params = await searchParams
  const mayWrite = can(session.role, 'suppliers.write')

  const [rows, offerCounts] = await Promise.all([
    db
      .select()
      .from(suppliers)
      .where(isNull(suppliers.deletedAt))
      .orderBy(asc(suppliers.status), asc(suppliers.name)),
    db
      .select({ supplierId: activitySupplierOffers.supplierId, value: count() })
      .from(activitySupplierOffers)
      .where(eq(activitySupplierOffers.active, true))
      .groupBy(activitySupplierOffers.supplierId),
  ])
  const offers = new Map(offerCounts.map((row) => [row.supplierId, row.value]))

  return (
    <>
      <PageHead
        title={t('sup.title')}
        description={t('sup.description')}
        actions={
          mayWrite ? (
            <>
              <Link className="a-btn ghost" href={adminHref('/payables')}>
                {t('nav.payables')}
              </Link>
              <Link className="a-btn" href={adminHref('/suppliers/new')}>
                {t('sup.new')}
              </Link>
            </>
          ) : null
        }
      />
      <Flash searchParams={params} />
      {rows.length === 0 ? (
        <div className="a-card">
          <h2>{t('sup.empty_title')}</h2>
          <p className="a-hint">{t('sup.empty_body')}</p>
          <ol className="a-hint" style={{ paddingInlineStart: 20, marginBlockStart: 8 }}>
            <li>{t('sup.empty_step1')}</li>
            <li>{t('sup.empty_step2')}</li>
            <li>{t('sup.empty_step3')}</li>
          </ol>
          {mayWrite ? (
            <div className="a-actions" style={{ marginBlockStart: 12 }}>
              <Link className="a-btn" href={adminHref('/suppliers/new')}>
                {t('sup.new')}
              </Link>
            </div>
          ) : (
            <Empty>{t('sup.empty_staff')}</Empty>
          )}
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('sup.name')}</th>
              <th>{t('sup.type')}</th>
              <th>{t('sup.contact')}</th>
              <th className="num">{t('sup.offers_count')}</th>
              <th>{t('sup.rating')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/suppliers/${row.id}`)}>{row.name}</Link>
                </td>
                <td>{t(`sup.type_${supplierType(row.type)}`)}</td>
                <td>
                  {row.contactPerson ?? '—'}
                  {row.phone ? (
                    <div className="a-muted a-mono" dir="ltr">
                      {row.phone}
                    </div>
                  ) : null}
                </td>
                <td className="num">{offers.get(row.id) ?? 0}</td>
                <td>{row.rating ? `${row.rating} / 5` : <span className="a-muted">—</span>}</td>
                <td>
                  {row.status === 'active' ? (
                    <Pill tone="good">{t('sup.status_active')}</Pill>
                  ) : (
                    <Pill tone="warn">{t('sup.status_paused')}</Pill>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}
