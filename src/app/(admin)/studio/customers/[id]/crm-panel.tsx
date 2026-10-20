import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { customerNotes, customerTags, supportTickets, users } from '@/db/schema'
import { loadStaff, loadStages } from '@/lib/crm/queries'
import { CRM_STAGES } from '@/lib/crm/stage'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import type { AdminSession } from '../../../_lib/session'
import { Field, Select, TextArea, TextInput } from '../../../_ui/field'
import { Empty, Pill, Table, When } from '../../../_ui/table'
import { NewTaskForm, TaskList, tasksFor } from '../../tasks/task-ui'
import {
  addCustomerNote,
  addCustomerTag,
  removeCustomerTag,
  setCustomerCare,
  withdrawMarketingConsent,
} from '../crm-actions'

/**
 * Customer relationship (phase 4), on the customer page: stage, who looks
 * after them, marketing consent, tags, the notes timeline, follow-up tasks and
 * support tickets. Internal — none of it is ever shown to the customer.
 */
export async function CrmPanel({ userId, viewer }: { userId: string; viewer: AdminSession }) {
  const { t } = await getAdminI18n()
  const [account] = await db
    .select({
      id: users.id,
      crmStage: users.crmStage,
      assignedToUserId: users.assignedToUserId,
      marketingConsent: users.marketingConsent,
      marketingConsentAt: users.marketingConsentAt,
      marketingConsentSource: users.marketingConsentSource,
      mergedIntoUserId: users.mergedIntoUserId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!account) return null

  const [stages, staff, tags, notes, tasks, tickets] = await Promise.all([
    loadStages([{ id: account.id, crmStage: account.crmStage }]),
    loadStaff(),
    db
      .select({ tag: customerTags.tag })
      .from(customerTags)
      .where(eq(customerTags.userId, userId))
      .orderBy(customerTags.tag),
    db
      .select({
        id: customerNotes.id,
        body: customerNotes.body,
        createdAt: customerNotes.createdAt,
        authorName: users.name,
        authorEmail: users.email,
      })
      .from(customerNotes)
      .leftJoin(users, eq(users.id, customerNotes.authorId))
      .where(eq(customerNotes.userId, userId))
      .orderBy(desc(customerNotes.createdAt))
      .limit(100),
    tasksFor({ customerId: userId }),
    db
      .select({
        id: supportTickets.id,
        number: supportTickets.number,
        subject: supportTickets.subject,
        status: supportTickets.status,
        createdAt: supportTickets.createdAt,
      })
      .from(supportTickets)
      .where(eq(supportTickets.userId, userId))
      .orderBy(desc(supportTickets.createdAt))
      .limit(25),
  ])
  const computed = stages.get(userId) ?? 'lead'
  const back = `/customers/${userId}`

  return (
    <div className="a-card" id="crm">
      <h2>{t('crm.title')}</h2>
      <p className="a-hint">{t('crm.hint')}</p>
      {account.mergedIntoUserId ? (
        <p className="a-hint">
          <Pill tone="warn">{t('crm.merged_into')}</Pill>{' '}
          <Link href={adminHref(`/customers/${account.mergedIntoUserId}`)}>
            {t('crm.open_kept')}
          </Link>
        </p>
      ) : null}

      <div className="a-cols">
        <form className="a-form" action={setCustomerCare.bind(null, userId)}>
          <h3 style={{ marginBlock: '20px 8px' }}>{t('crm.care')}</h3>
          <p>
            {t('crm.stage')}: <Pill tone="info">{t(`crm.stage_${computed}`)}</Pill>
          </p>
          <Field label={t('crm.stage_manual')} htmlFor="crmStage" hint={t('crm.stage_hint')}>
            <Select id="crmStage" name="crmStage" defaultValue={account.crmStage ?? ''}>
              <option value="">{t('crm.stage_auto')}</option>
              {CRM_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {t(`crm.stage_${stage}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('crm.assigned')} htmlFor="assignedToUserId">
            <Select
              id="assignedToUserId"
              name="assignedToUserId"
              defaultValue={account.assignedToUserId ?? ''}
            >
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
              {t('crm.save_care')}
            </button>
          </div>
        </form>

        <div>
          <h3 style={{ marginBlock: '20px 8px' }}>{t('crm.consent')}</h3>
          {account.marketingConsent ? (
            <>
              <p>
                <Pill tone="good">{t('crm.consent_yes')}</Pill>{' '}
                <span className="a-muted">
                  <When value={account.marketingConsentAt} />
                  {account.marketingConsentSource
                    ? ` · ${t(`crm.source_${account.marketingConsentSource}`)}`
                    : ''}
                </span>
              </p>
              <form action={withdrawMarketingConsent.bind(null, userId)}>
                <button className="a-btn ghost small" type="submit">
                  {t('crm.consent_withdraw')}
                </button>
              </form>
            </>
          ) : (
            <p>
              <Pill tone="neutral">{t('crm.consent_no')}</Pill>
              {account.marketingConsentAt ? (
                <span className="a-muted">
                  {' '}
                  <When value={account.marketingConsentAt} />
                </span>
              ) : null}
            </p>
          )}
          <p className="a-hint">{t('crm.consent_hint')}</p>

          <h3 style={{ marginBlock: '20px 8px' }}>{t('crm.tags')}</h3>
          <div className="a-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {tags.length === 0 ? <span className="a-muted">{t('crm.no_tags')}</span> : null}
            {tags.map(({ tag }) => (
              <form key={tag} action={removeCustomerTag.bind(null, userId, tag)}>
                <Link href={`${adminHref('/customers')}?tag=${encodeURIComponent(tag)}`}>
                  <Pill tone="info">#{tag}</Pill>
                </Link>{' '}
                <button
                  className="a-btn ghost small"
                  type="submit"
                  aria-label={t('crm.remove_tag', { tag })}
                >
                  ×
                </button>
              </form>
            ))}
          </div>
          <form
            className="a-row"
            action={addCustomerTag.bind(null, userId)}
            style={{ marginBlockStart: 8 }}
          >
            <div className="a-field">
              <label htmlFor="new-tag">{t('crm.add_tag')}</label>
              <TextInput id="new-tag" name="tag" maxLength={40} />
            </div>
            <div className="a-actions">
              <button className="a-btn ghost" type="submit">
                {t('crm.add')}
              </button>
            </div>
          </form>
        </div>
      </div>

      <h3 style={{ marginBlock: '20px 8px' }}>{t('crm.notes')}</h3>
      <form className="a-form" action={addCustomerNote.bind(null, userId)}>
        <Field label={t('crm.note')} htmlFor="crm-note">
          <TextArea id="crm-note" name="body" rows={3} required maxLength={4000} />
        </Field>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('crm.add_note')}
          </button>
        </div>
      </form>
      {notes.length === 0 ? (
        <Empty>{t('crm.no_notes')}</Empty>
      ) : (
        <ol
          className="a-timeline"
          style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}
        >
          {notes.map((note) => (
            <li key={note.id} className="a-day">
              <div className="a-muted" style={{ fontSize: 12 }}>
                {note.authorName ?? note.authorEmail ?? t('crm.removed_author')} ·{' '}
                <When value={note.createdAt} />
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{note.body}</div>
            </li>
          ))}
        </ol>
      )}

      <h3 style={{ marginBlock: '20px 8px' }}>{t('tasks.title')}</h3>
      <TaskList tasks={tasks} back={back} />
      <NewTaskForm back={back} staff={staff} defaultAssignee={viewer.userId} customerId={userId} />

      <h3 style={{ marginBlock: '20px 8px' }}>{t('support.title')}</h3>
      {tickets.length === 0 ? (
        <Empty>{t('support.empty_customer')}</Empty>
      ) : (
        <Table>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td>
                  <Link className="a-mono" href={adminHref(`/support/${ticket.id}`)}>
                    {ticket.number}
                  </Link>
                </td>
                <td>{ticket.subject}</td>
                <td>
                  <Pill tone={ticket.status === 'open' ? 'warn' : 'neutral'}>
                    {t(`support.status_${ticket.status}`)}
                  </Pill>
                </td>
                <td>
                  <When value={ticket.createdAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}
