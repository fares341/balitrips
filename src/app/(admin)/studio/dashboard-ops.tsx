import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { analyticsEvents, orderItems, orders } from '@/db/schema'
import { can, type Role } from '@/lib/auth/roles'
import { todayInBali } from '@/lib/booking-rules'
import { studioTotal } from '@/lib/currency/studio'

import type { Translate } from '../_i18n'
import { adminHref } from '../_lib/admin-path'
import { canOpen } from '../_lib/route-access'
import { PAID_ORDER_STATUSES, payableWhere } from './payables/queries'

/**
 * Dashboard → «عمليات اليوم» (Studio v2): what needs doing today, all money
 * in SAR through the Studio helpers (#59).
 *
 *  - arrivals / departures: paid orders whose trip starts / ends today (Bali);
 *    a trip starts on its earliest line date and ends on its latest end date;
 *  - payments awaiting capture: card holds (`authorized`) not yet charged;
 *  - bookings awaiting supplier: paid lines still `pending_supplier`;
 *  - unpaid payables: what we owe suppliers (same rule as the payables screen);
 *  - funnel: visitors with a cart, a checkout and orders paid, last 30 days.
 *
 * Each figure is shown only to a role that may open the screen it links to.
 */
/** A moment `days` ago (outside the component: reading the clock is not render-pure). */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000)
}

