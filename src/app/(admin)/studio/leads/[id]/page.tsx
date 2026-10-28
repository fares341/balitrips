import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { customTripDocuments, customTripRequests, orders, users } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { loadStaff } from '@/lib/crm/queries'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../../_lib/admin-path'
import { isUuid } from '../../../_lib/form'
import { getAdminI18n } from '../../../_lib/i18n'
import { LEAD_TONES, TRIP_STATUSES } from '../../../_lib/lead-statuses'
import { requireCapability } from '../../../_lib/session'
import { Field, MoneyField, TextArea, TextInput } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pill, Table, When } from '../../../_ui/table'
import { setTripRequestStatus } from '../actions'
import { NewTaskForm, TaskList, tasksFor } from '../../tasks/task-ui'
import { assignLead } from '../assign-actions'
import { budgetLabel } from '../budget'
import {
  linkRequestToUser,
  saveRequestNotes,
  sendCustomPdfWhatsapp,
  setCustomQuote,
  uploadCustomPdf,
  withdrawCustomPdf,
} from '../request-actions'
import { StudioLink } from '../../../_ui/studio-link'

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
  const { t, intl } = await getAdminI18n()
  /** Stored status → label; an unknown value shows as stored. */
  const statusLabel = (value: string) =>
    t(`leads.status_${value}`) === `leads.status_${value}` ? value : t(`leads.status_${value}`)
  const yesNo = (value: boolean | null) => (value ? t('leads.yes') : t('leads.no'))
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

  const mayCrm = can(session.role, 'crm.write')
  // The bookings operator reads leads but not the customers list.
  const mayCustomers = can(session.role, 'customers.read')
  const [staff, leadTasks] = mayCrm
    ? await Promise.all([loadStaff(), tasksFor({ leadId: id })])
    : [[], []]

  const docs = await db
    .select({ doc: customTripDocuments, by: users.email })
    .from(customTripDocuments)
    .leftJoin(users, eq(users.id, customTripDocuments.uploadedBy))
    .where(eq(customTripDocuments.requestId, id))
    .orderBy(desc(customTripDocuments.version))

  const facts: [string, string][] = [
    [t('leads.email'), request.email ?? '—'],
    [t('leads.phone'), request.phone ?? '—'],
    [
      t('leads.dates'),
      `${request.startDate ?? '—'}${request.endDate ? ` – ${request.endDate}` : ''}`,
    ],
    [t('leads.days'), request.days === null ? '—' : String(request.days)],
    [t('leads.travellers'), String(request.travellers ?? '—')],
    [t('leads.trip_type'), request.theme ?? '—'],
    // Package request (client, Oct 2026): the vehicle and the estimate shown.
    ...(request.packageId !== null
      ? ([
          [t('veh.lead_vehicle'), request.vehicleKey ?? '—'],
          [
            t('veh.lead_estimate'),
            request.estimateMinor === null
              ? '—'
              : formatMoney(request.estimateMinor, request.estimateCurrency ?? 'USD', intl),
          ],
        ] as [string, string][])
      : []),
    [t('leads.budget'), budgetLabel(t, intl, request)],
    [t('leads.interests'), (request.interests ?? []).join(', ') || '—'],
    [t('leads.wants_driver'), yesNo(request.wantsDriver)],
    [t('leads.children'), yesNo(request.hasChildren)],
    [t('leads.wants_vip_map'), yesNo(request.wantsVipMap)],
    [t('leads.luxury_dining'), yesNo(request.wantsLuxuryDining)],
    [t('leads.adventure'), yesNo(request.wantsAdventure)],
    [t('leads.preferred_areas'), (request.preferredAreas ?? []).join(', ') || '—'],
  ]

  return (
    <>
      <PageHead
        title={t('leads.detail_title', { name: request.name ?? t('leads.unnamed') })}
        description={t('leads.detail_description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/leads')}>
            {t('leads.back')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      <div className="a-card">
        <h2>
          {t('leads.request')}{' '}
          <Pill tone={LEAD_TONES[request.status] ?? 'neutral'}>{statusLabel(request.status)}</Pill>
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
              <th>{t('leads.traveller_notes')}</th>
              <td className="a-json">{request.notes ?? '—'}</td>
            </tr>
            <tr>
              <th>{t('leads.received')}</th>
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
            aria-label={t('leads.status')}
          >
            {TRIP_STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
          <button className="a-btn" type="submit">
            {t('leads.update_status')}
          </button>
          <span className="a-hint">{t('leads.status_hint')}</span>
        </form>
      </div>

      <div className="a-card">
        <h2>{t('leads.account')}</h2>
        {row.account ? (
          <p>
            {t('leads.linked_to')} <strong>{row.account}</strong>.{' '}
            {mayCustomers ? (
              <Link href={adminHref(`/customers/${request.userId}`)}>
                {t('leads.customer_page')}
              </Link>
            ) : null}
          </p>
        ) : (
          <form action={linkRequestToUser.bind(null, id)} className="a-row">
            <Field label={t('leads.account_email')} htmlFor="email" hint={t('leads.link_hint')}>
              <TextInput id="email" name="email" defaultValue={request.email ?? ''} />
            </Field>
            <div className="a-actions">
              <button className="a-btn" type="submit">
                {t('leads.link')}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="a-card" id="quote">
        <h2>
          {t('leads.price')}{' '}
          {request.paidOrderId !== null ? (
            <Pill tone="good">{t('leads.paid')}</Pill>
          ) : request.quoteMinor !== null ? (
            <Pill tone="info">{t('leads.quoted')}</Pill>
          ) : (
            <Pill tone="neutral">{t('leads.no_quote')}</Pill>
          )}
        </h2>
        {request.quoteMinor !== null && request.quoteCurrency !== null ? (
          <p>
            <strong>{formatMoney(request.quoteMinor, request.quoteCurrency, intl)}</strong>
            {request.quotedAt ? (
              <>
                {' '}
                · {t('leads.quoted_on')} <When value={request.quotedAt} />
              </>
            ) : null}
            {request.paidOrderId !== null ? (
              <>
                {' '}
                · {t('leads.paid_with')}{' '}
                <StudioLink
                  role={session.role}
                  path={`/orders/${request.paidOrderId}`}
                  className="a-mono"
                >
                  {row.paidOrderNumber ?? t('leads.order')}
                </StudioLink>
              </>
            ) : null}
          </p>
        ) : (
          <p className="a-muted">{t('leads.no_price_hint')}</p>
        )}
        {mayQuote && request.paidOrderId === null ? (
          <form action={setCustomQuote.bind(null, id)} className="a-row">
            <MoneyField
              minorName="quoteMinor"
              currencyName="quoteCurrency"
              minor={request.quoteMinor ?? request.estimateMinor}
              currency={
                request.quoteCurrency ?? request.estimateCurrency ?? request.currency ?? 'USD'
              }
            />
            <div className="a-actions">
              <button className="a-btn" type="submit">
                {t('leads.save_price')}
              </button>
            </div>
          </form>
        ) : null}
        {mayQuote && request.paidOrderId === null && request.quoteMinor !== null ? (
          <form action={setCustomQuote.bind(null, id)} className="a-inline-form">
            <input type="hidden" name="quoteMinor" value="" />
            <button className="a-btn ghost small" type="submit">
              {t('leads.withdraw_price')}
            </button>
          </form>
        ) : null}
        {!mayQuote ? <p className="a-hint">{t('leads.price_managers_only')}</p> : null}
      </div>

      <div className="a-card">
        <h2>{t('leads.plan_pdf')}</h2>
        <form
          action={uploadCustomPdf.bind(null, id)}
          className="a-row"
          encType="multipart/form-data"
        >
          <div className="a-field">
            <label htmlFor="file">{t('leads.pdf_label')}</label>
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
              <input type="checkbox" name="alsoWhatsapp" defaultChecked />{' '}
              {t('leads.also_whatsapp')}
            </label>
            <span className="a-hint">
              {row.whatsappOptIn ? t('leads.whatsapp_hint_on') : t('leads.whatsapp_hint_off')}
            </span>
          </div>
          <div className="a-actions">
            <button className="a-btn" type="submit">
              {t('leads.upload')}
            </button>
          </div>
        </form>
        {docs.length === 0 ? (
          <Empty>{t('leads.no_docs')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('leads.version')}</th>
                <th>{t('leads.file')}</th>
                <th>{t('leads.uploaded')}</th>
                <th>{t('leads.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map(({ doc, by }) => (
                <tr key={doc.id}>
                  <td>v{doc.version}</td>
                  <td>
                    {doc.filename}
                    <div className="a-muted">
                      {new Intl.NumberFormat(intl).format(Math.round(doc.bytes / 1024))} KB
                    </div>
                  </td>
                  <td>
                    <When value={doc.createdAt} />
                    <div className="a-muted">{by ?? '—'}</div>
                  </td>
                  <td>
                    {doc.withdrawnAt ? (
                      <Pill tone="neutral">{t('leads.withdrawn')}</Pill>
                    ) : (
                      <Pill tone="good">{t('leads.delivered')}</Pill>
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
                            {t('leads.send_whatsapp')}
                          </button>
                        </form>
                        <form action={withdrawCustomPdf.bind(null, id)} className="a-inline-form">
                          <input type="hidden" name="documentId" value={doc.id} />
                          <button className="a-btn danger small" type="submit">
                            {t('leads.withdraw')}
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

      {mayCrm ? (
        <div className="a-card">
          <h2>{t('crm.follow_up')}</h2>
          <form className="a-row" action={assignLead.bind(null, id)}>
            <div className="a-field">
              <label htmlFor="lead-assignee">{t('crm.assigned')}</label>
              <select
                className="a-select"
                id="lead-assignee"
                name="assignedToUserId"
                defaultValue={request.assignedToUserId ?? ''}
              >
                <option value="">{t('crm.nobody')}</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="a-actions">
              <button className="a-btn" type="submit">
                {t('crm.save_care')}
              </button>
              {request.paidOrderId === null ? (
                <a className="a-btn ghost" href="#quote">
                  {t('crm.convert_to_quote')}
                </a>
              ) : null}
            </div>
          </form>
          <p className="a-hint">{t('crm.convert_hint')}</p>
          {request.userId !== null && mayCustomers ? (
            <p>
              <Link href={adminHref(`/customers/${request.userId}`)}>{t('crm.open_customer')}</Link>
            </p>
          ) : null}
          <h3>{t('tasks.title')}</h3>
          <TaskList tasks={leadTasks} back={`/leads/${id}`} />
          <NewTaskForm
            back={`/leads/${id}`}
            staff={staff}
            defaultAssignee={session.userId}
            leadId={id}
            {...(request.userId !== null ? { customerId: request.userId } : {})}
          />
        </div>
      ) : null}

      <form className="a-card" action={saveRequestNotes.bind(null, id)}>
        <h2>{t('leads.internal_notes')}</h2>
        <Field label={t('leads.internal_notes_label')} htmlFor="adminNotes">
          <TextArea
            id="adminNotes"
            name="adminNotes"
            rows={5}
            defaultValue={request.adminNotes ?? ''}
          />
        </Field>
        <div className="a-actions">
          <button className="a-btn ghost" type="submit">
            {t('leads.save_notes')}
          </button>
        </div>
      </form>
    </>
  )
}
