import { and, desc, eq, gte, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import Link from 'next/link'

import { db } from '@/db'
import {
  supportSavedReplies,
  supportTickets,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  users,
} from '@/db/schema'
import { averageHours, TICKET_STATUSES } from '@/lib/support/tickets'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { buildQuery, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Field, Select, TextArea, TextInput } from '../../_ui/field'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table, When } from '../../_ui/table'
import { deleteReplyTemplate, openTicketForCustomer, saveReplyTemplate } from './actions'
import { PRIORITY_TONES, STATUS_TONES } from './tones'

export const dynamic = 'force-dynamic'

const VIEWS = ['active', ...TICKET_STATUSES, 'mine', 'templates'] as const
type View = (typeof VIEWS)[number]

const assignee = alias(users, 'ticket_assignee')

function daysAgo(days: number): Date {
  const at = new Date()
  at.setTime(at.getTime() - days * 86_400_000)
  return at
}

/** الدعم — customer support tickets, saved replies and response times. */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('crm.write')
  const { t } = await getAdminI18n()
  const params = await searchParams
  const raw = param(params, 'view')
  const view: View = (VIEWS as readonly string[]).includes(raw ?? '') ? (raw as View) : 'active'

  const where: SQL | undefined =
    view === 'active'
      ? sql`${supportTickets.status} in ('open', 'pending_customer')`
      : view === 'mine'
        ? and(
            eq(supportTickets.assigneeId, session.userId),
            sql`${supportTickets.status} in ('open', 'pending_customer')`,
          )
        : view === 'templates'
          ? undefined
          : eq(supportTickets.status, view)

  const since = daysAgo(30)
  const [tickets, recent, counts, templates] = await Promise.all([
    view === 'templates'
      ? Promise.resolve([])
      : db
          .select({
            id: supportTickets.id,
            number: supportTickets.number,
            subject: supportTickets.subject,
            category: supportTickets.category,
            priority: supportTickets.priority,
            status: supportTickets.status,
            name: supportTickets.name,
            email: supportTickets.email,
            createdAt: supportTickets.createdAt,
            updatedAt: supportTickets.updatedAt,
            firstResponseAt: supportTickets.firstResponseAt,
            assigneeName: sql<string | null>`coalesce(${assignee.name}, ${assignee.email})`,
          })
          .from(supportTickets)
          .leftJoin(assignee, eq(assignee.id, supportTickets.assigneeId))
          .where(where)
          .orderBy(
            sql`case ${supportTickets.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
            desc(supportTickets.updatedAt),
          )
          .limit(200),
    db
      .select({
        createdAt: supportTickets.createdAt,
        firstResponseAt: supportTickets.firstResponseAt,
        resolvedAt: supportTickets.resolvedAt,
        rating: supportTickets.rating,
      })
      .from(supportTickets)
      .where(gte(supportTickets.createdAt, since)),
    db
      .select({ status: supportTickets.status, n: sql<number>`count(*)::int` })
      .from(supportTickets)
      .groupBy(supportTickets.status),
    view === 'templates'
      ? db.select().from(supportSavedReplies).orderBy(supportSavedReplies.title)
      : Promise.resolve([]),
  ])

  const countOf = (status: string) => counts.find((row) => row.status === status)?.n ?? 0
  const firstResponse = averageHours(
    recent.map((r) => ({ from: r.createdAt, to: r.firstResponseAt })),
  )
  const resolution = averageHours(recent.map((r) => ({ from: r.createdAt, to: r.resolvedAt })))
  const ratings = recent.map((r) => r.rating).filter((r): r is number => r !== null)
  const rating =
    ratings.length === 0
      ? null
      : Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
  const hours = (value: number | null) =>
    value === null ? '—' : t('support.hours', { count: value })

  return (
    <>
      <PageHead title={t('support.title')} description={t('support.description')} />
      <Flash searchParams={params} />

      <div className="a-grid">
        <div className="a-stat">
          <b>{countOf('open')}</b>
          <span>{t('support.status_open')}</span>
        </div>
        <div className="a-stat">
          <b>{countOf('pending_customer')}</b>
          <span>{t('support.status_pending_customer')}</span>
        </div>
        <div className="a-stat">
          <b>{hours(firstResponse)}</b>
          <span>{t('support.stat_first_response')}</span>
        </div>
        <div className="a-stat">
          <b>{hours(resolution)}</b>
          <span>{t('support.stat_resolution')}</span>
        </div>
        <div className="a-stat">
          <b>{rating === null ? '—' : `${rating} / 5`}</b>
          <span>{t('support.stat_rating', { count: ratings.length })}</span>
        </div>
      </div>

      <nav className="a-tabs" aria-label={t('support.views')}>
        {VIEWS.map((value) => (
          <Link
            key={value}
            className="a-tab"
            aria-current={value === view ? 'page' : undefined}
            href={`${adminHref('/support')}${buildQuery(params, { view: value })}`}
          >
            {t(`support.view_${value}`)}
          </Link>
        ))}
      </nav>

      {view === 'templates' ? (
        <>
          <div className="a-card">
            <h2>{t('support.templates')}</h2>
            <p className="a-hint">{t('support.templates_hint')}</p>
            {templates.length === 0 ? (
              <Empty>{t('support.templates_empty')}</Empty>
            ) : (
              <Table>
                <tbody>
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td>
                        <strong>{template.title}</strong>
                        <div className="a-muted" style={{ whiteSpace: 'pre-wrap' }}>
                          {template.body}
                        </div>
                      </td>
                      <td>
                        <form action={deleteReplyTemplate.bind(null, template.id)}>
                          <button className="a-btn ghost small" type="submit">
                            {t('support.template_delete')}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
          <form className="a-card a-form" action={saveReplyTemplate}>
            <h2>{t('support.template_new')}</h2>
            <Field label={t('support.template_title')} htmlFor="tpl-title" required>
              <TextInput id="tpl-title" name="title" required maxLength={120} />
            </Field>
            <Field label={t('support.template_body')} htmlFor="tpl-body" required>
              <TextArea id="tpl-body" name="body" rows={5} required maxLength={5000} />
            </Field>
            <div className="a-actions">
              <button className="a-btn" type="submit">
                {t('support.template_save')}
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          <div className="a-card">
            {tickets.length === 0 ? (
              <Empty>{t('support.empty')}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>{t('support.ticket')}</th>
                    <th>{t('support.customer')}</th>
                    <th>{t('support.priority')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('support.assignee')}</th>
                    <th>{t('support.updated')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td>
                        <Link href={adminHref(`/support/${ticket.id}`)}>
                          <span className="a-mono">{ticket.number}</span> · {ticket.subject}
                        </Link>
                        <div className="a-muted">{t(`support.cat_${ticket.category}`)}</div>
                      </td>
                      <td>
                        {ticket.name ?? '—'}
                        <div className="a-muted">{ticket.email ?? ''}</div>
                      </td>
                      <td>
                        <Pill tone={PRIORITY_TONES[ticket.priority] ?? 'neutral'}>
                          {t(`support.priority_${ticket.priority}`)}
                        </Pill>
                      </td>
                      <td>
                        <Pill tone={STATUS_TONES[ticket.status] ?? 'neutral'}>
                          {t(`support.status_${ticket.status}`)}
                        </Pill>
                        {ticket.firstResponseAt === null && ticket.status === 'open' ? (
                          <div className="a-muted">{t('support.no_answer_yet')}</div>
                        ) : null}
                      </td>
                      <td>{ticket.assigneeName ?? <span className="a-muted">—</span>}</td>
                      <td>
                        <When value={ticket.updatedAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>

          <form className="a-card a-form" action={openTicketForCustomer}>
            <h2>{t('support.open_for_customer')}</h2>
            <p className="a-hint">{t('support.open_for_customer_hint')}</p>
            <div className="a-row">
              <Field label={t('common.email')} htmlFor="new-email" required>
                <TextInput id="new-email" name="email" type="email" dir="ltr" required />
              </Field>
              <Field label={t('support.subject')} htmlFor="new-subject" required>
                <TextInput id="new-subject" name="subject" required maxLength={200} />
              </Field>
              <Field label={t('support.category')} htmlFor="new-category">
                <Select id="new-category" name="category" defaultValue="other">
                  {TICKET_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {t(`support.cat_${value}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('support.priority')} htmlFor="new-priority">
                <Select id="new-priority" name="priority" defaultValue="normal">
                  {TICKET_PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {t(`support.priority_${value}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t('support.message')} htmlFor="new-body" required>
              <TextArea id="new-body" name="body" rows={4} required maxLength={10000} />
            </Field>
            <div className="a-actions">
              <button className="a-btn" type="submit">
                {t('support.open_ticket')}
              </button>
            </div>
          </form>
        </>
      )}
    </>
  )
}
