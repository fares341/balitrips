/**
 * Invoices & payments.
 *
 * The handoff's table was `ACCT_INV`: three invented invoice numbers, three
 * dates in June 2026, three dollar amounts written as strings, and a "Paid"
 * badge hard-coded into every row regardless of anything. The download button
 * had no handler.
 *
 * Here every row is one of this user's `orders`. The status is the real one —
 * a cancelled attempt says cancelled, a refund says refunded — and the receipt
 * link goes to the order's own confirmation page, which is a real URL the
 * customer can forward to support or show to a bank.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { LinkButton, Tag, type TagVariant } from '@/components/shared'
import { Icon } from '@/components/ui'
import { Link } from '@/i18n/routing'
import { requireUser } from '@/lib/auth/session'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'
import type { OrderStatus } from '@/lib/orders/state'

import { toLocale } from '../../_seo-hreflang'
import { accountMetadata } from '../_lib/meta'
import { listInvoices } from '../_lib/queries'

const ACTIVITIES_HREF = '/activities'
const CONFIRMATION_HREF = '/checkout/confirmation'

type PageParams = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_inv')
}

/** Badge colour per status. Green is reserved for money that actually arrived. */
const STATUS_VARIANT: Record<OrderStatus, TagVariant> = {
  pending: 'default',
  paid: 'palm',
  confirmed: 'palm',
  cancelled: 'default',
  refunded: 'default',
  partially_refunded: 'orange',
}

export default async function AccountInvoicesPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const user = await requireUser()

  const items = await listInvoices(user.id)

  return (
    <section aria-labelledby="bt-acct-inv-h">
      <div className="bt-acct-sechead">
        <h1 id="bt-acct-inv-h">
          {t('acct_inv_t')}{' '}
          {items.length > 0 && (
            <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>
              · {format.number(items.length)}
            </span>
          )}
        </h1>
      </div>

      {items.length === 0 ? (
        <div className="bt-acct-empty">
          <Icon name="pdf" size={32} color="var(--muted)" />
          <p style={{ margin: 0, maxWidth: '40ch' }}>{t('acct_inv_empty')}</p>
          <LinkButton href={ACTIVITIES_HREF} variant="orange" size="sm">
            {t('ct2_browse')}
          </LinkButton>
        </div>
      ) : (
        <div className="card bt-acct-tablewrap">
          <table className="bt-acct-table">
            <caption className="bt-acct-sr">{t('acct_inv_t')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('acct_inv_num')}</th>
                <th scope="col">{t('acct_inv_date')}</th>
                <th scope="col">{t('acct_inv_item')}</th>
                <th scope="col" className="num">
                  {t('acct_inv_amt')}
                </th>
                <th scope="col">{t('acct_inv_status')}</th>
                <th scope="col">
                  <span className="bt-acct-sr">{t('acct_inv_receipt')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const summary =
                  item.summary === null ? t('cf_items') : pick(item.summary, locale, t('cf_items'))
                const extra = item.itemCount > 1 ? ` +${format.number(item.itemCount - 1)}` : ''

                return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{item.orderNumber}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {format.dateTime(item.date, { dateStyle: 'medium' })}
                    </td>
                    <td>
                      {summary}
                      {extra !== '' && <span className="muted">{extra}</span>}
                    </td>
                    <td className="num">{formatMoney(item.totalMinor, item.currency, locale)}</td>
                    <td>
                      <Tag variant={STATUS_VARIANT[item.status]} style={{ whiteSpace: 'nowrap' }}>
                        {t(`cf_st_${item.status}`)}
                      </Tag>
                    </td>
                    <td style={{ textAlign: 'end' }}>
                      {/*
                        A real, linkable receipt. The handoff's "Download"
                        button had no handler and there was no order behind it
                        to download.
                      */}
                      <Link
                        href={`${CONFIRMATION_HREF}/${item.orderNumber}`}
                        className="btn btn-ghost"
                        style={{ minHeight: 36, fontSize: 12.5, padding: '6px 12px' }}
                      >
                        <Icon name="pdf" size={14} />
                        {t('acct_inv_receipt')}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
