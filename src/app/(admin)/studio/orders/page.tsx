import { count, desc, eq } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { orders, users } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { formatMoney } from '@/lib/money'
import { ORDER_STATUSES } from '@/lib/orders/state'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { buildQuery, pageParam } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, OrderStatusPill, Pager, Table, When } from '../../_ui/table'
import { orderFilters } from './filters'
import { orderStatusLabel } from './labels'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const LIST = adminHref('/orders')

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('orders.read')
  const { t, intl } = await getAdminI18n()
  const params = await searchParams

  const { q, status, from, to, where } = orderFilters(params)
  const page = pageParam(params)
  const mayExport = can(session.role, 'customers.export')

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        totalMinor: orders.totalMinor,
        currency: orders.presentmentCurrency,
        customerSnapshot: orders.customerSnapshot,
        placedAt: orders.placedAt,
        createdAt: orders.createdAt,
        userEmail: users.email,
      })
      .from(orders)
      .leftJoin(users, eq(users.id, orders.userId))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(orders)
      .leftJoin(users, eq(users.id, orders.userId))
      .where(where),
  ])

  return (
    <>
      <PageHead title={t('orders.title')} description={t('orders.description')} />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">{t('common.search')}</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('orders.search_placeholder')}
          />
        </div>
        <div className="a-field">
          <label htmlFor="status">{t('common.status')}</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">{t('orders.any')}</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {orderStatusLabel(t, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="from">{t('orders.from')}</label>
          <input className="a-input" id="from" name="from" type="date" defaultValue={from ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="to">{t('orders.to')}</label>
          <input className="a-input" id="to" name="to" type="date" defaultValue={to ?? ''} />
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('common.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('orders.reset')}
          </Link>
          {mayExport ? (
            <a
              className="a-btn ghost"
              href={`${adminHref('/orders/export')}${buildQuery(params, {})}`}
            >
              {t('crm.export_orders')}
            </a>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('orders.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('orders.col_order')}</th>
              <th>{t('orders.col_customer')}</th>
              <th>{t('common.status')}</th>
              <th className="num">{t('common.total')}</th>
              <th>{t('orders.col_placed')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/orders/${row.id}`)} className="a-mono">
                    {row.orderNumber}
                  </Link>
                </td>
                <td>
                  {row.customerSnapshot?.name ?? row.userEmail ?? (
                    <span className="a-muted">{t('orders.guest')}</span>
                  )}
                  <div className="a-muted">
                    {row.customerSnapshot?.email ?? row.userEmail ?? ''}
                  </div>
                </td>
                <td>
                  <OrderStatusPill status={row.status} />
                </td>
                <td className="num">{formatMoney(row.totalMinor, row.currency, intl)}</td>
                <td>
                  <When value={row.placedAt ?? row.createdAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Pager
        basePath={LIST}
        searchParams={params}
        page={page}
        pageSize={PAGE_SIZE}
        total={totalRow?.value ?? 0}
      />
    </>
  )
}
