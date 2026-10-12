import { and, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { orders, users } from '@/db/schema'
import { formatMoney } from '@/lib/money'
import { ORDER_STATUSES } from '@/lib/orders/state'

import { adminHref } from '../../_lib/admin-path'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, OrderStatusPill, Pager, Table, When } from '../../_ui/table'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const LIST = adminHref('/orders')

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('orders.read')
  const params = await searchParams

  const q = param(params, 'q')
  const status = param(params, 'status')
  const from = param(params, 'from')
  const to = param(params, 'to')
  const page = pageParam(params)

  const filters: SQL[] = []

  if (q) {
    const like = `%${q}%`
    const match = or(
      ilike(orders.orderNumber, like),
      ilike(users.email, like),
      sql`${orders.customerSnapshot} ->> 'email' ilike ${like}`,
      sql`${orders.customerSnapshot} ->> 'name' ilike ${like}`,
    )
    if (match) filters.push(match)
  }
  if (status && (ORDER_STATUSES as readonly string[]).includes(status)) {
    filters.push(eq(orders.status, status))
  }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    filters.push(gte(orders.createdAt, new Date(`${from}T00:00:00Z`)))
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    filters.push(lte(orders.createdAt, new Date(`${to}T23:59:59Z`)))
  }

  const where = filters.length > 0 ? and(...filters) : undefined

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
      <PageHead
        title="Orders"
        description="Totals are what the buyer was charged, in the currency they were charged in."
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">Search</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Order number, name or email"
          />
        </div>
        <div className="a-field">
          <label htmlFor="status">Status</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">Any</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="from">From</label>
          <input className="a-input" id="from" name="from" type="date" defaultValue={from ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="to">To</label>
          <input className="a-input" id="to" name="to" type="date" defaultValue={to ?? ''} />
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            Filter
          </button>
          <Link className="a-btn ghost" href={LIST}>
            Reset
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>No orders match those filters.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Status</th>
              <th className="num">Total</th>
              <th>Placed</th>
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
                    <span className="a-muted">guest</span>
                  )}
                  <div className="a-muted">
                    {row.customerSnapshot?.email ?? row.userEmail ?? ''}
                  </div>
                </td>
                <td>
                  <OrderStatusPill status={row.status} />
                </td>
                <td className="num">{formatMoney(row.totalMinor, row.currency, 'en')}</td>
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
