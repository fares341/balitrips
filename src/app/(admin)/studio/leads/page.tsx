import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { can } from '@/lib/auth/roles'
import { contactMessages, customTripRequests } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { buildQuery, pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, Table, When } from '../../_ui/table'
import { CONTACT_STATUSES, LEAD_TONES, TRIP_STATUSES } from '../../_lib/lead-statuses'
import { setContactMessageStatus, setTripRequestStatus } from './actions'
import { budgetLabel } from './budget'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20
const LIST = adminHref('/leads')

const TONES = LEAD_TONES

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('leads.read')
  const params = await searchParams
  const { t, intl } = await getAdminI18n()
  /** Stored status → label; an unknown value shows as stored. */
  const statusLabel = (value: string) =>
    t(`leads.status_${value}`) === `leads.status_${value}` ? value : t(`leads.status_${value}`)

  const tab = param(params, 'tab') === 'contact' ? 'contact' : 'trip'
  const q = param(params, 'q')
  const status = param(params, 'status')
  const page = pageParam(params)

  const tripFilters: SQL[] = []
  const contactFilters: SQL[] = []

  if (q) {
    const like = `%${q}%`
    const tripMatch = or(
      ilike(customTripRequests.name, like),
      ilike(customTripRequests.email, like),
    )
    if (tripMatch) tripFilters.push(tripMatch)
    const contactMatch = or(ilike(contactMessages.name, like), ilike(contactMessages.email, like))
    if (contactMatch) contactFilters.push(contactMatch)
  }
  if (status && (TRIP_STATUSES as readonly string[]).includes(status)) {
    tripFilters.push(eq(customTripRequests.status, status))
  }
  if (status && (CONTACT_STATUSES as readonly string[]).includes(status)) {
    contactFilters.push(eq(contactMessages.status, status))
  }
  const STATUSES = tab === 'contact' ? CONTACT_STATUSES : TRIP_STATUSES

  const tripWhere = tripFilters.length > 0 ? and(...tripFilters) : undefined
  const contactWhere = contactFilters.length > 0 ? and(...contactFilters) : undefined

  const [trips, [tripTotal], contacts, [contactTotal]] = await Promise.all([
    tab === 'trip'
      ? db
          .select()
          .from(customTripRequests)
          .where(tripWhere)
          .orderBy(desc(customTripRequests.createdAt))
          .limit(PAGE_SIZE)
          .offset((page - 1) * PAGE_SIZE)
      : Promise.resolve([]),
    db.select({ value: count() }).from(customTripRequests).where(tripWhere),
    tab === 'contact'
      ? db
          .select()
          .from(contactMessages)
          .where(contactWhere)
          .orderBy(desc(contactMessages.createdAt))
          .limit(PAGE_SIZE)
          .offset((page - 1) * PAGE_SIZE)
      : Promise.resolve([]),
    db.select({ value: count() }).from(contactMessages).where(contactWhere),
  ])

  return (
    <>
      <PageHead
        title={t('leads.title')}
        description={t('leads.description')}
        actions={
          <>
            <Link
              className={`a-btn ${tab === 'trip' ? '' : 'ghost'}`}
              href={`${LIST}${buildQuery(params, { tab: 'trip', page: null })}`}
            >
              {t('leads.tab_trips', { count: tripTotal?.value ?? 0 })}
            </Link>
            <Link
              className={`a-btn ${tab === 'contact' ? '' : 'ghost'}`}
              href={`${LIST}${buildQuery(params, { tab: 'contact', page: null })}`}
            >
              {t('leads.tab_contact', { count: contactTotal?.value ?? 0 })}
            </Link>
            {can(session.role, 'customers.export') ? (
              <a className="a-btn ghost" href={adminHref('/leads/export')}>
                {t('crm.export_leads')}
              </a>
            ) : null}
          </>
        }
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <input type="hidden" name="tab" value={tab} />
        <div className="a-field">
          <label htmlFor="q">{t('leads.search')}</label>
          <input className="a-input" id="q" name="q" defaultValue={q ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="status">{t('leads.status')}</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">{t('leads.any')}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('leads.filter')}
          </button>
          <Link className="a-btn ghost" href={`${LIST}?tab=${tab}`}>
            {t('leads.reset')}
          </Link>
        </div>
      </form>

      {tab === 'trip' ? (
        trips.length === 0 ? (
          <Empty>{t('leads.empty_trips')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('leads.col_contact')}</th>
                <th>{t('leads.dates')}</th>
                <th className="num">{t('leads.travellers')}</th>
                <th>{t('leads.col_theme_budget')}</th>
                <th>{t('leads.col_notes')}</th>
                <th>{t('leads.status')}</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link href={adminHref(`/leads/${lead.id}`)}>
                      <strong>{lead.name ?? t('leads.unnamed')}</strong>
                    </Link>
                    <div className="a-muted">{lead.email ?? '—'}</div>
                    <div className="a-muted">{lead.phone ?? ''}</div>
                    <div className="a-muted">
                      <When value={lead.createdAt} />
                    </div>
                  </td>
                  <td className="a-mono">
                    {lead.startDate ?? '—'}
                    {lead.endDate ? ` – ${lead.endDate}` : ''}
                  </td>
                  <td className="num">{lead.travellers ?? '—'}</td>
                  <td>
                    {lead.theme ?? <span className="a-muted">—</span>}
                    <div className="a-muted">{budgetLabel(t, intl, lead)}</div>
                    <div className="a-muted">{(lead.interests ?? []).join(', ')}</div>
                    {lead.wantsDriver ? (
                      <Pill tone="info">{t('leads.wants_driver_tag')}</Pill>
                    ) : null}
                  </td>
                  <td className="a-json">{lead.notes ?? ''}</td>
                  <td>
                    <Pill tone={TONES[lead.status] ?? 'neutral'}>{statusLabel(lead.status)}</Pill>
                    <form
                      action={setTripRequestStatus.bind(null, lead.id)}
                      style={{ display: 'flex', gap: 6, marginBlockStart: 6 }}
                    >
                      <select className="a-select" name="status" defaultValue={lead.status}>
                        {TRIP_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {statusLabel(value)}
                          </option>
                        ))}
                      </select>
                      <button className="a-btn ghost small" type="submit">
                        {t('leads.set')}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      ) : contacts.length === 0 ? (
        <Empty>{t('leads.empty_contact')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('leads.col_from')}</th>
              <th>{t('leads.col_subject')}</th>
              <th>{t('leads.col_message')}</th>
              <th>{t('leads.status')}</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((message) => (
              <tr key={message.id}>
                <td>
                  <strong>{message.name}</strong>
                  <div className="a-muted">{message.email}</div>
                  <div className="a-muted">
                    <When value={message.createdAt} />
                  </div>
                </td>
                <td>{message.subject ?? <span className="a-muted">—</span>}</td>
                <td className="a-json">{message.message}</td>
                <td>
                  <Pill tone={TONES[message.status] ?? 'neutral'}>
                    {statusLabel(message.status)}
                  </Pill>
                  <form
                    action={setContactMessageStatus.bind(null, message.id)}
                    style={{ display: 'flex', gap: 6, marginBlockStart: 6 }}
                  >
                    <select className="a-select" name="status" defaultValue={message.status}>
                      {CONTACT_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {statusLabel(value)}
                        </option>
                      ))}
                    </select>
                    <button className="a-btn ghost small" type="submit">
                      {t('leads.set')}
                    </button>
                  </form>
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
        total={tab === 'trip' ? (tripTotal?.value ?? 0) : (contactTotal?.value ?? 0)}
      />
    </>
  )
}
