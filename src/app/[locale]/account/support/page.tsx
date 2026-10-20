/**
 * Phase 4: Help & support — the customer's tickets and a form to open one.
 */

import type { Metadata } from 'next'
import { desc, eq } from 'drizzle-orm'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { InputField, SelectField, TextareaField } from '@/components/bt/field'
import { Button, Tag, type TagVariant } from '@/components/shared'
import { Icon } from '@/components/ui'
import { db } from '@/db'
import { orders, supportTickets, TICKET_CATEGORIES } from '@/db/schema'
import { Link } from '@/i18n/routing'
import { requireActiveUser } from '@/lib/security/require'
import { isPrivateStorageAvailable } from '@/lib/storage'

import { toLocale } from '../../_seo-hreflang'
import { accountMetadata } from '../_lib/meta'
import { createTicketAction } from './actions'

type PageParams = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_support')
}

const STATUS_VARIANT: Record<string, TagVariant> = {
  open: 'orange',
  pending_customer: 'palm',
  resolved: 'default',
  closed: 'default',
}

export default async function SupportPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const user = await requireActiveUser('account:support')
  const query = await searchParams
  const error = typeof query.error === 'string' ? query.error : null

  const [tickets, myOrders] = await Promise.all([
    db
      .select({
        number: supportTickets.number,
        subject: supportTickets.subject,
        status: supportTickets.status,
        updatedAt: supportTickets.updatedAt,
      })
      .from(supportTickets)
      .where(eq(supportTickets.userId, user.id))
      .orderBy(desc(supportTickets.updatedAt))
      .limit(100),
    db
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt))
      .limit(50),
  ])

  return (
    <section aria-labelledby="bt-acct-support-h">
      <div className="bt-acct-sechead">
        <h1 id="bt-acct-support-h">{t('acct_support_t')}</h1>
      </div>
      <p className="muted" style={{ marginBlockEnd: 16 }}>
        {t('acct_support_b')}
      </p>

      {tickets.length === 0 ? (
        <div className="bt-acct-empty">
          <Icon name="chat" size={32} color="var(--muted)" />
          <p style={{ margin: 0, maxWidth: '40ch' }}>{t('acct_support_empty')}</p>
        </div>
      ) : (
        <div className="card bt-acct-tablewrap" style={{ marginBlockEnd: 20 }}>
          <table className="bt-acct-table">
            <caption className="bt-acct-sr">{t('acct_support_t')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('acct_support_number')}</th>
                <th scope="col">{t('acct_support_subject')}</th>
                <th scope="col">{t('acct_inv_status')}</th>
                <th scope="col">{t('acct_support_updated')}</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.number}>
                  <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    <Link href={`/account/support/${ticket.number}`}>{ticket.number}</Link>
                  </td>
                  <td data-label={t('acct_support_subject')}>{ticket.subject}</td>
                  <td data-label={t('acct_inv_status')}>
                    <Tag variant={STATUS_VARIANT[ticket.status] ?? 'default'}>
                      {t(`acct_support_st_${ticket.status}`)}
                    </Tag>
                  </td>
                  <td className="muted" data-label={t('acct_support_updated')}>
                    {format.dateTime(ticket.updatedAt, { dateStyle: 'medium' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        action={createTicketAction}
        className="card stack"
        style={{ padding: 16, gap: 12 }}
        encType="multipart/form-data"
      >
        <h2 className="h3" style={{ margin: 0 }}>
          {t('acct_support_new')}
        </h2>
        {error !== null && (
          <p role="alert" className="err" style={{ display: 'block' }}>
            {t(
              `acct_support_err_${error === 'attachment' || error === 'invalid' || error === 'rate_limited' ? error : 'failed'}`,
            )}
          </p>
        )}
        <input type="hidden" name="locale" value={locale} />
        <InputField
          id="sup-subject"
          name="subject"
          label={t('acct_support_subject')}
          required
          maxLength={200}
        />
        <SelectField
          id="sup-category"
          name="category"
          label={t('acct_support_category')}
          defaultValue="other"
          options={TICKET_CATEGORIES.map((value) => ({
            value,
            label: t(`acct_support_cat_${value}`),
          }))}
        />
        {myOrders.length > 0 && (
          <SelectField
            id="sup-order"
            name="orderNumber"
            label={t('acct_support_order')}
            placeholder={t('acct_support_no_order')}
            defaultValue=""
            options={myOrders.map((order) => ({
              value: order.orderNumber,
              label: order.orderNumber,
            }))}
          />
        )}
        <TextareaField
          id="sup-body"
          name="body"
          label={t('acct_support_message')}
          rows={5}
          required
          maxLength={10000}
        />
        {isPrivateStorageAvailable() && (
          <div className="field">
            <label htmlFor="sup-file">{t('acct_support_attachment')}</label>
            <input
              id="sup-file"
              name="attachment"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
            />
          </div>
        )}
        <div>
          <Button type="submit" variant="orange">
            {t('acct_support_send')}
          </Button>
        </div>
      </form>
    </section>
  )
}