export async function OpsKpis({ role, t, intl }: { role: Role; t: Translate; intl: string }) {
  if (!can(role, 'orders.read')) return null
  const today = todayInBali()
  const since = daysAgo(30)
  const showPayables = can(role, 'suppliers.write')
  const showFunnel = can(role, 'reports.read')

  const tripDays = db
    .select({
      orderId: orderItems.orderId,
      start: sql<string>`min(${orderItems.travelDate})`.as('start'),
      finish: sql<string>`max(coalesce(${orderItems.endDate}, ${orderItems.travelDate}))`.as(
        'finish',
      ),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(inArray(orders.status, [...PAID_ORDER_STATUSES]))
    .groupBy(orderItems.orderId)
    .as('trip_days')

  const [moves, held, awaitingSupplier, payables, funnel] = await Promise.all([
    db
      .select({
        arrivals: sql<number>`count(*) filter (where ${tripDays.start} = ${today}::date)::int`,
        departures: sql<number>`count(*) filter (where ${tripDays.finish} = ${today}::date)::int`,
      })
      .from(tripDays),
    db
      .select({
        currency: orders.presentmentCurrency,
        n: sql<number>`count(*)::int`,
        minor: sql<string>`coalesce(sum(${orders.totalMinor}), 0)::text`,
      })
      .from(orders)
      .where(eq(orders.status, 'authorized'))
      .groupBy(orders.presentmentCurrency),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.bookingStatus, 'pending_supplier'),
          inArray(orders.status, [...PAID_ORDER_STATUSES]),
        ),
      ),
    showPayables
      ? db
          .select({
            currency: orderItems.costCurrency,
            minor: sql<string>`coalesce(sum(${orderItems.costMinor}), 0)::text`,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orders.id, orderItems.orderId))
          .where(payableWhere({}))
          .groupBy(orderItems.costCurrency)
      : Promise.resolve([]),
    showFunnel
      ? Promise.all([
          db
            .select({
              cart: sql<number>`count(distinct coalesce(${analyticsEvents.anonId}, ${analyticsEvents.userId}::text)) filter (where ${analyticsEvents.name} = 'add_to_cart')::int`,
              checkout: sql<number>`count(distinct coalesce(${analyticsEvents.anonId}, ${analyticsEvents.userId}::text)) filter (where ${analyticsEvents.name} = 'begin_checkout')::int`,
            })
            .from(analyticsEvents)
            .where(gte(analyticsEvents.createdAt, since)),
          db
            .select({ paid: sql<number>`count(*)::int` })
            .from(orders)
            .where(
              and(inArray(orders.status, [...PAID_ORDER_STATUSES]), gte(orders.createdAt, since)),
            ),
        ])
      : Promise.resolve(null),
  ])

  const heldCount = held.reduce((sum, row) => sum + row.n, 0)
  const heldTotal = studioTotal(
    held.map((row) => ({ currency: row.currency, minor: Number(row.minor) })),
    intl,
    undefined,
    { short: true },
  )
  const owed = studioTotal(
    payables.map((row) => ({ currency: row.currency, minor: Number(row.minor) })),
    intl,
    undefined,
    { short: true },
  )
  const steps = funnel
    ? [
        { label: t('dashboard.funnel_cart'), n: funnel[0][0]?.cart ?? 0 },
        { label: t('dashboard.funnel_checkout'), n: funnel[0][0]?.checkout ?? 0 },
        { label: t('dashboard.funnel_paid'), n: funnel[1][0]?.paid ?? 0 },
      ]
    : null
  const top = Math.max(1, ...(steps ?? []).map((s) => s.n))

  const link = (path: string, label: string) =>
    canOpen(role, path) ? (
      <Link className="a-kpi-link" href={adminHref(path)}>
        {label}
      </Link>
    ) : null

  return (
    <section aria-labelledby="dash-ops" style={{ marginBlockStart: 18 }}>
      <h2 id="dash-ops" className="a-section-title">
        {t('dashboard.ops_t')}
      </h2>
      <div className="a-kpis">
        <div className="a-kpi">
          <span className="a-kpi-label">{t('dashboard.kpi_arrivals')}</span>
          <b className="a-kpi-value">{moves[0]?.arrivals ?? 0}</b>
          {link(`/orders`, t('dashboard.all_orders'))}
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">{t('dashboard.kpi_departures')}</span>
          <b className="a-kpi-value">{moves[0]?.departures ?? 0}</b>
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">{t('dashboard.kpi_awaiting_capture')}</span>
          <b className={heldCount > 0 ? 'a-kpi-value bad' : 'a-kpi-value'}>{heldCount}</b>
          {heldCount > 0 ? (
            <span className="a-kpi-note" dir="ltr">
              {heldTotal}
            </span>
          ) : null}
          {link('/orders?status=authorized', t('dashboard.view_all'))}
        </div>
        <div className="a-kpi">
          <span className="a-kpi-label">{t('dashboard.kpi_awaiting_supplier')}</span>
          <b className={(awaitingSupplier[0]?.n ?? 0) > 0 ? 'a-kpi-value bad' : 'a-kpi-value'}>
            {awaitingSupplier[0]?.n ?? 0}
          </b>
        </div>
        {showPayables ? (
          <div className="a-kpi">
            <span className="a-kpi-label">{t('dashboard.kpi_unpaid_payables')}</span>
            <b className="a-kpi-value" dir="ltr">
              {payables.length === 0 ? '—' : owed}
            </b>
            {link('/payables', t('dashboard.view_all'))}
          </div>
        ) : null}
      </div>
      {steps ? (
        <div className="a-card a-funnel">
          <h3>{t('dashboard.funnel_t')}</h3>
          <ol>
            {steps.map((step, i) => (
              <li key={step.label}>
                <span className="a-funnel-label">{step.label}</span>
                <span className="a-funnel-bar" aria-hidden="true">
                  <span style={{ inlineSize: `${(step.n / top) * 100}%` }} />
                </span>
                <b dir="ltr">{step.n}</b>
                {i > 0 && (steps[i - 1]?.n ?? 0) > 0 ? (
                  <small dir="ltr">{Math.round((step.n / (steps[i - 1]?.n ?? 1)) * 100)}%</small>
                ) : (
                  <small />
                )}
              </li>
            ))}
          </ol>
          <p className="a-hint">{t('dashboard.funnel_hint')}</p>
        </div>
      ) : null}
    </section>
  )
}
