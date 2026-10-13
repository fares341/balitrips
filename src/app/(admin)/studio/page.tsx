import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import {
  activityLog,
  contactMessages,
  customTripRequests,
  entitlements,
  favorites,
  mapPlaces,
  orderItems,
  orders,
  securityAlerts,
  users,
} from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { liveModeWarnings } from '@/lib/live-mode'
import { can } from '@/lib/auth/roles'
import { formatMoney } from '@/lib/money'
import { ORDER_STATUSES } from '@/lib/orders/state'

import { adminHref } from '../_lib/admin-path'
import { requireCapability } from '../_lib/session'
import { Flash } from '../_ui/flash'
import { PageHead } from '../_ui/shell'
import { Empty, OrderStatusPill, Table, When } from '../_ui/table'

export const dynamic = 'force-dynamic'

/**
 * Dashboard.
 *
 * Revenue is grouped by status AND currency. Summing across currencies
 * would produce a number that means nothing — the platform sells into
 * several regions and there is no implied dollar anywhere in this system.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('admin.access')
  const params = await searchParams

  const mayReadOrders = can(session.role, 'orders.read')
  const mayReadLeads = can(session.role, 'leads.read')
  const mayReadCustomers = can(session.role, 'customers.read')
  const mayReadSecurity = can(session.role, 'security.read')

  // الوثيقة (لوحة التحكم 1): عدد المستخدمين، الجداول المباعة، مستخدمو الخريطة،
  // أكثر الأماكن مشاهدة وحفظاً، أحدث المستخدمين، تنبيهات الأمان.
  const PAID = ['paid', 'confirmed', 'partially_refunded']
  const now = new Date()
  const [
    userCountRows,
    itinerariesSoldRows,
    mapUserRows,
    openAlertRows,
    topViewed,
    topSaved,
    latestUsers,
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
  ])
  const configWarnings = liveModeWarnings()

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
        .limit(10)
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
  const earning = byStatus.filter(
    (row) =>
      row.status === 'paid' || row.status === 'confirmed' || row.status === 'partially_refunded',
  )

  const earnedByCurrency = new Map<string, number>()
  for (const row of earning) {
    earnedByCurrency.set(row.currency, (earnedByCurrency.get(row.currency) ?? 0) + row.revenueMinor)
  }

  return (
    <>
      <PageHead
        title="Dashboard"
        description="Order volume, settled revenue by currency, and the newest leads."
      />
      <Flash searchParams={params} />

      {configWarnings.length > 0 ? (
        <div className="a-card" role="alert">
          <h2>Production configuration</h2>
          <ul>
            {configWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="a-grid">
        {mayReadCustomers ? (
          <div className="a-stat">
            <span>Users</span>
            <b>{userCountRows[0]?.value ?? 0}</b>
          </div>
        ) : null}
        {mayReadOrders ? (
          <div className="a-stat">
            <span>Itineraries sold</span>
            <b>{itinerariesSoldRows[0]?.value ?? 0}</b>
          </div>
        ) : null}
        {mayReadCustomers ? (
          <div className="a-stat">
            <span>Map users (active plans)</span>
            <b>{mapUserRows[0]?.value ?? 0}</b>
          </div>
        ) : null}
        {mayReadSecurity ? (
          <div className="a-stat">
            <span>Open security alerts</span>
            <b>
              <Link href={adminHref('/protection/alerts')}>{openAlertRows[0]?.value ?? 0}</Link>
            </b>
          </div>
        ) : null}
      </div>

      <div className="a-cols">
        <div className="a-card">
          <h2>Most viewed places</h2>
          {topViewed.length === 0 ? (
            <Empty>No place views yet.</Empty>
          ) : (
            <Table>
              <tbody>
                {topViewed.map((row) => (
                  <tr key={row.slug}>
                    <td>{pick(row.name, 'en', row.slug)}</td>
                    <td className="num">{row.hits}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <div className="a-card">
          <h2>Most saved places</h2>
          {topSaved.length === 0 ? (
            <Empty>No saved places yet.</Empty>
          ) : (
            <Table>
              <tbody>
                {topSaved.map((row) => (
                  <tr key={row.slug}>
                    <td>{pick(row.name, 'en', row.slug)}</td>
                    <td className="num">{row.hits}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>

      {mayReadCustomers ? (
        <div className="a-card">
          <h2>Newest users</h2>
          {latestUsers.length === 0 ? (
            <Empty>No users yet.</Empty>
          ) : (
            <Table>
              <tbody>
                {latestUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <Link href={adminHref(`/customers/${user.id}`)}>{user.email}</Link>
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
        </div>
      ) : null}

      {mayReadOrders ? (
        <>
          <div className="a-grid">
            <div className="a-stat">
              <span>Orders</span>
              <b>{totalOrders}</b>
            </div>
            {[...earnedByCurrency.entries()].map(([currency, minor]) => (
              <div className="a-stat" key={currency}>
                <span>Revenue ({currency})</span>
                <b>{formatMoney(minor, currency, 'en')}</b>
              </div>
            ))}
            {earnedByCurrency.size === 0 ? (
              <div className="a-stat">
                <span>Revenue</span>
                <b>—</b>
              </div>
            ) : null}
          </div>

          <div className="a-card">
            <h2>By status</h2>
            <Table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Currency</th>
                  <th className="num">Orders</th>
                  <th className="num">Value</th>
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
                      <td className="num">{formatMoney(row.revenueMinor, row.currency, 'en')}</td>
                    </tr>
                  ))
                })}
              </tbody>
            </Table>
          </div>

          <div className="a-card">
            <h2>Recent orders</h2>
            {recentOrders.length === 0 ? (
              <Empty>No orders yet.</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="num">Total</th>
                    <th>Placed</th>
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
                      <td>{order.email ?? <span className="a-muted">guest</span>}</td>
                      <td>
                        <OrderStatusPill status={order.status} />
                      </td>
                      <td className="num">{formatMoney(order.totalMinor, order.currency, 'en')}</td>
                      <td>
                        <When value={order.placedAt ?? order.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </>
      ) : null}

      {mayReadLeads ? (
        <div className="a-cols">
          <div className="a-card">
            <h2>Custom trip requests</h2>
            {recentTrips.length === 0 ? (
              <Empty>No requests yet.</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th className="num">Travellers</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrips.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <Link href={adminHref('/leads')}>{lead.name ?? 'Unnamed'}</Link>
                      </td>
                      <td>{lead.email ?? <span className="a-muted">—</span>}</td>
                      <td className="num">{lead.travellers ?? '—'}</td>
                      <td>
                        <When value={lead.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>

          <div className="a-card">
            <h2>Contact messages</h2>
            {recentContacts.length === 0 ? (
              <Empty>No messages yet.</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Subject</th>
                    <th>Received</th>
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
                        <When value={message.createdAt} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
