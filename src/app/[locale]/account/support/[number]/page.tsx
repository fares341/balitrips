/**
 * Phase 4: one support ticket, as the customer sees it — the conversation
 * (staff-only notes are never shown), a reply box, and a 1–5 rating once the
 * team has resolved it.
 */

import type { Metadata } from 'next'
import { and, asc, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { TextareaField } from '@/components/bt/field'
import { Button, Tag } from '@/components/shared'
import { db } from '@/db'
import { orders, supportTicketMessages, supportTickets } from '@/db/schema'
import { Link } from '@/i18n/routing'
import { requireActiveUser } from '@/lib/security/require'
import { isPrivateStorageAvailable } from '@/lib/storage'
import { isTicketStatus, nextTicketStatus } from '@/lib/support/tickets'

import { toLocale } from '../../../_seo-hreflang'
import { accountMetadata } from '../../_lib/meta'
import { rateTicketAction, replyTicketAction } from '../actions'

type PageParams = Promise<{ locale: string; number: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_support')
}

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale: raw, number } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const user = await requireActiveUser('account:support')
  const query = await searchParams
  if (!/^BT-T-\d{6,}$/.test(number)) notFound()

  const [row] = await db
    .select({ ticket: supportTickets, orderNumber: orders.orderNumber })
    .from(supportTickets)
    .leftJoin(orders, eq(orders.id, supportTickets.orderId))
    .where(and(eq(supportTickets.number, number), eq(supportTickets.userId, user.id)))
    .limit(1)
  if (!row) notFound()
  const { ticket } = row

  const messages = await db
    .select({
      id: supportTicketMessages.id,
      authorType: supportTicketMessages.authorType,
      body: supportTicketMessages.body,
      attachments: supportTicketMessages.attachments,
      createdAt: supportTicketMessages.createdAt,
    })
    .from(supportTicketMessages)
    .where(
      and(eq(supportTicketMessages.ticketId, ticket.id), eq(supportTicketMessages.internal, false)),
    )
    .orderBy(asc(supportTicketMessages.createdAt))

  const status = isTicketStatus(ticket.status) ? ticket.status : 'open'
  const canReply = nextTicketStatus(status, 'customer_reply') !== null
  const canRate = ticket.rating === null && nextTicketStatus(status, 'rate') !== null
  const error = typeof query.error === 'string' ? query.error : null

  return (
    <section aria-labelledby="bt-acct-ticket-h">
      <div className="bt-acct-sechead">
        <h1 id="bt-acct-ticket-h">
          {ticket.subject}{' '}
          <span className="muted" style={{ fontSize: 14, fontWeight: 600 }}>
            · {ticket.number}
          </span>
        </h1>
        <Link href="/account/support" className="btn btn-ghost">
          {t('acct_support_back')}
        </Link>
      </div>
      <p>
        <Tag variant={status === 'open' ? 'orange' : 'default'}>
          {t(`acct_support_st_${status}`)}
        </Tag>{' '}
        <span className="muted">
          {t(`acct_support_cat_${ticket.category}`)}
          {row.orderNumber ? ` · ${row.orderNumber}` : ''}
        </span>
      </p>
      {query.sent === '1' && (
        <p role="status" className="muted">
          {t('acct_support_sent')}
        </p>
      )}
      {query.rated === '1' && (
        <p role="status" className="muted">
          {t('acct_support_thanks')}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="err" style={{ display: 'block' }}>
          {t(
            `acct_support_err_${error === 'attachment' || error === 'invalid' || error === 'closed' ? error : 'failed'}`,
          )}
        </p>
      )}

      <ol className="stack" style={{ listStyle: 'none', padding: 0, gap: 10 }}>
        {messages.map((message) => (
          <li
            key={message.id}
            className="card"
            style={{
              padding: 14,
              borderInlineStart:
                message.authorType === 'staff'
                  ? '4px solid var(--forest)'
                  : '4px solid var(--line)',
            }}
          >
            <div className="muted" style={{ fontSize: 12.5 }}>
              {message.authorType === 'staff'
                ? t('acct_support_from_team')
                : t('acct_support_from_you')}{' '}
              · {format.dateTime(message.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
            <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{message.body}</p>
            {(message.attachments ?? []).map((file, index) => (
              <a
                key={file.key}
                className="btn btn-ghost"
                style={{ minHeight: 32, fontSize: 12.5, marginTop: 6 }}
                href={`/${locale}/account/support/${ticket.number}/file?m=${message.id}&i=${index}`}
              >
                {file.filename}
              </a>
            ))}
          </li>
        ))}
      </ol>

      {canRate && (
        <form
          action={rateTicketAction.bind(null, ticket.number)}
          className="card stack"
          style={{ padding: 16, gap: 10, marginTop: 16 }}
        >
          <input type="hidden" name="locale" value={locale} />
          <h2 className="h3" style={{ margin: 0 }}>
            {t('acct_support_rate_t')}
          </h2>
          <fieldset style={{ border: 0, padding: 0, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <legend className="muted" style={{ fontSize: 13 }}>
              {t('acct_support_rate_b')}
            </legend>
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className="row" style={{ gap: 4 }}>
                <input type="radio" name="rating" value={value} required /> {value}
              </label>
            ))}
          </fieldset>
          <TextareaField
            id="rate-comment"
            name="comment"
            label={t('acct_support_rate_comment')}
            rows={2}
            maxLength={2000}
          />
          <div>
            <Button type="submit" variant="ghost">
              {t('acct_support_rate_send')}
            </Button>
          </div>
        </form>
      )}

      {canReply ? (
        <form
          action={replyTicketAction.bind(null, ticket.number)}
          className="card stack"
          style={{ padding: 16, gap: 12, marginTop: 16 }}
          encType="multipart/form-data"
        >
          <input type="hidden" name="locale" value={locale} />
          <TextareaField
            id="reply-body"
            name="body"
            label={t('acct_support_reply')}
            rows={4}
            required
            maxLength={10000}
          />
          {isPrivateStorageAvailable() && (
            <div className="field">
              <label htmlFor="reply-file">{t('acct_support_attachment')}</label>
              <input
                id="reply-file"
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
      ) : (
        <p className="muted" style={{ marginTop: 16 }}>
          {t('acct_support_closed')}
        </p>
      )}
    </section>
  )
}
