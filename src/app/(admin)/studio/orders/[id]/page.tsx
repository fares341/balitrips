import { asc, desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { entitlements, orderItems, orders, payments, refunds, users } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'
import { isBookingStatus, nextBookingStatuses } from '@/lib/orders/booking-status'
import { isRefundable, type OrderStatus } from '@/lib/orders/state'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, OrderStatusPill, Pill, Table, When } from '../../../_ui/table'
import {
  confirmOrder,
  issueReceipt,
  markOrderPaidOffline,
  refundOrderItem,
  sendItineraryPdfWhatsapp,
  setBookingStatus,
  setLineFulfilment,
} from '../actions'
import {
  bookingStatusLabel,
  fulfilmentLabel,
  orderStatusLabel,
  paymentMethodName,
  paymentStatusLabel,
} from '../labels'

export const dynamic = 'force-dynamic'

const FULFILMENT_TONES: Record<string, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  pending: 'warn',
  confirmed: 'info',
  delivered: 'good',
  cancelled: 'bad',
  refunded: 'bad',
}

/** Booking ladder (provider status) tones. "Confirmed" is the provider's word only. */
const BOOKING_TONES: Record<string, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  created: 'neutral',
  sent_to_provider: 'warn',
  confirmed: 'good',
  completed: 'good',
  cancel_requested: 'warn',
  cancelled: 'bad',
  refunded: 'bad',
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('orders.read')
  const { t, intl, locale } = await getAdminI18n()
  const { id } = await params
  const query = await searchParams

  const [order] = await db
    .select({
      order: orders,
      userEmail: users.email,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, id))
    .limit(1)

  if (!order) notFound()

  const [lines, paymentRows, refundRows, grants] = await Promise.all([
    db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id))
      .orderBy(asc(orderItems.createdAt)),
    db.select().from(payments).where(eq(payments.orderId, id)).orderBy(desc(payments.createdAt)),
    db
      .select({
        id: refunds.id,
        amountMinor: refunds.amountMinor,
        currency: refunds.currency,
        reason: refunds.reason,
        status: refunds.status,
        createdAt: refunds.createdAt,
        orderItemId: refunds.orderItemId,
        actorEmail: users.email,
      })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .leftJoin(users, eq(users.id, refunds.actorId))
      .where(eq(payments.orderId, id))
      .orderBy(desc(refunds.createdAt)),
    db.select().from(entitlements).where(eq(entitlements.grantedByOrderId, id)),
  ])

  const row = order.order
  const status = row.status as OrderStatus
  const refundedTotal = lines.reduce((total, line) => total + line.refundedMinor, 0)
  const mayRefund = can(session.role, 'orders.refund')
  const mayFulfil = can(session.role, 'orders.fulfil')

  return (
    <>
      <PageHead
        title={row.orderNumber}
        description={`${row.customerSnapshot?.name ?? order.userEmail ?? t('orders.guest')} · ${row.customerSnapshot?.email ?? order.userEmail ?? '—'}`}
        actions={
          <>
            <OrderStatusPill status={row.status} />
            <Link className="a-btn ghost" href={adminHref('/orders')}>
              {t('orders.back_to_list')}
            </Link>
          </>
        }
      />
      <Flash searchParams={query} />

      <div className="a-grid">
        <div className="a-stat">
          <span>{t('orders.stat_total_charged')}</span>
          <b>{formatMoney(row.totalMinor, row.presentmentCurrency, intl)}</b>
        </div>
        <div className="a-stat">
          <span>{t('orders.stat_refunded')}</span>
          <b>{formatMoney(refundedTotal, row.presentmentCurrency, intl)}</b>
        </div>
        <div className="a-stat">
          <span>{t('orders.stat_net')}</span>
          <b>{formatMoney(row.totalMinor - refundedTotal, row.presentmentCurrency, intl)}</b>
        </div>
        <div className="a-stat">
          <span>{t('orders.stat_settlement')}</span>
          <b>
            {row.settlementTotalMinor !== null && row.settlementCurrency
              ? formatMoney(row.settlementTotalMinor, row.settlementCurrency, intl)
              : '—'}
          </b>
        </div>
      </div>

      <div className="a-cols">
        <div className="a-card">
          <h2>{t('orders.col_customer')}</h2>
          <Table>
            <tbody>
              <tr>
                <th>{t('common.name')}</th>
                <td>{row.customerSnapshot?.name ?? '—'}</td>
              </tr>
              <tr>
                <th>{t('common.email')}</th>
                <td>{row.customerSnapshot?.email ?? order.userEmail ?? '—'}</td>
              </tr>
              <tr>
                <th>{t('common.phone')}</th>
                <td>{row.customerSnapshot?.phone ?? '—'}</td>
              </tr>
              <tr>
                <th>{t('common.country')}</th>
                <td>{row.customerSnapshot?.country ?? '—'}</td>
              </tr>
              <tr>
                <th>{t('common.language')}</th>
                <td>{row.customerSnapshot?.locale ?? '—'}</td>
              </tr>
            </tbody>
          </Table>
        </div>

        <div className="a-card">
          <h2>{t('orders.terms_heading')}</h2>
          <Table>
            <tbody>
              <tr>
                <th>{t('orders.col_placed')}</th>
                <td>
                  <When value={row.placedAt ?? row.createdAt} />
                </td>
              </tr>
              <tr>
                <th>{t('orders.field_terms_accepted')}</th>
                <td>
                  <When value={row.termsAcceptedAt} />
                </td>
              </tr>
              <tr>
                <th>{t('orders.field_terms_version')}</th>
                <td className="a-mono">{row.termsVersion ?? '—'}</td>
              </tr>
              <tr>
                <th>{t('orders.field_exchange_rate')}</th>
                <td className="a-mono">{row.exchangeRate ?? '—'}</td>
              </tr>
            </tbody>
          </Table>
          <p className="a-hint" style={{ marginBlockStart: 8 }}>
            {t('orders.terms_hint')}
          </p>
        </div>
      </div>

      {mayRefund && status === 'pending' ? (
        <form className="a-card a-row" action={markOrderPaidOffline.bind(null, row.id)}>
          <h2 style={{ width: '100%', margin: 0 }}>{t('orders.offline_heading')}</h2>
          <p className="a-hint" style={{ width: '100%' }}>
            {t('orders.offline_hint')}
          </p>
          <div className="a-field">
            <label htmlFor="reference">{t('orders.offline_reference')}</label>
            <input className="a-input" id="reference" name="reference" required minLength={3} />
          </div>
          <div className="a-actions">
            <button className="a-btn accent" type="submit">
              {t('orders.offline_submit')}
            </button>
          </div>
        </form>
      ) : null}

      {mayFulfil &&
      (status === 'paid' || status === 'confirmed' || status === 'partially_refunded') ? (
        <div className="a-card a-row">
          <h2 style={{ width: '100%', margin: 0 }}>{t('orders.receipt_heading')}</h2>
          <form action={issueReceipt.bind(null, row.id)}>
            <button className="a-btn ghost" type="submit">
              {t('orders.receipt_issue')}
            </button>
          </form>
          <a className="a-btn ghost" href={adminHref(`/orders/${row.id}/receipt`)}>
            {t('orders.receipt_download')}
          </a>
        </div>
      ) : null}

      {mayFulfil && (status === 'paid' || status === 'pending') ? (
        <form className="a-card" action={confirmOrder.bind(null, row.id)}>
          <h2>{t('orders.fulfilment_heading')}</h2>
          <p className="a-hint">{t('orders.fulfilment_hint')}</p>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn accent" type="submit" disabled={status !== 'paid'}>
              {t('orders.confirm_btn')}
            </button>
            {status !== 'paid' ? (
              <span className="a-hint">{t('orders.confirm_only_paid')}</span>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="a-card">
        <h2>{t('orders.lines_heading')}</h2>
        <Table>
          <thead>
            <tr>
              <th>{t('orders.col_item')}</th>
              <th>{t('orders.col_travel')}</th>
              <th className="num">{t('orders.col_unit')}</th>
              <th className="num">{t('orders.col_qty')}</th>
              <th className="num">{t('orders.col_line_total')}</th>
              <th className="num">{t('orders.col_refunded')}</th>
              <th>{t('orders.col_fulfilment')}</th>
              <th>{t('orders.col_booking')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <strong>{pick(line.nameSnapshot, locale, line.kind)}</strong>
                  <div className="a-muted">
                    {line.kind}
                    {line.refVersion !== null ? ` · v${line.refVersion}` : ''}
                    {line.vehicleClass ? ` · ${line.vehicleClass}` : ''}
                  </div>
                </td>
                <td className="a-mono">
                  {line.travelDate ?? '—'}
                  {line.travelTime ? ` ${line.travelTime.slice(0, 5)}` : ''}
                  {line.endDate ? ` – ${line.endDate}` : ''}
                  {line.guests !== null
                    ? ` · ${t('orders.guests_count', { count: line.guests })}`
                    : ''}
                </td>
                <td className="num">
                  {formatMoney(line.unitPriceMinor, row.presentmentCurrency, intl)}
                </td>
                <td className="num">{line.quantity}</td>
                <td className="num">
                  {formatMoney(line.lineTotalMinor, row.presentmentCurrency, intl)}
                </td>
                <td className="num">
                  {formatMoney(line.refundedMinor, row.presentmentCurrency, intl)}
                </td>
                <td>
                  <Pill tone={FULFILMENT_TONES[line.fulfilmentStatus] ?? 'neutral'}>
                    {fulfilmentLabel(t, line.fulfilmentStatus)}
                  </Pill>
                  {mayFulfil && line.fulfilmentStatus !== 'refunded' ? (
                    <form
                      className="a-inline-form"
                      action={setLineFulfilment.bind(null, row.id, line.id, 'delivered')}
                    >
                      <button
                        className="a-btn ghost small"
                        type="submit"
                        style={{ marginBlockStart: 6 }}
                      >
                        {t('orders.mark_delivered')}
                      </button>
                    </form>
                  ) : null}
                  {mayFulfil &&
                  line.kind === 'itinerary' &&
                  row.userId !== null &&
                  line.fulfilmentStatus !== 'refunded' &&
                  line.fulfilmentStatus !== 'cancelled' ? (
                    <form
                      className="a-inline-form"
                      action={sendItineraryPdfWhatsapp.bind(null, row.id, line.id)}
                    >
                      <button
                        className="a-btn ghost small"
                        type="submit"
                        style={{ marginBlockStart: 6 }}
                        title={t('orders.whatsapp_title')}
                      >
                        {t('orders.whatsapp_btn')}
                      </button>
                    </form>
                  ) : null}
                </td>
                <td>
                  <Pill tone={BOOKING_TONES[line.bookingStatus] ?? 'neutral'}>
                    {bookingStatusLabel(t, line.bookingStatus)}
                  </Pill>
                  {line.bookingStatusAt !== null ? (
                    <div className="a-muted">
                      <When value={line.bookingStatusAt} />
                    </div>
                  ) : null}
                  {mayFulfil &&
                  isBookingStatus(line.bookingStatus) &&
                  nextBookingStatuses(line.bookingStatus).length > 0 ? (
                    <form
                      className="a-inline-form"
                      action={setBookingStatus.bind(null, row.id)}
                      style={{ display: 'grid', gap: 6, marginBlockStart: 6 }}
                    >
                      <input type="hidden" name="orderItemId" value={line.id} />
                      <label className="a-muted" htmlFor={`bs-${line.id}`}>
                        {t('orders.booking_move_to')}
                      </label>
                      <select className="a-input" id={`bs-${line.id}`} name="bookingStatus">
                        {nextBookingStatuses(line.bookingStatus).map((next) => (
                          <option key={next} value={next}>
                            {bookingStatusLabel(t, next)}
                          </option>
                        ))}
                      </select>
                      <label className="a-muted" style={{ display: 'flex', gap: 6 }}>
                        <input type="checkbox" name="notify" defaultChecked />
                        {t('orders.booking_notify')}
                      </label>
                      <button className="a-btn ghost small" type="submit">
                        {t('orders.booking_save')}
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      {mayRefund ? (
        <div className="a-card">
          <h2>{t('orders.refund_heading')}</h2>
          {!isRefundable(status) ? (
            <p className="a-hint">
              {t('orders.not_refundable', { status: orderStatusLabel(t, status) })}
            </p>
          ) : (
            <>
              <p className="a-hint">
                {t('orders.refund_hint', { currency: row.presentmentCurrency })}
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                  marginBlockStart: 'var(--space-4)',
                }}
              >
                {lines
                  .filter((line) => line.refundedMinor < line.lineTotalMinor)
                  .map((line) => {
                    const remaining = line.lineTotalMinor - line.refundedMinor
                    return (
                      <form
                        className="a-day"
                        key={line.id}
                        action={refundOrderItem.bind(null, row.id)}
                      >
                        <input type="hidden" name="orderItemId" value={line.id} />
                        <div className="a-day-head">
                          <div className="a-day-no">
                            {pick(line.nameSnapshot, locale, line.kind)}
                          </div>
                          <span className="a-hint">
                            {t('orders.refundable', {
                              amount: formatMoney(remaining, row.presentmentCurrency, intl),
                              minor: remaining,
                            })}
                          </span>
                        </div>
                        <div className="a-row">
                          <div className="a-field">
                            <label htmlFor={`amount-${line.id}`}>{t('orders.refund_amount')}</label>
                            <input
                              className="a-input"
                              id={`amount-${line.id}`}
                              name="amountMinor"
                              inputMode="numeric"
                              defaultValue={String(remaining)}
                              required
                            />
                          </div>
                          <div className="a-field">
                            <label htmlFor={`reason-${line.id}`}>{t('orders.refund_reason')}</label>
                            <input
                              className="a-input"
                              id={`reason-${line.id}`}
                              name="reason"
                              placeholder={t('orders.refund_reason_placeholder')}
                            />
                          </div>
                          <div className="a-actions">
                            <button className="a-btn danger" type="submit">
                              {t('orders.refund_line_btn')}
                            </button>
                          </div>
                        </div>
                      </form>
                    )
                  })}
                {lines.every((line) => line.refundedMinor >= line.lineTotalMinor) ? (
                  <Empty>{t('orders.all_refunded')}</Empty>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      <div className="a-cols">
        <div className="a-card">
          <h2>{t('orders.payments_heading')}</h2>
          {paymentRows.length === 0 ? (
            <Empty>{t('orders.payments_empty')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{t('orders.col_provider')}</th>
                  <th>{t('common.status')}</th>
                  <th className="num">{t('common.amount')}</th>
                  <th>{t('common.created')}</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      {payment.provider}
                      {payment.method ? <div>{paymentMethodName(t, payment.method)}</div> : null}
                      <div className="a-mono a-muted">{payment.providerPaymentId ?? '—'}</div>
                    </td>
                    <td>
                      <Pill tone={payment.status === 'succeeded' ? 'good' : 'neutral'}>
                        {paymentStatusLabel(t, payment.status)}
                      </Pill>
                    </td>
                    <td className="num">
                      {formatMoney(payment.amountMinor, payment.currency, intl)}
                    </td>
                    <td>
                      <When value={payment.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>

        <div className="a-card">
          <h2>{t('orders.refunds_heading')}</h2>
          {refundRows.length === 0 ? (
            <Empty>{t('orders.refunds_empty')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th className="num">{t('common.amount')}</th>
                  <th>{t('orders.col_reason')}</th>
                  <th>{t('orders.col_by')}</th>
                  <th>{t('orders.col_when')}</th>
                </tr>
              </thead>
              <tbody>
                {refundRows.map((refund) => (
                  <tr key={refund.id}>
                    <td className="num">
                      {formatMoney(refund.amountMinor, refund.currency, intl)}
                    </td>
                    <td>{refund.reason ?? <span className="a-muted">—</span>}</td>
                    <td>
                      {refund.actorEmail ?? <span className="a-muted">{t('orders.system')}</span>}
                    </td>
                    <td>
                      <When value={refund.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>

      <div className="a-card">
        <h2>{t('orders.grants_heading')}</h2>
        {grants.length === 0 ? (
          <Empty>{t('orders.grants_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('orders.col_kind')}</th>
                <th>{t('orders.col_starts')}</th>
                <th>{t('orders.col_expires')}</th>
                <th>{t('orders.col_revoked')}</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((grant) => (
                <tr key={grant.id}>
                  <td className="a-mono">{grant.kind}</td>
                  <td>
                    <When value={grant.startsAt} />
                  </td>
                  <td>
                    {grant.expiresAt ? (
                      <When value={grant.expiresAt} />
                    ) : (
                      <Pill tone="good">{t('orders.lifetime')}</Pill>
                    )}
                  </td>
                  <td>
                    {grant.revokedAt ? (
                      <>
                        <When value={grant.revokedAt} />
                        <div className="a-muted">{grant.revokedReason ?? ''}</div>
                      </>
                    ) : (
                      <Pill tone="good">{t('orders.active')}</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  )
}
