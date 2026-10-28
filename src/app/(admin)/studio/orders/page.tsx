import { count, desc, eq } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { orders, users } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { formatMoney } from '@/lib/money'
import { ORDER_STATUSES } from '@/lib/orders/state'
import { isUrgent, timeLeftParts } from '@/lib/orders/supplier-wait'

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
        authorizedAt: orders.authorizedAt,
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
  const now = new Date()
  const [waitingRow] = await db
    .select({ value: count() })
    .from(orders)
    .where(eq(orders.status, 'authorized'))
  const waiting = waitingRow?.value ?? 0
  const leftLabel = (row: (typeof rows)[number]) => {
    if (row.status !== 'authorized') return null
    const since = row.authorizedAt ?? row.createdAt
    const left = timeLeftParts(since, now)
    return {
      text: t('oo.left', { d: left.days, h: left.hours }),
      urgent: isUrgent(since, now),
    }
  }

  return (
    <>
      <PageHead
        title={t('orders.title')}
        description={t('orders.description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/guide')}>
            {t('oo.guide_link')}
          </Link>
        }
      />
      <Flash searchParams={params} />

      <nav className="a-quickfilter" aria-label={t('oo.o_quick')}>
        <Link
          href={`${LIST}?status=authorized`}
          className={`a-qf${status === 'authorized' ? ' is-on' : ''}${waiting > 0 ? ' has-work' : ''}`}
          aria-current={status === 'authorized' ? 'page' : undefined}
        >
          {t('oo.o_waiting')}
          <span className="a-qf-n">{waiting}</span>
        </Link>
        <Link href={`${LIST}?status=paid`} className={`a-qf${status === 'paid' ? ' is-on' : ''}`}>
          {t('oo.o_paid')}
        </Link>
        <Link href={LIST} className={`a-qf${!status ? ' is-on' : ''}`}>
          {t('oo.o_all')}
        </Link>
      </nav>

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
        <>
          <ul className="a-ocards" aria-label={t('orders.title')}>
            {rows.map((row) => {
              const left = leftLabel(row)
              return (
                <li key={row.id}>
                  <Link href={adminHref(`/orders/${row.id}`)} className="a-ocard">
                    <span className="a-ocard-top">
                      <span className="a-mono">{row.orderNumber}</span>
                      <OrderStatusPill status={row.status} />
                    </span>
                    <span className="a-ocard-who">
                      {row.customerSnapshot?.name ?? row.userEmail ?? t('orders.guest')}
                    </span>
                    <span className="a-ocard-meta">
                      <b>{formatMoney(row.totalMinor, row.currency, intl)}</b>
                      <When value={row.placedAt ?? row.createdAt} />
                    </span>
                    {left ? (
                      <span className={`a-ocard-left${left.urgent ? ' urgent' : ''}`}>
                        {t('oo.o_release_in', { left: left.text })}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
          <div className="a-only-wide">
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
                      {leftLabel(row) ? (
                        <div className={`a-ocard-left${leftLabel(row)?.urgent ? ' urgent' : ''}`}>
                          {t('oo.o_release_in', { left: leftLabel(row)?.text ?? '' })}
                        </div>
                      ) : null}
                    </td>
                    <td className="num">{formatMoney(row.totalMinor, row.currency, intl)}</td>
                    <td>
                      <When value={row.placedAt ?? row.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
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
