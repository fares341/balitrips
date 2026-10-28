import { and, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import {
  activityLog,
  contactMessages,
  customTripRequests,
  devices,
  entitlements,
  favorites,
  mapPlaces,
  orderItems,
  orders,
  securityAlerts,
  users,
} from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { liveModeIssues } from '@/lib/live-mode'
import { can } from '@/lib/auth/roles'
import { formatMoney } from '@/lib/money'
import { ORDER_STATUSES } from '@/lib/orders/state'
import { AUTHORIZATION_DAYS } from '@/lib/orders/capture'
import { isUrgent, timeLeftParts } from '@/lib/orders/supplier-wait'

import { buildOverview } from '@/lib/reports/builders/overview'
import { currencyOptions, staffOptions, supplierOptions } from '@/lib/reports/data'
import { parseReportFilters } from '@/lib/reports/filters'

import { adminHref } from '../_lib/admin-path'
import { getAdminI18n } from '../_lib/i18n'
import { LEAD_STATUS_KEYS, LEAD_TONES } from '../_lib/lead-statuses'
import { canOpenHref } from '../_lib/route-access'
import { requireCapability } from '../_lib/session'
import { Advanced } from '../_ui/advanced'
import { Flash } from '../_ui/flash'
import { Icon, type IconName } from '../_ui/icons'
import { FilterBar } from '../_ui/reports/filter-bar'
import { ReportBody } from '../_ui/reports/report-view'
import { Empty, OrderStatusPill, Pill, Table, When } from '../_ui/table'
import { buildContext } from './reports/access'

export const dynamic = 'force-dynamic'

/** Bali is UTC+8 all year (no DST). */
const BALI_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * Dashboard — the operator's home.
 *
 * Top to bottom: who you are and what day it is, what needs a person right
 * now (each line links straight to the filtered list), the handful of
 * numbers that describe today, then recent activity and slower-moving
 * insights further down.
 *
 * Revenue is grouped by currency. Summing across currencies would produce a
 * number that means nothing — the platform sells into several regions and
 * there is no implied dollar anywhere in this system.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('admin.access')
  const params = await searchParams
  const { t, intl, locale } = await getAdminI18n()

  const mayReadOrders = can(session.role, 'orders.read')
  const mayReadLeads = can(session.role, 'leads.read')
  const mayReadCustomers = can(session.role, 'customers.read')
  const mayReadSecurity = can(session.role, 'security.read')

  // الوثيقة (لوحة التحكم 1): عدد المستخدمين، الجداول المباعة، مستخدمو الخريطة،
  // أكثر الأماكن مشاهدة وحفظاً، أحدث المستخدمين، تنبيهات الأمان.
  const PAID = ['paid', 'confirmed', 'partially_refunded']
  const now = new Date()
  // Today and this month start at midnight Bali time, not server time.
  const baliNow = new Date(now.getTime() + BALI_OFFSET_MS)
  const startOfToday = new Date(
    Date.UTC(baliNow.getUTCFullYear(), baliNow.getUTCMonth(), baliNow.getUTCDate()) -
      BALI_OFFSET_MS,
  )
  const startOfMonth = new Date(
    Date.UTC(baliNow.getUTCFullYear(), baliNow.getUTCMonth(), 1) - BALI_OFFSET_MS,
  )
  const placedAt = sql`coalesce(${orders.placedAt}, ${orders.createdAt})`

  const [
    userCountRows,
    itinerariesSoldRows,
    mapUserRows,
    openAlertRows,
    topViewed,
    topSaved,
    latestUsers,
    ordersTodayRows,
    awaitingRows,
    monthRevenue,
    newTripRows,
    newContactRows,
    pendingDeviceRows,
  ] = await Promise.all([
    mayReadCustomers
      ? db
          .select({ value: sql<number>`count(*)::int` })
          .from(users)
          .where(isNull(users.deletedAt))
      : [],
    mayReadOrders
      ? db
          .select({ value: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int` })
          .from(orderItems)
          .innerJoin(orders, eq(orders.id, orderItems.orderId))
          .where(and(eq(orderItems.kind, 'itinerary'), inArray(orders.status, PAID)))
      : [],
    mayReadCustomers
      ? db
          .select({ value: sql<number>`count(distinct ${entitlements.userId})::int` })
          .from(entitlements)
          .where(
            and(
              // "مستخدمو الخريطة": الأنواع التي تفتح الخريطة فقط (باقة `basic` لا).
              inArray(entitlements.kind, ['map_access', 'vip']),
              isNull(entitlements.revokedAt),
              lte(entitlements.startsAt, now),
              or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
            ),
          )
      : [],
    mayReadSecurity
      ? db
          .select({ value: sql<number>`count(*)::int` })
          .from(securityAlerts)
          .where(eq(securityAlerts.status, 'open'))
      : [],
    db
      .select({
        name: mapPlaces.name,
        slug: mapPlaces.slug,
        hits: sql<number>`count(*)::int`,
      })
      .from(activityLog)
      .innerJoin(mapPlaces, sql`${mapPlaces.id}::text = ${activityLog.details}->>'placeId'`)
      .where(eq(activityLog.action, 'view_place'))
      .groupBy(mapPlaces.id, mapPlaces.name, mapPlaces.slug)
      .orderBy(sql`count(*) desc`)
      .limit(5),
    db
      .select({
        name: mapPlaces.name,
        slug: mapPlaces.slug,
        hits: sql<number>`count(*)::int`,
      })
      .from(favorites)
      .innerJoin(mapPlaces, eq(mapPlaces.id, favorites.refId))
      .where(eq(favorites.kind, 'place'))
      .groupBy(mapPlaces.id, mapPlaces.name, mapPlaces.slug)
      .orderBy(sql`count(*) desc`)
      .limit(5),
    mayReadCustomers
      ? db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(isNull(users.deletedAt))
          .orderBy(desc(users.createdAt))
          .limit(6)
      : [],
    mayReadOrders
      ? db
          .select({ value: sql<number>`count(*)::int` })
          .from(orders)
          .where(gte(orders.createdAt, startOfToday))
      : [],
    // Paid but not yet confirmed: money is in, the booking still needs a person.
    mayReadOrders
      ? db
          .select({ value: sql<number>`count(*)::int` })
          .from(orders)
          .where(eq(orders.status, 'paid'))
      : [],
    mayReadOrders
      ? db
          .select({
            currency: orders.presentmentCurrency,
            revenueMinor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::float8`,
          })
          .from(orders)
          .where(
            and(
              inArray(orders.status, PAID),
              sql`${placedAt} >= ${startOfMonth.toISOString()}::timestamptz`,
            ),
          )
          .groupBy(orders.presentmentCurrency)
      : [],
    mayReadLeads
      ? db
          .select({ value: sql<number>`count(*)::int` })
          .from(customTripRequests)
          .where(eq(customTripRequests.status, 'new'))
      : [],
    mayReadLeads
      ? db
          .select({ value: sql<number>`count(*)::int` })
          .from(contactMessages)
          .where(eq(contactMessages.status, 'new'))
      : [],
    mayReadSecurity
      ? db
          .select({ value: sql<number>`count(*)::int` })
          .from(devices)
          .where(eq(devices.status, 'pending'))
      : [],
  ])
  const configWarnings = liveModeIssues()

  // Phase 5: the period dashboard (filters, comparison, drill-down, charts).
  // Phase 6: the period dashboard is a report (`reports.read`).
  const reportCtx = can(session.role, 'reports.read') ? await buildContext(session.role) : null
  const filters = parseReportFilters(params, now)
  const [overview, supplierList, currencyList, staffList] =
    reportCtx === null
      ? [null, [], [], []]
      : await Promise.all([
          buildOverview(filters, reportCtx),
          supplierOptions(),
          currencyOptions(),
          staffOptions(),
        ])
  const lowSpots = overview?.kpis.find((kpi) => kpi.id === 'low_availability')?.value ?? null
  const lowSpotCount = lowSpots && lowSpots.kind === 'count' ? (lowSpots.value ?? 0) : 0

  const byStatus = mayReadOrders
    ? await db
        .select({
          status: orders.status,
          currency: orders.presentmentCurrency,
          orderCount: sql<number>`count(*)::int`,
          revenueMinor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::float8`,
        })
        .from(orders)
        .groupBy(orders.status, orders.presentmentCurrency)
    : []

  const recentOrders = mayReadOrders
    ? await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          totalMinor: orders.totalMinor,
          currency: orders.presentmentCurrency,
          placedAt: orders.placedAt,
          createdAt: orders.createdAt,
          email: users.email,
        })
        .from(orders)
        .leftJoin(users, eq(users.id, orders.userId))
        .orderBy(desc(orders.createdAt))
        .limit(8)
    : []

  const [recentTrips, recentContacts] = mayReadLeads
    ? await Promise.all([
        db
          .select({
            id: customTripRequests.id,
            name: customTripRequests.name,
            email: customTripRequests.email,
            travellers: customTripRequests.travellers,
            status: customTripRequests.status,
            createdAt: customTripRequests.createdAt,
          })
          .from(customTripRequests)
          .orderBy(desc(customTripRequests.createdAt))
          .limit(6),
        db
          .select({
            id: contactMessages.id,
            name: contactMessages.name,
            email: contactMessages.email,
            subject: contactMessages.subject,
            status: contactMessages.status,
            createdAt: contactMessages.createdAt,
          })
          .from(contactMessages)
          .orderBy(desc(contactMessages.createdAt))
          .limit(6),
      ])
    : [[], []]

  const totalOrders = byStatus.reduce((sum, row) => sum + row.orderCount, 0)

  // Only settled money counts as revenue. Pending orders have not been paid
  // and cancelled ones never will be, so folding them in would overstate it.
  const earnedByCurrency = new Map<string, number>()
  for (const row of byStatus) {
    if (!PAID.includes(row.status)) continue
    earnedByCurrency.set(row.currency, (earnedByCurrency.get(row.currency) ?? 0) + row.revenueMinor)
  }
  const monthByCurrency = monthRevenue.filter((row) => row.revenueMinor > 0)

  const count = (rows: readonly { value: number }[]) => rows[0]?.value ?? 0
  const leadLabel = (status: string) => {
    const key = LEAD_STATUS_KEYS[status]
    return key ? t(key) : status
  }

  // --- Greeting ------------------------------------------------------------
  const hour = baliNow.getUTCHours()
  const greetingKey =
    hour < 12
      ? 'dashboard.greeting_morning'
      : hour < 17
        ? 'dashboard.greeting_afternoon'
        : 'dashboard.greeting_evening'
  const firstName = (session.name ?? '').trim().split(/\s+/)[0] ?? ''
  const today = new Intl.DateTimeFormat(intl, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Makassar',
  }).format(now)

  // --- Owner, Oct 2026: bookings waiting for the operator --------------------
  // The card hold is released automatically AUTHORIZATION_DAYS after it was
  // taken; the oldest first, so the one closest to release is on top.
  const supplierWait = mayReadOrders
    ? await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          authorizedAt: orders.authorizedAt,
          createdAt: orders.createdAt,
          totalMinor: orders.totalMinor,
          currency: orders.presentmentCurrency,
          customer: orders.customerSnapshot,
        })
        .from(orders)
        .where(eq(orders.status, 'authorized'))
        .orderBy(sql`coalesce(${orders.authorizedAt}, ${orders.createdAt}) asc`)
        .limit(50)
    : []

  // --- Needs your attention ------------------------------------------------
  interface Attention {
    key: string
    icon: IconName
    count: number
    label: string
    hint: string
    href: string
    cta: string
    tone: 'warn' | 'bad' | 'info'
  }
  const attention: Attention[] = []
  if (mayReadLeads) {
    attention.push({
      key: 'trips',
      icon: 'message',
      count: count(newTripRows),
      label: t('dashboard.att_trips'),
      hint: t('dashboard.att_trips_hint'),
      href: adminHref('/leads?status=new'),
      cta: t('dashboard.review'),
      tone: 'warn',
    })
    attention.push({
      key: 'contacts',
      icon: 'inbox',
      count: count(newContactRows),
      label: t('dashboard.att_contacts'),
      hint: t('dashboard.att_contacts_hint'),
      href: adminHref('/leads?tab=contact&status=new'),
      cta: t('dashboard.reply'),
      tone: 'info',
    })
  }
  if (mayReadOrders) {
    attention.push({
      key: 'supplier',
      icon: 'alert',
      count: supplierWait.length,
      label: t('oo.d_att_supplier'),
      hint: t('oo.d_att_supplier_hint', { days: AUTHORIZATION_DAYS }),
      href: adminHref('/orders?status=authorized'),
      cta: t('dashboard.confirm'),
      tone: 'bad',
    })
    attention.push({
      key: 'orders',
      icon: 'bag',
      count: count(awaitingRows),
      label: t('dashboard.att_orders'),
      hint: t('dashboard.att_orders_hint'),
      href: adminHref('/orders?status=paid'),
      cta: t('dashboard.confirm'),
      tone: 'warn',
    })
  }
  if (mayReadOrders && lowSpotCount > 0) {
    attention.push({
      key: 'low_availability',
      icon: 'alert',
      count: lowSpotCount,
      label: t('rp.att_low_availability'),
      hint: t('rp.att_low_availability_hint'),
      href: adminHref('/reports/records?metric=low_availability'),
      cta: t('dashboard.review'),
      tone: 'warn',
    })
  }
  if (mayReadSecurity) {
    attention.push({
      key: 'devices',
      icon: 'phone',
      count: count(pendingDeviceRows),
      label: t('dashboard.att_devices'),
      hint: t('dashboard.att_devices_hint'),
      href: adminHref('/protection/devices?status=pending'),
      cta: t('dashboard.review'),
      tone: 'info',
    })
    attention.push({
      key: 'alerts',
      icon: 'alert',
      count: count(openAlertRows),
      label: t('dashboard.att_alerts'),
      hint: t('dashboard.att_alerts_hint'),
      href: adminHref('/protection/alerts?status=open'),
      cta: t('dashboard.investigate'),
      tone: 'bad',
    })
  }
  // Phase 6: only work the viewer can open (a booking agent reads orders but
  // not the reports the low-availability list lives in).
  const pendingWork = attention.filter(
    (item) => item.count > 0 && canOpenHref(session.role, item.href),
  )

  // --- Quick actions -------------------------------------------------------
  const quickActions: { href: string; label: string; icon: IconName }[] = []
  if (can(session.role, 'content.write')) {
    quickActions.push({
      href: adminHref('/places/new'),
      label: t('dashboard.qa_place'),
      icon: 'pin',
    })
    quickActions.push({
      href: adminHref('/itineraries/new'),
      label: t('dashboard.qa_itinerary'),
      icon: 'route',
    })
  }
  if (can(session.role, 'roles.write')) {
    quickActions.push({ href: adminHref('/notify'), label: t('dashboard.qa_notify'), icon: 'bell' })
  }
  if (mayReadCustomers) {
    quickActions.push({
      href: adminHref('/customers'),
      label: t('dashboard.qa_customers'),
      icon: 'users',
    })
  }

  return (
    <>
      <header className="a-hello">
        <div className="a-hello-text">
          <h1>{firstName ? t(greetingKey, { name: firstName }) : t(`${greetingKey}_plain`)}</h1>
          <p>
            <time dateTime={now.toISOString()}>{today}</time>
            <span className="a-hello-sep" aria-hidden="true" />
            {pendingWork.length === 0
              ? t('dashboard.summary_clear')
              : t('dashboard.summary_pending', {
                  count: pendingWork.reduce((sum, item) => sum + item.count, 0),
                })}
          </p>
        </div>
        {quickActions.length > 0 ? (
          <nav className="a-quick" aria-label={t('dashboard.quick_actions')}>
            {quickActions
              .filter((action) => canOpenHref(session.role, action.href))
              .map((action, index) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={index === 0 ? 'a-btn' : 'a-btn ghost'}
                >
                  <Icon name={index === 0 ? 'plus' : action.icon} size={18} />
                  {action.label}
                </Link>
              ))}
          </nav>
        ) : null}
      </header>

      <Flash searchParams={params} />

      {configWarnings.length > 0 ? (
        <div className="a-flash warn" role="alert">
          <Icon name="alert" size={20} />
          <div>
            <b>{t('dashboard.config_title')}</b>
            <ul>
              {configWarnings.map((warning) => (
                <li key={warning.code}>{t(`dashboard.cfg_${warning.code}`)}</li>
              ))}
            </ul>
            <p>{t('dashboard.config_hint')}</p>
            <Advanced show={session.role === 'admin'} title={t('common.advanced')}>
              <ul dir="ltr" className="a-mono">
                {configWarnings.map((warning) => (
                  <li key={warning.code}>{warning.text}</li>
                ))}
              </ul>
            </Advanced>
          </div>
        </div>
      ) : null}

      {supplierWait.length > 0 ? (
        <section className="a-card a-wait" aria-labelledby="wait-title">
          <div className="a-card-head">
            <h2 id="wait-title">{t('oo.d_wait_title')}</h2>
            <span className="a-count-badge">{supplierWait.length}</span>
          </div>
          <p className="a-hint">{t('oo.d_wait_hint', { days: AUTHORIZATION_DAYS })}</p>
          <ul className="a-wait-list">
            {supplierWait.slice(0, 6).map((row) => {
              const since = row.authorizedAt ?? row.createdAt
              const left = timeLeftParts(since, now)
              return (
                <li key={row.id} className={isUrgent(since, now) ? 'urgent' : undefined}>
                  <Link href={adminHref(`/orders/${row.id}`)}>
                    <span className="a-wait-no a-mono">{row.orderNumber}</span>
                    <span className="a-wait-who">
                      {row.customer?.name ?? t('orders.guest')} ·{' '}
                      {formatMoney(row.totalMinor, row.currency, intl)}
                    </span>
                    <span className="a-wait-left">
                      {t('oo.left', { d: left.days, h: left.hours })}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          {supplierWait.length > 6 ? (
            <Link className="a-btn ghost small" href={adminHref('/orders?status=authorized')}>
              {t('oo.d_wait_all', { n: supplierWait.length })}
            </Link>
          ) : null}
        </section>
      ) : null}

      {attention.length > 0 ? (
        <section className="a-card a-attn" aria-labelledby="attn-title">
          <div className="a-card-head">
            <h2 id="attn-title">{t('dashboard.attention_title')}</h2>
            {pendingWork.length > 0 ? (
              <span className="a-count-badge">{pendingWork.length}</span>
            ) : null}
          </div>
          {pendingWork.length === 0 ? (
            <div className="a-empty a-empty-good">
              <span className="a-empty-icon">
                <Icon name="check" size={22} />
              </span>
              <b>{t('dashboard.all_clear')}</b>
              <span>{t('dashboard.all_clear_hint')}</span>
            </div>
          ) : (
            <ul className="a-attn-list">
              {pendingWork.map((item) => (
                <li key={item.key} className={`a-attn-item ${item.tone}`}>
                  <Link href={item.href}>
                    <span className="a-attn-icon">
                      <Icon name={item.icon} size={20} />
                    </span>
                    <span className="a-attn-num">{item.count}</span>
                    <span className="a-attn-text">
                      <b>{item.label}</b>
                      <span>{item.hint}</span>
                    </span>
                    <span className="a-attn-cta">
                      {item.cta}
                      <Icon name="chevron" size={16} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {overview !== null && reportCtx !== null ? (
        <section aria-labelledby="dash-numbers" style={{ marginBlockStart: 18 }}>
          <h2 id="dash-numbers" className="a-section-title">
            {t('rp.dashboard_numbers')}
          </h2>
          <FilterBar
            action={adminHref('')}
            filters={filters}
            t={t}
            intl={intl}
            suppliers={supplierList}
            currencies={currencyList}
            staff={staffList}
          >
            <a className="a-btn ghost" href={adminHref('/reports')}>
              {t('rp.all_reports')}
            </a>
          </FilterBar>
          <ReportBody result={overview} t={t} intl={intl} rtl={reportCtx.rtl} role={session.role} />
        </section>
      ) : null}

      {!mayReadOrders && (mayReadLeads || mayReadCustomers || mayReadSecurity) ? (
        <section className="a-kpis" aria-label={t('dashboard.today_title')}>
          {mayReadOrders ? (
            <div className="a-kpi">
              <span className="a-kpi-label">{t('dashboard.kpi_orders_today')}</span>
              <b className="a-kpi-value">{count(ordersTodayRows)}</b>
              <Link className="a-kpi-link" href={adminHref('/orders')}>
                {t('dashboard.all_orders')}
              </Link>
            </div>
          ) : null}
          {mayReadOrders ? (
            <div className="a-kpi">
              <span className="a-kpi-label">{t('dashboard.kpi_revenue_month')}</span>
              {monthByCurrency.length === 0 ? (
                <b className="a-kpi-value a-muted">—</b>
              ) : (
                monthByCurrency.map((row) => (
                  <b className="a-kpi-value" key={row.currency} dir="ltr">
                    {formatMoney(row.revenueMinor, row.currency, intl)}
                  </b>
                ))
              )}
              <span className="a-kpi-note">{t('dashboard.kpi_revenue_note')}</span>
            </div>
          ) : null}
          {mayReadLeads ? (
            <div className="a-kpi">
              <span className="a-kpi-label">{t('dashboard.kpi_requests')}</span>
              <b className="a-kpi-value">{count(newTripRows)}</b>
              <Link className="a-kpi-link" href={adminHref('/leads')}>
                {t('dashboard.all_requests')}
              </Link>
            </div>
          ) : null}
          {mayReadSecurity ? (
            <div className="a-kpi">
              <span className="a-kpi-label">{t('dashboard.kpi_alerts')}</span>
              <b className={count(openAlertRows) > 0 ? 'a-kpi-value bad' : 'a-kpi-value'}>
                {count(openAlertRows)}
              </b>
              <Link className="a-kpi-link" href={adminHref('/protection/alerts')}>
                {t('dashboard.all_alerts')}
              </Link>
            </div>
          ) : null}
          {mayReadCustomers ? (
            <div className="a-kpi">
              <span className="a-kpi-label">{t('dashboard.kpi_map_users')}</span>
              <b className="a-kpi-value">{count(mapUserRows)}</b>
              <span className="a-kpi-note">{t('dashboard.kpi_map_users_note')}</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {mayReadOrders ? (
        <section className="a-card">
          <div className="a-card-head">
            <h2>{t('dashboard.recent_orders')}</h2>
            <Link className="a-btn ghost small" href={adminHref('/orders')}>
              {t('dashboard.view_all')}
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <Empty>{t('dashboard.no_orders')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{t('dashboard.col_order')}</th>
                  <th>{t('dashboard.col_customer')}</th>
                  <th>{t('common.status')}</th>
                  <th className="num">{t('common.total')}</th>
                  <th>{t('dashboard.col_placed')}</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={adminHref(`/orders/${order.id}`)} className="a-mono">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td>
                      {order.email ?? <span className="a-muted">{t('dashboard.guest')}</span>}
                    </td>
                    <td>
                      <OrderStatusPill status={order.status} />
                    </td>
                    <td className="num">{formatMoney(order.totalMinor, order.currency, intl)}</td>
                    <td>
                      <When value={order.placedAt ?? order.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      ) : null}

      <div className="a-cols">
        {mayReadLeads ? (
          <section className="a-card">
            <div className="a-card-head">
              <h2>{t('dashboard.recent_requests')}</h2>
              <Link className="a-btn ghost small" href={adminHref('/leads')}>
                {t('dashboard.view_all')}
              </Link>
            </div>
            {recentTrips.length === 0 ? (
              <Empty>{t('dashboard.no_requests')}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('common.status')}</th>
                    <th className="num">{t('dashboard.col_travellers')}</th>
                    <th>{t('dashboard.col_received')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrips.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <Link href={adminHref('/leads')}>
                          {lead.name ?? t('dashboard.unnamed')}
                        </Link>
                        {lead.email ? (
                          <span className="a-sub" dir="ltr">
                            {lead.email}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <Pill tone={LEAD_TONES[lead.status] ?? 'neutral'}>
                          {leadLabel(lead.status)}
                        </Pill>
                      </td>
                      <td className="num">{lead.travellers ?? '—'}</td>
                      <td>
                        <When value={lead.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        ) : null}
        {mayReadLeads ? (
          <section className="a-card">
            <div className="a-card-head">
              <h2>{t('dashboard.contact_messages')}</h2>
              <Link className="a-btn ghost small" href={adminHref('/leads?tab=contact')}>
                {t('dashboard.view_all')}
              </Link>
            </div>
            {recentContacts.length === 0 ? (
              <Empty>{t('dashboard.no_messages')}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('dashboard.col_subject')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('dashboard.col_received')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentContacts.map((message) => (
                    <tr key={message.id}>
                      <td>
                        <Link href={adminHref('/leads?tab=contact')}>{message.name}</Link>
                      </td>
                      <td>{message.subject ?? <span className="a-muted">—</span>}</td>
                      <td>
                        <Pill tone={LEAD_TONES[message.status] ?? 'neutral'}>
                          {leadLabel(message.status)}
                        </Pill>
                      </td>
                      <td>
                        <When value={message.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        ) : null}
      </div>

      <h2 className="a-section-title">{t('dashboard.insights_title')}</h2>

      {mayReadOrders || mayReadCustomers ? (
        <section className="a-kpis a-kpis-quiet" aria-label={t('dashboard.insights_title')}>
          {mayReadCustomers ? (
            <div className="a-kpi">
              <span className="a-kpi-label">{t('dashboard.kpi_users')}</span>
              <b className="a-kpi-value">{count(userCountRows)}</b>
            </div>
          ) : null}
          {mayReadOrders ? (
            <div className="a-kpi">
              <span className="a-kpi-label">{t('dashboard.kpi_orders_total')}</span>
              <b className="a-kpi-value">{totalOrders}</b>
            </div>
          ) : null}
          {mayReadOrders ? (
            <div className="a-kpi">
              <span className="a-kpi-label">{t('dashboard.kpi_itineraries_sold')}</span>
              <b className="a-kpi-value">{count(itinerariesSoldRows)}</b>
            </div>
          ) : null}
          {mayReadOrders ? (
            <div className="a-kpi">
              <span className="a-kpi-label">{t('dashboard.kpi_revenue_all')}</span>
              {earnedByCurrency.size === 0 ? (
                <b className="a-kpi-value a-muted">—</b>
              ) : (
                [...earnedByCurrency.entries()].map(([currency, minor]) => (
                  <b className="a-kpi-value" key={currency} dir="ltr">
                    {formatMoney(minor, currency, intl)}
                  </b>
                ))
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="a-cols">
        <section className="a-card">
          <h2>{t('dashboard.top_viewed')}</h2>
          {topViewed.length === 0 ? (
            <Empty>{t('dashboard.no_views')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{t('dashboard.col_place')}</th>
                  <th className="num">{t('dashboard.col_views')}</th>
                </tr>
              </thead>
              <tbody>
                {topViewed.map((row) => (
                  <tr key={row.slug}>
                    <td>{pick(row.name, locale, row.slug)}</td>
                    <td className="num">{row.hits}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
        <section className="a-card">
          <h2>{t('dashboard.top_saved')}</h2>
          {topSaved.length === 0 ? (
            <Empty>{t('dashboard.no_saves')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{t('dashboard.col_place')}</th>
                  <th className="num">{t('dashboard.col_saves')}</th>
                </tr>
              </thead>
              <tbody>
                {topSaved.map((row) => (
                  <tr key={row.slug}>
                    <td>{pick(row.name, locale, row.slug)}</td>
                    <td className="num">{row.hits}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>

      <div className="a-cols">
        {mayReadCustomers ? (
          <section className="a-card">
            <div className="a-card-head">
              <h2>{t('dashboard.newest_users')}</h2>
              <Link className="a-btn ghost small" href={adminHref('/customers')}>
                {t('dashboard.view_all')}
              </Link>
            </div>
            {latestUsers.length === 0 ? (
              <Empty>{t('dashboard.no_users')}</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>{t('common.email')}</th>
                    <th>{t('common.name')}</th>
                    <th>{t('dashboard.col_joined')}</th>
                  </tr>
                </thead>
                <tbody>
                  {latestUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <Link href={adminHref(`/customers/${user.id}`)} dir="ltr">
                          {user.email}
                        </Link>
                      </td>
                      <td>{user.name ?? <span className="a-muted">—</span>}</td>
                      <td>
                        <When value={user.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        ) : null}

        {mayReadOrders ? (
          <section className="a-card">
            <h2>{t('dashboard.by_status')}</h2>
            <Table>
              <thead>
                <tr>
                  <th>{t('common.status')}</th>
                  <th>{t('common.currency')}</th>
                  <th className="num">{t('dashboard.col_orders')}</th>
                  <th className="num">{t('dashboard.col_value')}</th>
                </tr>
              </thead>
              <tbody>
                {ORDER_STATUSES.flatMap((status) => {
                  const rows = byStatus.filter((row) => row.status === status)
                  if (rows.length === 0) {
                    return [
                      <tr key={status}>
                        <td>
                          <OrderStatusPill status={status} />
                        </td>
                        <td className="a-muted">—</td>
                        <td className="num">0</td>
                        <td className="num a-muted">—</td>
                      </tr>,
                    ]
                  }
                  return rows.map((row) => (
                    <tr key={`${status}-${row.currency}`}>
                      <td>
                        <OrderStatusPill status={status} />
                      </td>
                      <td className="a-mono">{row.currency}</td>
                      <td className="num">{row.orderCount}</td>
                      <td className="num">{formatMoney(row.revenueMinor, row.currency, intl)}</td>
                    </tr>
                  ))
                })}
              </tbody>
            </Table>
          </section>
        ) : null}
      </div>
    </>
  )
}
