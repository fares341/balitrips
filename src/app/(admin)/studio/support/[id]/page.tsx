import { asc, desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import {
  orders,
  supportSavedReplies,
  supportTicketMessages,
  supportTickets,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  users,
} from '@/db/schema'
import { loadStaff } from '@/lib/crm/queries'
import { isPrivateStorageAvailable } from '@/lib/storage'
import { isTicketStatus, nextTicketStatus } from '@/lib/support/tickets'

import { adminHref } from '../../../_lib/admin-path'
import { isUuid } from '../../../_lib/form'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { Checkbox, Field, Select } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Pill, When } from '../../../_ui/table'
import { NewTaskForm, TaskList, tasksFor } from '../../tasks/task-ui'
import { changeTicketStatus, staffReply, updateTicket } from '../actions'
import { PRIORITY_TONES, STATUS_TONES } from '../tones'
import { ReplyBox } from './reply-box'

export const dynamic = 'force-dynamic'

/** One support ticket: the conversation, the reply box and its settings. */
export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('crm.write')
  const { t } = await getAdminI18n()
  const { id } = await params
  const query = await searchParams
  if (!isUuid(id)) notFound()

  const [row] = await db
    .select({ ticket: supportTickets, orderNumber: orders.orderNumber })
    .from(supportTickets)
    .leftJoin(orders, eq(orders.id, supportTickets.orderId))
    .where(eq(supportTickets.id, id))
    .limit(1)
  if (!row) notFound()
  const { ticket } = row

  const [messages, templates, staff, tasks] = await Promise.all([
    db
      .select({
        id: supportTicketMessages.id,
        authorType: supportTicketMessages.authorType,
        body: supportTicketMessages.body,
        internal: supportTicketMessages.internal,
        attachments: supportTicketMessages.attachments,
        createdAt: supportTicketMessages.createdAt,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(supportTicketMessages)
      .leftJoin(users, eq(users.id, supportTicketMessages.authorId))
      .where(eq(supportTicketMessages.ticketId, id))
      .orderBy(asc(supportTicketMessages.createdAt)),
    db
      .select({
        id: supportSavedReplies.id,
        title: supportSavedReplies.title,
        body: supportSavedReplies.body,
      })
      .from(supportSavedReplies)
      .orderBy(desc(supportSavedReplies.updatedAt))
      .limit(100),
    loadStaff(),
    tasksFor({ customerId: ticket.userId ?? undefined, orderId: ticket.orderId ?? undefined }),
  ])
  const status = isTicketStatus(ticket.status) ? ticket.status : 'open'
  const canReply = nextTicketStatus(status, 'staff_reply') !== null
  const canAttach = isPrivateStorageAvailable()

  return (
    <>
      <PageHead
        title={`${ticket.number} · ${ticket.subject}`}
        description={t('support.detail_description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/support')}>
            {t('support.back')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      <div className="a-grid">
        <div className="a-stat">
          <b>
            <Pill tone={STATUS_TONES[status] ?? 'neutral'}>{t(`support.status_${status}`)}</Pill>
          </b>
          <span>{t('common.status')}</span>
        </div>
        <div className="a-stat">
          <b>
            <Pill tone={PRIORITY_TONES[ticket.priority] ?? 'neutral'}>
              {t(`support.priority_${ticket.priority}`)}
            </Pill>
          </b>
          <span>{t('support.priority')}</span>
        </div>
        <div className="a-stat">
          <b style={{ fontSize: 15 }}>
            <When value={ticket.firstResponseAt} />
          </b>
          <span>{t('support.first_response')}</span>
        </div>
        <div className="a-stat">
          <b>{ticket.rating === null ? '—' : `${ticket.rating} / 5`}</b>
          <span>{t('support.rating')}</span>
        </div>
      </div>

      <div className="a-cols">
        <div className="a-card">
          <h2>{t('support.customer')}</h2>
          <p>
            {ticket.userId ? (
              <Link href={adminHref(`/customers/${ticket.userId}`)}>
                {ticket.name ?? ticket.email ?? t('support.customer')}
              </Link>
            ) : (
              (ticket.name ?? '—')
            )}
          </p>
          <p className="a-mono">{ticket.email ?? '—'}</p>
          {ticket.orderId && row.orderNumber ? (
            <p>
              {t('support.order')}:{' '}
              <Link className="a-mono" href={adminHref(`/orders/${ticket.orderId}`)}>
                {row.orderNumber}
              </Link>
            </p>
          ) : null}
          <p className="a-muted">
            {t(`support.source_${ticket.source}`)} · <When value={ticket.createdAt} />
          </p>
          {ticket.ratingComment ? <p>“{ticket.ratingComment}”</p> : null}
        </div>

        <form className="a-card a-form" action={updateTicket.bind(null, id)}>
          <h2>{t('support.settings')}</h2>
          <Field label={t('support.category')} htmlFor="category">
            <Select id="category" name="category" defaultValue={ticket.category}>
              {TICKET_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`support.cat_${value}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('support.priority')} htmlFor="priority">
            <Select id="priority" name="priority" defaultValue={ticket.priority}>
              {TICKET_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {t(`support.priority_${value}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('support.assignee')} htmlFor="assigneeId">
            <Select id="assigneeId" name="assigneeId" defaultValue={ticket.assigneeId ?? ''}>
              <option value="">{t('crm.nobody')}</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="a-actions">
            <button className="a-btn" type="submit">
              {t('support.save')}
            </button>
          </div>
        </form>
      </div>

      <div className="a-card">
        <h2>{t('support.conversation')}</h2>
        <ol style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
          {messages.map((message) => (
            <li
              key={message.id}
              className="a-day"
              style={
                message.internal
                  ? { borderInlineStart: '4px solid var(--a-warn, #c98a00)' }
                  : message.authorType === 'staff'
                    ? { borderInlineStart: '4px solid var(--a-accent, #1b3f22)' }
                    : undefined
              }
            >
              <div className="a-muted" style={{ fontSize: 12 }}>
                {message.internal ? `${t('support.internal_note')} · ` : ''}
                {message.authorType === 'staff'
                  ? t('support.from_team')
                  : t('support.from_customer')}
                {message.authorName || message.authorEmail
                  ? ` · ${message.authorName ?? message.authorEmail}`
                  : ''}{' '}
                · <When value={message.createdAt} />
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div>
              {(message.attachments ?? []).map((file, index) => (
                <div key={file.key}>
                  <a
                    className="a-btn ghost small"
                    href={`${adminHref(`/support/${id}/file`)}?m=${message.id}&i=${index}`}
                  >
                    {file.filename}
                  </a>
                </div>
              ))}
            </li>
          ))}
        </ol>
      </div>

      {canReply ? (
        <form
          className="a-card a-form"
          action={staffReply.bind(null, id)}
          encType="multipart/form-data"
        >
          <h2>{t('support.reply')}</h2>
          <ReplyBox
            templates={templates}
            labels={{
              message: t('support.message'),
              savedReply: t('support.saved_reply'),
              choose: t('support.choose_saved_reply'),
            }}
          />
          {canAttach ? (
            <Field
              label={t('support.attachment')}
              htmlFor="attachment"
              hint={t('support.attachment_hint')}
            >
              <input
                id="attachment"
                name="attachment"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
              />
            </Field>
          ) : null}
          <Checkbox
            name="internal"
            label={t('support.internal')}
            hint={t('support.internal_hint')}
          />
          <Checkbox name="resolve" label={t('support.reply_and_resolve')} />
          <div className="a-actions">
            <button className="a-btn" type="submit">
              {t('support.send')}
            </button>
          </div>
        </form>
      ) : (
        <p className="a-hint">{t('support.closed_hint')}</p>
      )}

      <div className="a-card a-row">
        {(['resolve', 'reopen', 'close'] as const)
          .filter((event) => nextTicketStatus(status, event) !== null)
          .map((event) => (
            <form key={event} action={changeTicketStatus.bind(null, id)}>
              <input type="hidden" name="event" value={event} />
              <button className={event === 'close' ? 'a-btn ghost' : 'a-btn'} type="submit">
                {t(`support.do_${event}`)}
              </button>
            </form>
          ))}
      </div>

      <div className="a-card">
        <h2>{t('tasks.title')}</h2>
        <TaskList tasks={tasks} back={`/support/${id}`} />
        <NewTaskForm
          back={`/support/${id}`}
          staff={staff}
          defaultAssignee={session.userId}
          {...(ticket.userId ? { customerId: ticket.userId } : {})}
          {...(ticket.orderId ? { orderId: ticket.orderId } : {})}
        />
      </div>
    </>
  )
}
