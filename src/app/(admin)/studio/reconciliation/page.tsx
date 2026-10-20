import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { auditLog, orders, payments } from '@/db/schema'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, OrderStatusPill, Pill, Table, When } from '../../_ui/table'
import { PAID_STATUSES } from '../profit/queries'
import { runReconcileNow } from './actions'

export const dynamic = 'force-dynamic'

const SETTLED = ['succeeded', 'refunded', 'partially_refunded']

/**
 * مطابقة المدفوعات — where the payments and the orders disagree.
 *
 * Four checks, each a list a person can act on. The automatic sweep
 * (`order.reconcile`, every five minutes) already repairs the common case —
 * a settled payment whose order was never marked paid — so anything still
 * listed here needs a look.
 */
export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('finance.read')
  const { t, intl } = await getAdminI18n()
  const params = await searchParams

  const paymentColumns = {
    paymentId: payments.id,
    provider: payments.provider,
    providerPaymentId: payments.providerPaymentId,
    paymentStatus: payments.status,
    amountMinor: payments.amountMinor,
    currency: payments.currency,
    paidAt: payments.updatedAt,
    orderId: orders.id,
    orderNumber: orders.orderNumber,
    orderStatus: orders.status,
    totalMinor: orders.totalMinor,
    orderCurrency: orders.presentmentCurrency,
  }

  const [paidNoOrder, orderNoPayment, duplicates, mismatched, sweeps] = await Promise.all([
    db
      .select(paymentColumns)
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(eq(payments.status, 'succeeded'), inArray(orders.status, ['pending', 'cancelled'])),
      )
      .orderBy(desc(payments.updatedAt))
      .limit(100),
    db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        orderStatus: orders.status,
        totalMinor: orders.totalMinor,
        orderCurrency: orders.presentmentCurrency,
        placedAt: orders.placedAt,
      })
      .from(orders)
      .where(
        and(
          inArray(orders.status, [...PAID_STATUSES]),
          sql`${orders.totalMinor} > 0`,
          sql`not exists (select 1 from payments p where p.order_id = ${orders.id} and p.status in ('succeeded', 'refunded', 'partially_refunded'))`,
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(100),
    db
      .select({
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        orderStatus: orders.status,
        totalMinor: orders.totalMinor,
        orderCurrency: orders.presentmentCurrency,
        settledCount: sql<number>`count(${payments.id})::int`,
        settledMinor: sql<string>`sum(${payments.amountMinor})::text`,
      })
      .from(orders)
      .innerJoin(payments, eq(payments.orderId, orders.id))
      .where(inArray(payments.status, SETTLED))
      .groupBy(orders.id)
      .having(sql`count(${payments.id}) > 1`)
      .orderBy(desc(orders.createdAt))
      .limit(100),
    db
      .select(paymentColumns)
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          inArray(payments.status, SETTLED),
          sql`(${payments.amountMinor} <> ${orders.totalMinor} or ${payments.currency} <> ${orders.presentmentCurrency})`,
          // A second payment is already listed as a duplicate.
          sql`(select count(*) from payments p where p.order_id = ${orders.id} and p.status in ('succeeded', 'refunded', 'partially_refunded')) = 1`,
        ),
      )
      .orderBy(desc(payments.updatedAt))
      .limit(100),
    db
      .select({ id: auditLog.id, entityId: auditLog.entityId, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(eq(auditLog.action, 'order.reconciled'))
      .orderBy(desc(auditLog.createdAt))
      .limit(10),
  ])

  const problems =
    paidNoOrder.length + orderNoPayment.length + duplicates.length + mismatched.length
  const money = (minor: number, currency: string) => formatMoney(minor, currency, intl)
  const orderLink = (id: string, number: string) => (
    <Link className="a-mono" href={adminHref(`/orders/${id}`)}>
      {number}
    </Link>
  )

  return (
    <>
      <PageHead
        title={t('recon.title')}
        description={t('recon.description')}
        actions={
          <form action={runReconcileNow}>
            <button className="a-btn ghost" type="submit">
              {t('recon.run_now')}
            </button>
          </form>
        }
      />
      <Flash searchParams={params} />

      <div className="a-grid">
        <div className="a-stat">
          <b>
            <Pill tone={problems === 0 ? 'good' : 'warn'}>
              {problems === 0 ? t('recon.all_good') : problems}
            </Pill>
          </b>
          <span>{t('recon.problems')}</span>
        </div>
        <div className="a-stat">
          <b style={{ fontSize: 15 }}>
            {sweeps[0] ? <When value={sweeps[0].createdAt} /> : t('recon.never_repaired')}
          </b>
          <span>{t('recon.last_repair')}</span>
        </div>
      </div>

      <div className="a-card">
        <h2>{t('recon.paid_no_order')}</h2>
        <p className="a-hint">{t('recon.paid_no_order_hint')}</p>
        {paidNoOrder.length === 0 ? (
          <Empty>{t('recon.none')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('recon.order')}</th>
                <th>{t('common.status')}</th>
                <th>{t('recon.payment')}</th>
                <th className="num">{t('common.amount')}</th>
                <th>{t('recon.when')}</th>
              </tr>
            </thead>
            <tbody>
              {paidNoOrder.map((row) => (
                <tr key={row.paymentId}>
                  <td>{orderLink(row.orderId, row.orderNumber)}</td>
                  <td>
                    <OrderStatusPill status={row.orderStatus} />
                  </td>
                  <td className="a-mono">
                    {row.provider} · {row.providerPaymentId ?? '—'}
                  </td>
                  <td className="num">{money(row.amountMinor, row.currency)}</td>
                  <td>
                    <When value={row.paidAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="a-card">
        <h2>{t('recon.order_no_payment')}</h2>
        <p className="a-hint">{t('recon.order_no_payment_hint')}</p>
        {orderNoPayment.length === 0 ? (
          <Empty>{t('recon.none')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('recon.order')}</th>
                <th>{t('common.status')}</th>
                <th className="num">{t('recon.order_total')}</th>
                <th>{t('recon.when')}</th>
              </tr>
            </thead>
            <tbody>
              {orderNoPayment.map((row) => (
                <tr key={row.orderId}>
                  <td>{orderLink(row.orderId, row.orderNumber)}</td>
                  <td>
                    <OrderStatusPill status={row.orderStatus} />
                  </td>
                  <td className="num">{money(row.totalMinor, row.orderCurrency)}</td>
                  <td>
                    <When value={row.placedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="a-card">
        <h2>{t('recon.duplicates')}</h2>
        <p className="a-hint">{t('recon.duplicates_hint')}</p>
        {duplicates.length === 0 ? (
          <Empty>{t('recon.none')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('recon.order')}</th>
                <th>{t('common.status')}</th>
                <th className="num">{t('recon.payments_count')}</th>
                <th className="num">{t('recon.paid_total')}</th>
                <th className="num">{t('recon.order_total')}</th>
              </tr>
            </thead>
            <tbody>
              {duplicates.map((row) => (
                <tr key={row.orderId}>
                  <td>{orderLink(row.orderId, row.orderNumber)}</td>
                  <td>
                    <OrderStatusPill status={row.orderStatus} />
                  </td>
                  <td className="num">{row.settledCount}</td>
                  <td className="num">{money(Number(row.settledMinor), row.orderCurrency)}</td>
                  <td className="num">{money(row.totalMinor, row.orderCurrency)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="a-card">
        <h2>{t('recon.mismatch')}</h2>
        <p className="a-hint">{t('recon.mismatch_hint')}</p>
        {mismatched.length === 0 ? (
          <Empty>{t('recon.none')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('recon.order')}</th>
                <th className="num">{t('recon.paid_total')}</th>
                <th className="num">{t('recon.order_total')}</th>
                <th>{t('recon.payment')}</th>
              </tr>
            </thead>
            <tbody>
              {mismatched.map((row) => (
                <tr key={row.paymentId}>
                  <td>{orderLink(row.orderId, row.orderNumber)}</td>
                  <td className="num">{money(row.amountMinor, row.currency)}</td>
                  <td className="num">{money(row.totalMinor, row.orderCurrency)}</td>
                  <td className="a-mono">
                    {row.provider} · {row.paymentStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  )
}
