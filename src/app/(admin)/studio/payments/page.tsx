import { count, desc, eq, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { can } from '@/lib/auth/roles'
import { orders, payments, users } from '@/db/schema'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { pageParam } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, OrderStatusPill, Pager, Pill, Table, When } from '../../_ui/table'
import { paymentMethodName, paymentStatusLabel } from '../orders/labels'
import { refundDuplicatePayment } from './actions'
import { PAYMENT_METHOD_FILTERS, PAYMENT_STATUSES, paymentFilters } from './filters'

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
  const { t, intl } = await getAdminI18n()
  const mayRefund = can(session.role, 'orders.refund')
  const mayExport = can(session.role, 'customers.export')
  const params = await searchParams
  const page = pageParam(params)
  const { q, status, provider, method, from, to, where } = paymentFilters(params)
  const exportQuery = new URLSearchParams(
    Object.entries({ q, status, provider, method, from, to }).flatMap(([key, value]) =>
      value ? [[key, value]] : [],
    ),
  ).toString()

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: payments.id,
        provider: payments.provider,
        providerPaymentId: payments.providerPaymentId,
        method: payments.method,
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
      <PageHead title={t('payments.title')} description={t('payments.description')} />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">{t('common.search')}</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('payments.search_placeholder')}
          />
        </div>
        <div className="a-field">
          <label htmlFor="status">{t('common.status')}</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">{t('common.all')}</option>
            {PAYMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {paymentStatusLabel(t, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="provider">{t('payments.provider')}</label>
          <select className="a-select" id="provider" name="provider" defaultValue={provider ?? ''}>
            <option value="">{t('common.all')}</option>
            <option value="stripe">stripe</option>
            <option value="manual">{t('payments.provider_manual')}</option>
            <option value="sandbox">sandbox</option>
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="method">{t('payments.method')}</label>
          <select className="a-select" id="method" name="method" defaultValue={method ?? ''}>
            <option value="">{t('common.all')}</option>
            {PAYMENT_METHOD_FILTERS.map((value) => (
              <option key={value} value={value}>
                {paymentMethodName(t, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label htmlFor="from">{t('payments.from')}</label>
          <input className="a-input" id="from" name="from" type="date" defaultValue={from ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="to">{t('payments.to')}</label>
          <input className="a-input" id="to" name="to" type="date" defaultValue={to ?? ''} />
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('common.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('payments.reset')}
          </Link>
          {mayExport ? (
            // Route handler, not a page: a plain <a> so the browser downloads it.
            <a className="a-btn ghost" href={`${adminHref('/payments/export')}?${exportQuery}`}>
              {t('payments.export_csv')}
            </a>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('payments.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('payments.col_when')}</th>
              <th>{t('payments.col_order')}</th>
              <th>{t('payments.col_customer')}</th>
              <th>{t('payments.provider')}</th>
              <th>{t('payments.method')}</th>
              <th>{t('payments.col_payment')}</th>
              <th>{t('payments.col_order_status')}</th>
              <th className="num">{t('common.amount')}</th>
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
                <td>{row.email ?? <span className="a-muted">{t('payments.guest')}</span>}</td>
                <td>
                  {row.provider}
                  {row.providerPaymentId ? (
                    <div className="a-muted a-mono">{row.providerPaymentId}</div>
                  ) : null}
                </td>
                <td>{paymentMethodName(t, row.method) ?? <span className="a-muted">—</span>}</td>
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
                    {paymentStatusLabel(t, row.status)}
                  </Pill>
                </td>
                <td>
                  <OrderStatusPill status={row.orderStatus} />
                </td>
                <td className="num">{formatMoney(row.amountMinor, row.currency, intl)}</td>
                <td>
                  {row.duplicate ? (
                    <>
                      <Pill tone="warn">{t('payments.duplicate')}</Pill>
                      {mayRefund ? (
                        <form className="a-inline-form" action={refundDuplicatePayment}>
                          <input type="hidden" name="paymentId" value={row.id} />
                          <button className="a-btn danger small" type="submit">
                            {t('payments.refund_duplicate')}
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
