import Link from 'next/link'

import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Table } from '../../_ui/table'
import {
  addOrder,
  baliMonth,
  emptyTotals,
  loadByProduct,
  loadBySupplier,
  loadOrderProfit,
  profitFilters,
  type Totals,
} from './queries'

export const dynamic = 'force-dynamic'

/** الأرباح — sales, refunds, supplier costs and what is left, per currency. Admin only. */
export default async function ProfitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('finance.read')
  const { t, intl, locale } = await getAdminI18n()
  const params = await searchParams
  const { from, to, where } = profitFilters(params)

  const [orderRows, byProduct, bySupplier] = await Promise.all([
    loadOrderProfit(where),
    loadByProduct(where),
    loadBySupplier(where),
  ])

  const byCurrency = new Map<string, Totals>()
  const byMonth = new Map<string, Totals>()
  let foreignCost = 0
  for (const row of orderRows) {
    byCurrency.set(row.currency, addOrder(byCurrency.get(row.currency) ?? emptyTotals(), row))
    const key = `${baliMonth(row.placedAt)}|${row.currency}`
    byMonth.set(key, addOrder(byMonth.get(key) ?? emptyTotals(), row))
    foreignCost += row.foreignCostLines
  }
  const months = [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  const money = (minor: number, currency: string) => formatMoney(minor, currency, intl)
  const pct = (part: number, whole: number) =>
    whole === 0
      ? '—'
      : `${new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format((part / whole) * 100)}%`
  const exportQuery = new URLSearchParams(
    Object.entries({ from, to }).flatMap(([key, value]) => (value ? [[key, value]] : [])),
  ).toString()

  return (
    <>
      <PageHead
        title={t('profit.title')}
        description={t('profit.description')}
        actions={
          <a className="a-btn ghost" href={`${adminHref('/profit/export')}?${exportQuery}`}>
            {t('profit.export')}
          </a>
        }
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={adminHref('/profit')}>
        <div className="a-field">
          <label htmlFor="from">{t('profit.from')}</label>
          <input
            className="a-input"
            type="date"
            id="from"
            name="from"
            dir="ltr"
            defaultValue={from ?? ''}
          />
        </div>
        <div className="a-field">
          <label htmlFor="to">{t('profit.to')}</label>
          <input
            className="a-input"
            type="date"
            id="to"
            name="to"
            dir="ltr"
            defaultValue={to ?? ''}
          />
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('profit.show')}
          </button>
          <Link className="a-btn ghost" href={adminHref('/profit')}>
            {t('profit.all_time')}
          </Link>
        </div>
      </form>

      <div className="a-card">
        <h2>{t('profit.summary')}</h2>
        <p className="a-hint">{t('profit.summary_hint')}</p>
        {byCurrency.size === 0 ? (
          <Empty>{t('profit.empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('profit.currency')}</th>
                <th className="num">{t('profit.orders')}</th>
                <th className="num">{t('profit.sales')}</th>
                <th className="num">{t('profit.discounts')}</th>
                <th className="num">{t('profit.fees')}</th>
                <th className="num">{t('profit.tax')}</th>
                <th className="num">{t('profit.refunds')}</th>
                <th className="num">{t('profit.revenue')}</th>
                <th className="num">{t('profit.cost')}</th>
                <th className="num">{t('profit.margin')}</th>
              </tr>
            </thead>
            <tbody>
              {[...byCurrency.entries()].map(([currency, row]) => (
                <tr key={currency}>
                  <td className="a-mono">{currency}</td>
                  <td className="num">{row.orders}</td>
                  <td className="num">{money(row.sales, currency)}</td>
                  <td className="num">{money(row.discount, currency)}</td>
                  <td className="num">{money(row.fees, currency)}</td>
                  <td className="num">{money(row.tax, currency)}</td>
                  <td className="num">{money(row.refunded, currency)}</td>
                  <td className="num">
                    <strong>{money(row.revenue, currency)}</strong>
                  </td>
                  <td className="num">{money(row.cost, currency)}</td>
                  <td className="num">
                    <strong>{money(row.margin, currency)}</strong>
                    <div className="a-muted">{pct(row.margin, row.revenue)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {foreignCost > 0 ? (
          <p className="a-hint">{t('profit.foreign_cost', { count: foreignCost })}</p>
        ) : null}
      </div>

      <div className="a-card">
        <h2>{t('profit.by_month')}</h2>
        {months.length === 0 ? (
          <Empty>{t('profit.empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('profit.month')}</th>
                <th className="num">{t('profit.orders')}</th>
                <th className="num">{t('profit.revenue')}</th>
                <th className="num">{t('profit.cost')}</th>
                <th className="num">{t('profit.margin')}</th>
              </tr>
            </thead>
            <tbody>
              {months.map(([key, row]) => {
                const [month, currency = 'USD'] = key.split('|')
                return (
                  <tr key={key}>
                    <td className="a-mono">
                      {month} · {currency}
                    </td>
                    <td className="num">{row.orders}</td>
                    <td className="num">{money(row.revenue, currency)}</td>
                    <td className="num">{money(row.cost, currency)}</td>
                    <td className="num">
                      {money(row.margin, currency)}{' '}
                      <span className="a-muted">{pct(row.margin, row.revenue)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </div>

      <div className="a-card">
        <h2>{t('profit.by_product')}</h2>
        <p className="a-hint">{t('profit.by_product_hint')}</p>
        {byProduct.length === 0 ? (
          <Empty>{t('profit.empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('profit.product')}</th>
                <th className="num">{t('profit.lines')}</th>
                <th className="num">{t('profit.sales')}</th>
                <th className="num">{t('profit.refunds')}</th>
                <th className="num">{t('profit.cost')}</th>
                <th className="num">{t('profit.margin')}</th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map((row) => {
                const net = row.salesMinor - row.refundedMinor
                return (
                  <tr key={row.key}>
                    <td>
                      {pick(row.name, locale === 'ar' ? 'ar' : 'en', row.kind)}
                      <div className="a-muted">
                        {t(`profit.kind_${row.kind}`) === `profit.kind_${row.kind}`
                          ? row.kind
                          : t(`profit.kind_${row.kind}`)}{' '}
                        · {row.currency}
                      </div>
                    </td>
                    <td className="num">{row.lines}</td>
                    <td className="num">{money(row.salesMinor, row.currency)}</td>
                    <td className="num">{money(row.refundedMinor, row.currency)}</td>
                    <td className="num">{money(row.costMinor, row.currency)}</td>
                    <td className="num">
                      {money(net - row.costMinor, row.currency)}{' '}
                      <span className="a-muted">{pct(net - row.costMinor, net)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </div>

      <div className="a-card">
        <h2>{t('profit.by_supplier')}</h2>
        {bySupplier.length === 0 ? (
          <Empty>{t('profit.no_suppliers')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('profit.supplier')}</th>
                <th className="num">{t('profit.lines')}</th>
                <th className="num">{t('profit.sales')}</th>
                <th className="num">{t('profit.refunds')}</th>
                <th className="num">{t('profit.cost')}</th>
                <th className="num">{t('profit.margin')}</th>
              </tr>
            </thead>
            <tbody>
              {bySupplier.map((row) => {
                const net = row.salesMinor - row.refundedMinor
                return (
                  <tr key={`${row.supplierId}-${row.currency}`}>
                    <td>
                      <Link href={adminHref(`/suppliers/${row.supplierId}`)}>
                        {row.supplierName}
                      </Link>
                      <div className="a-muted">{row.currency}</div>
                    </td>
                    <td className="num">{row.lines}</td>
                    <td className="num">{money(row.salesMinor, row.currency)}</td>
                    <td className="num">{money(row.refundedMinor, row.currency)}</td>
                    <td className="num">{money(row.costMinor, row.currency)}</td>
                    <td className="num">
                      {money(net - row.costMinor, row.currency)}{' '}
                      <span className="a-muted">{pct(net - row.costMinor, net)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </div>
    </>
  )
}
