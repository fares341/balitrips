import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { contactMessages, customTripRequests } from '@/db/schema'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { buildQuery, pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, Table, When } from '../../_ui/table'
import { CONTACT_STATUSES, LEAD_TONES, TRIP_STATUSES } from '../../_lib/lead-statuses'
import { setContactMessageStatus, setTripRequestStatus } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20
const LIST = adminHref('/leads')

const TONES = LEAD_TONES

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('leads.read')
  const params = await searchParams

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
        title="Leads"
        description="Custom trip requests and contact messages. The prototype captured neither — both forms discarded everything the visitor typed."
        actions={
          <>
            <Link
              className={`a-btn ${tab === 'trip' ? '' : 'ghost'}`}
              href={`${LIST}${buildQuery(params, { tab: 'trip', page: null })}`}
            >
              Trip requests ({tripTotal?.value ?? 0})
            </Link>
            <Link
              className={`a-btn ${tab === 'contact' ? '' : 'ghost'}`}
              href={`${LIST}${buildQuery(params, { tab: 'contact', page: null })}`}
            >
              Contact ({contactTotal?.value ?? 0})
            </Link>
          </>
        }
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <input type="hidden" name="tab" value={tab} />
        <div className="a-field">
          <label htmlFor="q">Name or email</label>
          <input className="a-input" id="q" name="q" defaultValue={q ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="status">Status</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">Any</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            Filter
          </button>
          <Link className="a-btn ghost" href={`${LIST}?tab=${tab}`}>
            Reset
          </Link>
        </div>
      </form>

      {tab === 'trip' ? (
        trips.length === 0 ? (
          <Empty>No trip requests match those filters.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Dates</th>
                <th className="num">Travellers</th>
                <th>Theme &amp; budget</th>
                <th>Notes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link href={adminHref(`/leads/${lead.id}`)}>
                      <strong>{lead.name ?? 'Unnamed'}</strong>
                    </Link>
                    <div className="a-muted">{lead.email ?? '—'}</div>
                    <div className="a-muted">{lead.phone ?? ''}</div>
                    <div className="a-muted">
                      <When value={lead.createdAt} />
                    </div>
                  </td>
                  <td className="a-mono">
                    {lead.startDate ?? '—'}
                    {lead.endDate ? ` → ${lead.endDate}` : ''}
                  </td>
                  <td className="num">{lead.travellers ?? '—'}</td>
                  <td>
                    {lead.theme ?? <span className="a-muted">—</span>}
                    <div className="a-muted">
                      {lead.budgetPerPersonMinor !== null && lead.currency
                        ? `${formatMoney(lead.budgetPerPersonMinor, lead.currency, 'en')} pp`
                        : ''}
                    </div>
                    <div className="a-muted">{(lead.interests ?? []).join(', ')}</div>
                    {lead.wantsDriver ? <Pill tone="info">wants driver</Pill> : null}
                  </td>
                  <td className="a-json">{lead.notes ?? ''}</td>
                  <td>
                    <Pill tone={TONES[lead.status] ?? 'neutral'}>{lead.status}</Pill>
                    <form
                      action={setTripRequestStatus.bind(null, lead.id)}
                      style={{ display: 'flex', gap: 6, marginBlockStart: 6 }}
                    >
                      <select className="a-select" name="status" defaultValue={lead.status}>
                        {TRIP_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <button className="a-btn ghost small" type="submit">
                        Set
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )
      ) : contacts.length === 0 ? (
        <Empty>No contact messages match those filters.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>From</th>
              <th>Subject</th>
              <th>Message</th>
              <th>Status</th>
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
                  <Pill tone={TONES[message.status] ?? 'neutral'}>{message.status}</Pill>
                  <form
                    action={setContactMessageStatus.bind(null, message.id)}
                    style={{ display: 'flex', gap: 6, marginBlockStart: 6 }}
                  >
                    <select className="a-select" name="status" defaultValue={message.status}>
                      {CONTACT_STATUSES.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <button className="a-btn ghost small" type="submit">
                      Set
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
