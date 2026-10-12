import { asc, desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { entitlements, orderItems, orders, payments, refunds, users } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'
import { isRefundable, type OrderStatus } from '@/lib/orders/state'
import { paymentMethodLabel } from '@/lib/payments'

import { adminHref } from '../../../_lib/admin-path'
import { requireCapability } from '../../../_lib/session'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, OrderStatusPill, Pill, Table, When } from '../../../_ui/table'
import {
  confirmOrder,
  issueReceipt,
  markOrderPaidOffline,
  refundOrderItem,
  setLineFulfilment,
} from '../actions'

export const dynamic = 'force-dynamic'

const FULFILMENT_TONES: Record<string, 'neutral' | 'good' | 'warn' | 'bad' | 'info'> = {
  pending: 'warn',
  confirmed: 'info',
  delivered: 'good',
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
        description={`${row.customerSnapshot?.name ?? order.userEmail ?? 'Guest'} · ${row.customerSnapshot?.email ?? order.userEmail ?? '—'}`}
        actions={
          <>
            <OrderStatusPill status={row.status} />
            <Link className="a-btn ghost" href={adminHref('/orders')}>
              Back to list
            </Link>
          </>
        }
      />
      <Flash searchParams={query} />

      <div className="a-grid">
        <div className="a-stat">
          <span>Total charged</span>
          <b>{formatMoney(row.totalMinor, row.presentmentCurrency, 'en')}</b>
        </div>
        <div className="a-stat">
          <span>Refunded</span>
          <b>{formatMoney(refundedTotal, row.presentmentCurrency, 'en')}</b>
        </div>
        <div className="a-stat">
          <span>Net</span>
          <b>{formatMoney(row.totalMinor - refundedTotal, row.presentmentCurrency, 'en')}</b>
        </div>
        <div className="a-stat">
          <span>Settlement</span>
          <b>
            {row.settlementTotalMinor !== null && row.settlementCurrency
              ? formatMoney(row.settlementTotalMinor, row.settlementCurrency, 'en')
              : '—'}
          </b>
        </div>
      </div>

      <div className="a-cols">
        <div className="a-card">
          <h2>Customer</h2>
          <Table>
            <tbody>
              <tr>
                <th>Name</th>
                <td>{row.customerSnapshot?.name ?? '—'}</td>
              </tr>
              <tr>
                <th>Email</th>
                <td>{row.customerSnapshot?.email ?? order.userEmail ?? '—'}</td>
              </tr>
              <tr>
                <th>Phone</th>
                <td>{row.customerSnapshot?.phone ?? '—'}</td>
              </tr>
              <tr>
                <th>Country</th>
                <td>{row.customerSnapshot?.country ?? '—'}</td>
              </tr>
              <tr>
                <th>Locale</th>
                <td>{row.customerSnapshot?.locale ?? '—'}</td>
              </tr>
            </tbody>
          </Table>
        </div>

        <div className="a-card">
          <h2>Terms and timing</h2>
          <Table>
            <tbody>
              <tr>
                <th>Placed</th>
                <td>
                  <When value={row.placedAt ?? row.createdAt} />
                </td>
              </tr>
              <tr>
                <th>Terms accepted</th>
                <td>
                  <When value={row.termsAcceptedAt} />
                </td>
              </tr>
              <tr>
                <th>Terms version</th>
                <td className="a-mono">{row.termsVersion ?? '—'}</td>
              </tr>
              <tr>
                <th>Exchange rate</th>
                <td className="a-mono">{row.exchangeRate ?? '—'}</td>
              </tr>
            </tbody>
          </Table>
          <p className="a-hint" style={{ marginBlockStart: 8 }}>
            The timestamped acceptance is the compelling evidence that wins a &ldquo;services not
            rendered&rdquo; dispute, and the window on future-dated travel runs up to ~540 days.
          </p>
        </div>
      </div>

      {mayRefund && status === 'pending' ? (
        <form className="a-card a-row" action={markOrderPaidOffline.bind(null, row.id)}>
          <h2 style={{ width: '100%', margin: 0 }}>Record an offline payment</h2>
          <p className="a-hint" style={{ width: '100%' }}>
            For a bank transfer or cash received outside the payment page. Marks the order paid,
            grants the plans in it, notifies the customer and issues the receipt.
          </p>
          <div className="a-field">
            <label htmlFor="reference">Transfer / receipt reference</label>
            <input className="a-input" id="reference" name="reference" required minLength={3} />
          </div>
          <div className="a-actions">
            <button className="a-btn accent" type="submit">
              Mark as paid
            </button>
          </div>
        </form>
      ) : null}

      {mayFulfil &&
      (status === 'paid' || status === 'confirmed' || status === 'partially_refunded') ? (
        <div className="a-card a-row">
          <h2 style={{ width: '100%', margin: 0 }}>Receipt</h2>
          <form action={issueReceipt.bind(null, row.id)}>
            <button className="a-btn ghost" type="submit">
              Issue / regenerate receipt
            </button>
          </form>
          <a className="a-btn ghost" href={adminHref(`/orders/${row.id}/receipt`)}>
            Download receipt (PDF)
          </a>
        </div>
      ) : null}

      {mayFulfil && (status === 'paid' || status === 'pending') ? (
        <form className="a-card" action={confirmOrder.bind(null, row.id)}>
          <h2>Fulfilment</h2>
          <p className="a-hint">
            Confirms the booking with the operator. Card payments reach <code>paid</code> only
            through the verified webhook; bank transfers are recorded below.
          </p>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn accent" type="submit" disabled={status !== 'paid'}>
              Confirm order
            </button>
            {status !== 'paid' ? (
              <span className="a-hint">Only a paid order can be confirmed.</span>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="a-card">
        <h2>Line items</h2>
        <Table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Travel</th>
              <th className="num">Unit</th>
              <th className="num">Qty</th>
              <th className="num">Line total</th>
              <th className="num">Refunded</th>
              <th>Fulfilment</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <strong>{pick(line.nameSnapshot, 'en', line.kind)}</strong>
                  <div className="a-muted">
                    {line.kind}
                    {line.refVersion !== null ? ` · v${line.refVersion}` : ''}
                    {line.vehicleClass ? ` · ${line.vehicleClass}` : ''}
                  </div>
                </td>
                <td className="a-mono">
                  {line.travelDate ?? '—'}
                  {line.travelTime ? ` ${line.travelTime.slice(0, 5)}` : ''}
                  {line.endDate ? ` → ${line.endDate}` : ''}
                  {line.guests !== null ? ` · ${line.guests} guest(s)` : ''}
                </td>
                <td className="num">
                  {formatMoney(line.unitPriceMinor, row.presentmentCurrency, 'en')}
                </td>
                <td className="num">{line.quantity}</td>
                <td className="num">
                  {formatMoney(line.lineTotalMinor, row.presentmentCurrency, 'en')}
                </td>
                <td className="num">
                  {formatMoney(line.refundedMinor, row.presentmentCurrency, 'en')}
                </td>
                <td>
                  <Pill tone={FULFILMENT_TONES[line.fulfilmentStatus] ?? 'neutral'}>
                    {line.fulfilmentStatus}
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
                        Mark delivered
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
          <h2>Partial refund</h2>
          {!isRefundable(status) ? (
            <p className="a-hint">
              An order in status <strong>{status.replace(/_/g, ' ')}</strong> cannot be refunded.
            </p>
          ) : (
            <>
              <p className="a-hint">
                Refund one line at a time. Amounts are integer minor units in{' '}
                {row.presentmentCurrency}. The order status is recomputed from the running total, so
                partials that add up to the full charge land on <code>refunded</code> — and a refund
                that clears map access revokes the entitlement it granted.
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
                          <div className="a-day-no">{pick(line.nameSnapshot, 'en', line.kind)}</div>
                          <span className="a-hint">
                            {formatMoney(remaining, row.presentmentCurrency, 'en')} refundable (
                            {remaining} minor units)
                          </span>
                        </div>
                        <div className="a-row">
                          <div className="a-field">
                            <label htmlFor={`amount-${line.id}`}>Amount (minor units)</label>
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
                            <label htmlFor={`reason-${line.id}`}>Reason</label>
                            <input
                              className="a-input"
                              id={`reason-${line.id}`}
                              name="reason"
                              placeholder="Recorded on the refund and in the audit log"
                            />
                          </div>
                          <div className="a-actions">
                            <button className="a-btn danger" type="submit">
                              Refund line
                            </button>
                          </div>
                        </div>
                      </form>
                    )
                  })}
                {lines.every((line) => line.refundedMinor >= line.lineTotalMinor) ? (
                  <Empty>Every line has been fully refunded.</Empty>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      <div className="a-cols">
        <div className="a-card">
          <h2>Payments</h2>
          {paymentRows.length === 0 ? (
            <Empty>No payment attempts recorded.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      {payment.provider}
                      {payment.method ? <div>{paymentMethodLabel(payment.method)}</div> : null}
                      <div className="a-mono a-muted">{payment.providerPaymentId ?? '—'}</div>
                    </td>
                    <td>
                      <Pill tone={payment.status === 'succeeded' ? 'good' : 'neutral'}>
                        {payment.status}
                      </Pill>
                    </td>
                    <td className="num">
                      {formatMoney(payment.amountMinor, payment.currency, 'en')}
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
          <h2>Refunds</h2>
          {refundRows.length === 0 ? (
            <Empty>No refunds issued.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th className="num">Amount</th>
                  <th>Reason</th>
                  <th>By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {refundRows.map((refund) => (
                  <tr key={refund.id}>
                    <td className="num">
                      {formatMoney(refund.amountMinor, refund.currency, 'en')}
                    </td>
                    <td>{refund.reason ?? <span className="a-muted">—</span>}</td>
                    <td>{refund.actorEmail ?? <span className="a-muted">system</span>}</td>
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
        <h2>Entitlements granted by this order</h2>
        {grants.length === 0 ? (
          <Empty>This order granted no entitlements.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Starts</th>
                <th>Expires</th>
                <th>Revoked</th>
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
                      <Pill tone="good">lifetime</Pill>
                    )}
                  </td>
                  <td>
                    {grant.revokedAt ? (
                      <>
                        <When value={grant.revokedAt} />
                        <div className="a-muted">{grant.revokedReason ?? ''}</div>
                      </>
                    ) : (
                      <Pill tone="good">active</Pill>
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
