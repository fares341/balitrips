import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { customTripDocuments, customTripRequests, orders, users } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../../_lib/admin-path'
import { isUuid } from '../../../_lib/form'
import { LEAD_TONES, TRIP_STATUSES } from '../../../_lib/lead-statuses'
import { requireCapability } from '../../../_lib/session'
import { Field, MoneyField, TextArea, TextInput } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pill, Table, When } from '../../../_ui/table'
import { setTripRequestStatus } from '../actions'
import {
  linkRequestToUser,
  saveRequestNotes,
  sendCustomPdfWhatsapp,
  setCustomQuote,
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
  const session = await requireCapability('leads.read')
  const mayQuote = can(session.role, 'config.write') || can(session.role, 'orders.refund')
  const { id } = await params
  const query = await searchParams
  if (!isUuid(id)) notFound()

  const [row] = await db
    .select({
      request: customTripRequests,
      account: users.email,
      whatsappOptIn: users.whatsappOptIn,
      paidOrderNumber: orders.orderNumber,
    })
    .from(customTripRequests)
    .leftJoin(users, eq(users.id, customTripRequests.userId))
    .leftJoin(orders, eq(orders.id, customTripRequests.paidOrderId))
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
    ['Days', request.days === null ? '—' : String(request.days)],
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
        <h2>
          Price{' '}
          {request.paidOrderId !== null ? (
            <Pill tone="good">paid</Pill>
          ) : request.quoteMinor !== null ? (
            <Pill tone="info">quoted</Pill>
          ) : (
            <Pill tone="neutral">no quote</Pill>
          )}
        </h2>
        {request.quoteMinor !== null && request.quoteCurrency !== null ? (
          <p>
            <strong>{formatMoney(request.quoteMinor, request.quoteCurrency, 'en')}</strong>
            {request.quotedAt ? (
              <>
                {' '}
                · quoted <When value={request.quotedAt} />
              </>
            ) : null}
            {request.paidOrderId !== null ? (
              <>
                {' '}
                · paid with{' '}
                <Link href={adminHref(`/orders/${request.paidOrderId}`)} className="a-mono">
                  {row.paidOrderNumber ?? 'order'}
                </Link>
              </>
            ) : null}
          </p>
        ) : (
          <p className="a-muted">
            No price yet. Once set, the traveller sees it in their account with a Pay button.
          </p>
        )}
        {mayQuote && request.paidOrderId === null ? (
          <form action={setCustomQuote.bind(null, id)} className="a-row">
            <MoneyField
              minorName="quoteMinor"
              currencyName="quoteCurrency"
              minor={request.quoteMinor}
              currency={request.quoteCurrency ?? request.currency ?? 'USD'}
            />
            <div className="a-actions">
              <button className="a-btn" type="submit">
                Save price &amp; notify
              </button>
            </div>
          </form>
        ) : null}
        {mayQuote && request.paidOrderId === null && request.quoteMinor !== null ? (
          <form action={setCustomQuote.bind(null, id)} className="a-inline-form">
            <input type="hidden" name="quoteMinor" value="" />
            <button className="a-btn ghost small" type="submit">
              Withdraw price
            </button>
          </form>
        ) : null}
        {!mayQuote ? (
          <p className="a-hint">Only managers with orders or configuration rights set prices.</p>
        ) : null}
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
          <div className="a-field">
            <label>
              <input type="checkbox" name="alsoWhatsapp" defaultChecked /> Also send on WhatsApp
            </label>
            <span className="a-hint">
              {row.whatsappOptIn
                ? 'Sends a link to the secure viewer in their account.'
                : 'The traveller has not opted in to WhatsApp (or the request is not linked); only in-site and e-mail will be sent.'}
            </span>
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
                      <div className="a-row">
                        <form
                          action={sendCustomPdfWhatsapp.bind(null, id)}
                          className="a-inline-form"
                        >
                          <input type="hidden" name="documentId" value={doc.id} />
                          <button className="a-btn small" type="submit">
                            Send via WhatsApp
                          </button>
                        </form>
                        <form action={withdrawCustomPdf.bind(null, id)} className="a-inline-form">
                          <input type="hidden" name="documentId" value={doc.id} />
                          <button className="a-btn danger small" type="submit">
                            Withdraw
                          </button>
                        </form>
                      </div>
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
