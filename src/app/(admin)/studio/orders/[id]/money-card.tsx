import type { OrderAdjustmentLine } from '@/db/schema'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { Table, When } from '../../../_ui/table'

/**
 * Phase 4: how the order total was built (subtotal, discount code, fees, tax)
 * exactly as frozen at checkout, and the invoice issued on payment.
 */
export async function OrderMoneyCard({
  orderId,
  currency,
  subtotalMinor,
  totalMinor,
  adjustments,
  invoiceNumber,
  invoicedAt,
}: {
  orderId: string
  currency: string
  subtotalMinor: number
  totalMinor: number
  adjustments: readonly OrderAdjustmentLine[]
  invoiceNumber: string | null
  invoicedAt: Date | null
}) {
  const { t, intl, locale } = await getAdminI18n()
  const money = (minor: number) => formatMoney(minor, currency, intl)
  const pct = (bps: number | undefined) =>
    bps === undefined
      ? ''
      : ` (${new Intl.NumberFormat(intl, { maximumFractionDigits: 2 }).format(bps / 100)}%)`

  const labelOf = (line: OrderAdjustmentLine): string => {
    switch (line.kind) {
      case 'discount':
        return t('fin.adj_discount', { code: line.code ?? '' })
      case 'service_fee':
        return `${t('fin.adj_service_fee')}${pct(line.bps)}`
      case 'booking_fee':
        return t('fin.adj_booking_fee')
      case 'surcharge':
        return `${t('fin.adj_surcharge')}${pct(line.bps)}`
      case 'tax': {
        const own = line.label?.[locale === 'ar' ? 'ar' : 'en'] || line.label?.en || ''
        return `${own === '' ? t('fin.adj_tax') : own}${pct(line.bps)}`
      }
    }
  }

  return (
    <div className="a-card">
      <h2>{t('fin.order_money_title')}</h2>
      <Table>
        <tbody>
          <tr>
            <th>{t('fin.subtotal')}</th>
            <td className="num">{money(subtotalMinor)}</td>
          </tr>
          {adjustments.map((line, index) => (
            <tr key={`${line.kind}-${index}`}>
              <th>{labelOf(line)}</th>
              <td className="num">
                {line.kind === 'discount' ? '−' : '+'}
                {money(line.amountMinor)}
              </td>
            </tr>
          ))}
          <tr>
            <th>{t('fin.total_charged')}</th>
            <td className="num">
              <strong>{money(totalMinor)}</strong>
            </td>
          </tr>
          <tr>
            <th>{t('fin.invoice_number')}</th>
            <td>
              {invoiceNumber === null ? (
                <span className="a-muted">{t('fin.invoice_none')}</span>
              ) : (
                <>
                  <span className="a-mono">{invoiceNumber}</span>{' '}
                  <span className="a-muted">
                    <When value={invoicedAt} />
                  </span>{' '}
                  <a className="a-btn ghost small" href={adminHref(`/orders/${orderId}/invoice`)}>
                    {t('fin.invoice_download')}
                  </a>
                </>
              )}
            </td>
          </tr>
        </tbody>
      </Table>
      {adjustments.length === 0 ? <p className="a-hint">{t('fin.no_adjustments')}</p> : null}
    </div>
  )
}
