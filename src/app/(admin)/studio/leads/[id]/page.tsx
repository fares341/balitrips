import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { customTripDocuments, customTripRequests, users } from '@/db/schema'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../../_lib/admin-path'
import { isUuid } from '../../../_lib/form'
import { LEAD_TONES, TRIP_STATUSES } from '../../../_lib/lead-statuses'
import { requireCapability } from '../../../_lib/session'
import { Field, TextArea, TextInput } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pill, Table, When } from '../../../_ui/table'
import { setTripRequestStatus } from '../actions'
import {
  linkRequestToUser,
  saveRequestNotes,
  uploadCustomPdf,
  withdrawCustomPdf,
} from '../request-actions'

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('leads.read')
  const { id } = await params
  const query = await searchParams
  if (!isUuid(id)) notFound()

  const [row] = await db
    .select({ request: customTripRequests, account: users.email })
    .from(customTripRequests)
    .leftJoin(users, eq(users.id, customTripRequests.userId))
    .where(eq(customTripRequests.id, id))
    .limit(1)
  if (!row) notFound()
  const { request } = row

  const docs = await db
    .select({ doc: customTripDocuments, by: users.email })
    .from(customTripDocuments)
    .leftJoin(users, eq(users.id, customTripDocuments.uploadedBy))
    .where(eq(customTripDocuments.requestId, id))
    .orderBy(desc(customTripDocuments.version))

  const facts: [string, string][] = [
    ['E-mail', request.email ?? '—'],
    ['Phone', request.phone ?? '—'],
    ['Dates', `${request.startDate ?? '—'}${request.endDate ? ` → ${request.endDate}` : ''}`],
    ['Travellers', String(request.travellers ?? '—')],
    ['Trip type', request.theme ?? '—'],
    [
      'Budget per person',
      request.budgetPerPersonMinor !== null && request.currency
        ? formatMoney(request.budgetPerPersonMinor, request.currency, 'en')
        : '—',
    ],
    ['Interests', (request.interests ?? []).join(', ') || '—'],
    ['Wants driver', request.wantsDriver ? 'yes' : 'no'],
    ['Children', request.hasChildren ? 'yes' : 'no'],
    ['Wants VIP map', request.wantsVipMap ? 'yes' : 'no'],
    ['Luxury restaurants', request.wantsLuxuryDining ? 'yes' : 'no'],
    ['Adventure', request.wantsAdventure ? 'yes' : 'no'],
    ['Preferred areas', (request.preferredAreas ?? []).join(', ') || '—'],
  ]

  return (
    <>
      <PageHead
        title={`Custom trip — ${request.name ?? 'Unnamed'}`}
        description="Upload a personal PDF; it is delivered to the traveller's account watermarked with their details, never as a direct link."
        actions={
          <Link className="a-btn ghost" href={adminHref('/leads')}>
            Back to leads
          </Link>
        }
      />
      <Flash searchParams={query} />

      <div className="a-card">
        <h2>
          Request <Pill tone={LEAD_TONES[request.status] ?? 'neutral'}>{request.status}</Pill>
        </h2>
        <Table>
          <tbody>
            {facts.map(([label, value]) => (
              <tr key={label}>
                <th style={{ width: 200 }}>{label}</th>
                <td>{value}</td>
              </tr>
            ))}
            <tr>
              <th>Traveller notes</th>
              <td className="a-json">{request.notes ?? '—'}</td>
            </tr>
            <tr>
              <th>Received</th>
              <td>
                <When value={request.createdAt} />
              </td>
            </tr>
          </tbody>
        </Table>
        <form
          action={setTripRequestStatus.bind(null, id)}
          className="a-row"
          style={{ marginBlockStart: 12 }}
        >
          <input type="hidden" name="back" value="detail" />
          <select
            className="a-select"
            name="status"
            defaultValue={request.status}
            aria-label="Status"
          >
            {TRIP_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <button className="a-btn" type="submit">
            Update status
          </button>
          <span className="a-hint">
            The traveller is notified when the request is linked to an account.
          </span>
        </form>
      </div>

      <div className="a-card">
        <h2>Account</h2>
        {row.account ? (
          <p>
            Linked to <strong>{row.account}</strong>.{' '}
            <Link href={adminHref(`/customers/${request.userId}`)}>Customer page →</Link>
          </p>
        ) : (
          <form action={linkRequestToUser.bind(null, id)} className="a-row">
            <Field
              label="Account e-mail"
              htmlFor="email"
              hint="Guest requests must be linked before the traveller can open an uploaded plan."
            >
              <TextInput id="email" name="email" defaultValue={request.email ?? ''} />
            </Field>
            <div className="a-actions">
              <button className="a-btn" type="submit">
                Link
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="a-card">
        <h2>Plan PDF</h2>
        <form
          action={uploadCustomPdf.bind(null, id)}
          className="a-row"
          encType="multipart/form-data"
        >
          <div className="a-field">
            <label htmlFor="file">PDF (max 20 MB)</label>
            <input
              className="a-input"
              id="file"
              name="file"
              type="file"
              accept="application/pdf"
              required
            />
          </div>
          <div className="a-actions">
            <button className="a-btn" type="submit">
              Upload &amp; notify
            </button>
          </div>
        </form>
        {docs.length === 0 ? (
          <Empty>No plan uploaded yet.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Version</th>
                <th>File</th>
                <th>Uploaded</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map(({ doc, by }) => (
                <tr key={doc.id}>
                  <td>v{doc.version}</td>
                  <td>
                    {doc.filename}
                    <div className="a-muted">{Math.round(doc.bytes / 1024)} KB</div>
                  </td>
                  <td>
                    <When value={doc.createdAt} />
                    <div className="a-muted">{by ?? '—'}</div>
                  </td>
                  <td>
                    {doc.withdrawnAt ? (
                      <Pill tone="neutral">withdrawn</Pill>
                    ) : (
                      <Pill tone="good">delivered</Pill>
                    )}
                  </td>
                  <td>
                    {doc.withdrawnAt ? null : (
                      <form action={withdrawCustomPdf.bind(null, id)} className="a-inline-form">
                        <input type="hidden" name="documentId" value={doc.id} />
                        <button className="a-btn danger small" type="submit">
                          Withdraw
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <form className="a-card" action={saveRequestNotes.bind(null, id)}>
        <h2>Internal notes</h2>
        <Field label="Only staff see these" htmlFor="adminNotes">
          <TextArea
            id="adminNotes"
            name="adminNotes"
            rows={5}
            defaultValue={request.adminNotes ?? ''}
          />
        </Field>
        <div className="a-actions">
          <button className="a-btn ghost" type="submit">
            Save notes
          </button>
        </div>
      </form>
    </>
  )
}
