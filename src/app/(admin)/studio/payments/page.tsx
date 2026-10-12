import { count, desc, eq, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { can } from '@/lib/auth/roles'
import { orders, payments, users } from '@/db/schema'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { pageParam } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, OrderStatusPill, Pager, Pill, Table, When } from '../../_ui/table'
import { refundDuplicatePayment } from './actions'
import { PAYMENT_STATUSES, paymentFilters } from './filters'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const LIST = adminHref('/payments')

/**
 * كل محاولات الدفع (الوثيقة: "إدارة المدفوعات"). كل صف يقود إلى طلبه، حيث
 * الاسترداد، وتسجيل دفع خارجي، وإصدار الإيصال، والصلاحيات الممنوحة.
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('payments.read')
  const mayRefund = can(session.role, 'orders.refund')
  const mayExport = can(session.role, 'customers.export')
  const params = await searchParams
  const page = pageParam(params)
  const { q, status, provider, from, to, where } = paymentFilters(params)
  const exportQuery = new URLSearchParams(
    Object.entries({ q, status, provider, from, to }).flatMap(([key, value]) =>
      value ? [[key, value]] : [],
    ),
  ).toString()

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: payments.id,
        provider: payments.provider,
        providerPaymentId: payments.providerPaymentId,
        status: payments.status,
        amountMinor: payments.amountMinor,
        currency: payments.currency,
        createdAt: payments.createdAt,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        orderStatus: orders.status,
        email: users.email,
        // دفعة ناجحة سبقتها دفعة ناجحة أخرى للطلب نفسه = دفعة مكررة.
        duplicate: sql<boolean>`${payments.status} = 'succeeded' and exists (
          select 1 from ${payments} p2
          where p2.order_id = ${payments.orderId}
            and p2.status in ('succeeded', 'refunded')
            and p2.created_at < ${payments.createdAt}
            and p2.id <> ${payments.id}
        )`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .leftJoin(users, eq(users.id, orders.userId))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ value: count() })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .leftJoin(users, eq(users.id, orders.userId))
      .where(where),
  ])

  return (
    <>
      <PageHead
        title="Payments"
        description="Every payment attempt. Open the order to refund, record a bank transfer, or issue the receipt."
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
            placeholder="Order number, e-mail or provider id"
          />
        </div>
        <div className="a-field">
          <label htmlFor="status">Status</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">All</option>
            {PAYMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="provider">Provider</label>
          <select className="a-select" id="provider" name="provider" defaultValue={provider ?? ''}>
            <option value="">All</option>
            <option value="stripe">stripe</option>
            <option value="manual">manual (bank transfer)</option>
            <option value="sandbox">sandbox</option>
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
          {mayExport ? (
            // Route handler, not a page: a plain <a> so the browser downloads it.
            <a className="a-btn ghost" href={`${adminHref('/payments/export')}?${exportQuery}`}>
              Export CSV
            </a>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>No payments match.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>Order</th>
              <th>Customer</th>
              <th>Provider</th>
              <th>Payment</th>
              <th>Order status</th>
              <th className="num">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <When value={row.createdAt} />
                </td>
                <td>
                  <Link href={adminHref(`/orders/${row.orderId}`)} className="a-mono">
                    {row.orderNumber}
                  </Link>
                </td>
                <td>{row.email ?? <span className="a-muted">guest</span>}</td>
                <td>
                  {row.provider}
                  {row.providerPaymentId ? (
                    <div className="a-muted a-mono">{row.providerPaymentId}</div>
                  ) : null}
                </td>
                <td>
                  <Pill
                    tone={
                      row.status === 'succeeded'
                        ? 'good'
                        : row.status === 'failed' ||
                            row.status === 'cancelled' ||
                            row.status === 'refunded'
                          ? 'bad'
                          : 'warn'
                    }
                  >
                    {row.status}
                  </Pill>
                </td>
                <td>
                  <OrderStatusPill status={row.orderStatus} />
                </td>
                <td className="num">{formatMoney(row.amountMinor, row.currency, 'en')}</td>
                <td>
                  {row.duplicate ? (
                    <>
                      <Pill tone="warn">duplicate</Pill>
                      {mayRefund ? (
                        <form className="a-inline-form" action={refundDuplicatePayment}>
                          <input type="hidden" name="paymentId" value={row.id} />
                          <button className="a-btn danger small" type="submit">
                            Refund duplicate
                          </button>
                        </form>
                      ) : null}
                    </>
                  ) : null}
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
        total={total?.value ?? 0}
      />
    </>
  )
}
