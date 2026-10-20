import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import {
  activityTiers,
  entitlements,
  orderItems,
  orders,
  payments,
  refunds,
  suppliers,
  users,
} from '@/db/schema'
import { isActivityKind } from '@/lib/orders/booking-status'
import { loadOffers } from '@/lib/suppliers/offers'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { allocateMinor, formatMoney } from '@/lib/money'
import { refundCapsById } from '@/lib/finance/adjustments'
import { formatMoneyInput } from '@/lib/money-input'
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
  accessKindLabel,
  bookingStatusLabel,
  fulfilmentLabel,
  orderStatusLabel,
  paymentMethodName,
  paymentProviderName,
  paymentStatusLabel,
} from '../labels'
import { labelOr } from '../../protection/labels'
import { assignLineSupplier, confirmLineWithSupplier } from '../supplier-actions'

import { OrderMoneyCard } from './money-card'

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
  pending_availability: 'bad',
  pending_supplier: 'warn',
  in_progress: 'info',
  failed: 'bad',
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

  // Phase 2: who runs each activity line, and the offers that could.
  const tierIds = lines
    .filter((line) => line.kind === 'activity_tier' && line.refId !== null)
    .map((line) => line.refId as string)
  const tierParents = new Map(
    (tierIds.length
      ? await db
          .select({ id: activityTiers.id, activityId: activityTiers.activityId })
          .from(activityTiers)
          .where(inArray(activityTiers.id, tierIds))
      : []
    ).map((tier) => [tier.id, tier.activityId]),
  )
  const activityOf = (line: (typeof lines)[number]): string | null =>
    line.refId === null
      ? null
      : line.kind === 'activity'
        ? line.refId
        : line.kind === 'activity_tier'
          ? (tierParents.get(line.refId) ?? null)
          : null
  const supplierLines = lines.filter((line) => isActivityKind(line.kind))
  const [offersByActivity, supplierRows] = await Promise.all([
    loadOffers(supplierLines.map(activityOf).filter((value): value is string => value !== null)),
    supplierLines.length > 0
      ? db
          .select({ id: suppliers.id, name: suppliers.name, status: suppliers.status })
          .from(suppliers)
          .where(isNull(suppliers.deletedAt))
          .orderBy(asc(suppliers.name))
      : Promise.resolve([]),
  ])
  const supplierName = new Map(supplierRows.map((supplier) => [supplier.id, supplier.name]))
  // Names of suppliers removed since (still shown on the lines they ran).
  const missing = supplierLines
    .map((line) => line.supplierId)
    .filter((value): value is string => value !== null && !supplierName.has(value))
  if (missing.length > 0) {
    const gone = await db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(and(inArray(suppliers.id, missing)))
    for (const supplier of gone) supplierName.set(supplier.id, supplier.name)
  }
  const mayCost = can(session.role, 'suppliers.write')

  const row = order.order
  const status = row.status as OrderStatus
  const refundedTotal = lines.reduce((total, line) => total + line.refundedMinor, 0)
  // Phase 4: what each line can give back — its share of what was charged.
  const caps = refundCapsById(lines, row.subtotalMinor, row.totalMinor, allocateMinor)
  const capOf = (line: (typeof lines)[number]) => caps.get(line.id) ?? line.lineTotalMinor
  const mayRefund = can(session.role, 'orders.refund')
  const mayFulfil = can(session.role, 'orders.fulfil')
  const mayConfirm = can(session.role, 'bookings.confirm')

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

      <OrderMoneyCard
        orderId={row.id}
        currency={row.presentmentCurrency}
        subtotalMinor={row.subtotalMinor}
        totalMinor={row.totalMinor}
        adjustments={row.adjustments ?? []}
        invoiceNumber={row.invoiceNumber}
        invoicedAt={row.invoicedAt}
      />

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
                <td>
                  {row.customerSnapshot?.locale
                    ? labelOr(t, 'translations.lang_', row.customerSnapshot.locale)
                    : '—'}
                </td>
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

      {mayConfirm && (status === 'paid' || status === 'pending') ? (
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

      {supplierLines.length > 0 ? (
        <div className="a-card" id="suppliers">
          <h2>{t('sup.order_title')}</h2>
          <p className="a-hint">{t('sup.order_hint')}</p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              marginBlockStart: 'var(--space-3)',
            }}
          >
            {supplierLines.map((line) => {
              const activityId = activityOf(line)
              const offers = activityId ? (offersByActivity.get(activityId) ?? []) : []
              const current =
                line.supplierOfferId !== null
                  ? `offer:${line.supplierOfferId}`
                  : line.supplierId !== null
                    ? `supplier:${line.supplierId}`
                    : ''
              const sameCurrency =
                line.costMinor !== null && line.costCurrency === row.presentmentCurrency
              const margin = sameCurrency ? line.lineTotalMinor - (line.costMinor ?? 0) : null
              const paid =
                status === 'paid' || status === 'confirmed' || status === 'partially_refunded'
              return (
                <div className="a-day" key={line.id}>
                  <div className="a-day-head">
                    <div className="a-day-no">
                      {pick(line.nameSnapshot, locale, line.kind)}
                      <span className="a-muted a-mono" style={{ marginInlineStart: 8 }}>
                        {line.travelDate ?? '—'}
                        {line.travelTime ? ` ${line.travelTime.slice(0, 5)}` : ''}
                      </span>
                    </div>
                    <Pill tone={BOOKING_TONES[line.bookingStatus] ?? 'neutral'}>
                      {bookingStatusLabel(t, line.bookingStatus)}
                    </Pill>
                  </div>
                  <div className="a-row" style={{ alignItems: 'flex-start' }}>
                    <div className="a-field">
                      <span className="a-muted">{t('sup.assigned')}</span>
                      <b>
                        {line.supplierId ? (
                          <Link href={adminHref(`/suppliers/${line.supplierId}`)}>
                            {supplierName.get(line.supplierId) ?? '—'}
                          </Link>
                        ) : (
                          t('sup.none_assigned')
                        )}
                      </b>
                      {line.supplierRef ? (
                        <span className="a-hint">
                          {t('sup.supplier_ref')}:{' '}
                          <span className="a-mono">{line.supplierRef}</span>
                        </span>
                      ) : null}
                      {line.capacityHeld > 0 ? (
                        <span className="a-hint">
                          {t('sup.places_held', { count: line.capacityHeld })}
                        </span>
                      ) : null}
                    </div>
                    {mayCost ? (
                      <div className="a-field">
                        <span className="a-muted">{t('sup.cost_margin')}</span>
                        <b dir="ltr">
                          {line.costMinor !== null && line.costCurrency
                            ? formatMoney(line.costMinor, line.costCurrency, intl)
                            : '—'}
                        </b>
                        <span className="a-hint">
                          {margin !== null
                            ? t('sup.margin_value', {
                                amount: formatMoney(margin, row.presentmentCurrency, intl),
                              })
                            : line.costMinor !== null
                              ? t('sup.margin_other_currency')
                              : t('sup.margin_unknown')}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  {mayFulfil && line.settlementId === null ? (
                    <form
                      className="a-row"
                      action={assignLineSupplier.bind(null, row.id)}
                      style={{ alignItems: 'flex-end' }}
                    >
                      <input type="hidden" name="orderItemId" value={line.id} />
                      <div className="a-field">
                        <label htmlFor={`assign-${line.id}`}>{t('sup.assign_label')}</label>
                        <select
                          className="a-select"
                          id={`assign-${line.id}`}
                          name="assign"
                          defaultValue={current}
                        >
                          <option value="">{t('sup.none_assigned')}</option>
                          {offers.length > 0 ? (
                            <optgroup label={t('sup.assign_offers')}>
                              {offers.map((offer) => (
                                <option key={offer.id} value={`offer:${offer.id}`}>
                                  {`${offer.supplierName}${mayCost ? ` — ${formatMoney(offer.costMinor, offer.currency, intl)}` : ''}${offer.confirmationMode === 'instant' ? ` · ${t('sup.mode_instant')}` : ''}${offer.active && offer.supplierActive ? '' : ` · ${t('sup.offer_off')}`}`}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                          <optgroup label={t('sup.assign_any')}>
                            {supplierRows.map((supplier) => (
                              <option key={supplier.id} value={`supplier:${supplier.id}`}>
                                {supplier.name}
                                {supplier.status === 'active' ? '' : ` · ${t('sup.status_paused')}`}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                      {mayCost ? (
                        <>
                          <div className="a-field">
                            <label htmlFor={`cost-${line.id}`}>{t('sup.cost_override')}</label>
                            <input
                              className="a-input"
                              id={`cost-${line.id}`}
                              name="cost"
                              inputMode="decimal"
                              dir="ltr"
                              placeholder={t('sup.cost_override_placeholder')}
                            />
                          </div>
                          <div className="a-field">
                            <label htmlFor={`costcur-${line.id}`}>{t('common.currency')}</label>
                            <input
                              className="a-input"
                              id={`costcur-${line.id}`}
                              name="costCurrency"
                              maxLength={3}
                              dir="ltr"
                              defaultValue={line.costCurrency ?? row.presentmentCurrency}
                              style={{ textTransform: 'uppercase', maxWidth: 90 }}
                            />
                          </div>
                        </>
                      ) : null}
                      <div className="a-actions">
                        <button className="a-btn ghost small" type="submit">
                          {t('sup.assign_save')}
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {mayConfirm &&
                  paid &&
                  line.bookingStatus !== 'confirmed' &&
                  isBookingStatus(line.bookingStatus) &&
                  nextBookingStatuses(line.bookingStatus).includes('confirmed') ? (
                    <form
                      className="a-row"
                      action={confirmLineWithSupplier.bind(null, row.id)}
                      style={{ alignItems: 'flex-end' }}
                    >
                      <input type="hidden" name="orderItemId" value={line.id} />
                      <div className="a-field">
                        <label htmlFor={`ref-${line.id}`}>{t('sup.confirm_ref')}</label>
                        <input
                          className="a-input"
                          id={`ref-${line.id}`}
                          name="supplierRef"
                          dir="ltr"
                          required
                          defaultValue={line.supplierRef ?? ''}
                        />
                      </div>
                      <label className="a-muted" style={{ display: 'flex', gap: 6 }}>
                        <input type="checkbox" name="notify" defaultChecked />
                        {t('orders.booking_notify')}
                      </label>
                      <div className="a-actions">
                        <button className="a-btn accent small" type="submit">
                          {t('sup.confirm_btn')}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

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
                  .filter((line) => line.refundedMinor < capOf(line))
                  .map((line) => {
                    const remaining = capOf(line) - line.refundedMinor
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
                              inputMode="decimal"
                              dir="ltr"
                              defaultValue={formatMoneyInput(remaining, row.presentmentCurrency)}
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
                {lines.every((line) => line.refundedMinor >= capOf(line)) ? (
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
                      {paymentProviderName(t, payment.provider)}
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
                  <td>{accessKindLabel(t, grant.kind)}</td>
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
