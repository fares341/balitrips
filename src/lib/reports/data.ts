import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  notInArray,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm'

import { db } from '@/db'
import {
  activities,
  activityAvailability,
  analyticsEvents,
  customTripRequests,
  orderItems,
  orders,
  payments,
  refunds,
  suppliers,
  supportTickets,
  users,
} from '@/db/schema'

import { STUDIO_ROLES } from '@/lib/auth/roles'

import type { ProductType, ReportFilters } from './filters'
import { sumByCurrency, type Money } from './metrics'
import { bucketSqlFormat, type Bucket } from './period'

/**
 * The database side of reports: small aggregate queries, one per number,
 * each with the exact definition the Studio shows next to it
 * (`reports.def_*` in the Studio dictionary). Arithmetic on the results
 * (rates, averages, margins) is in ./metrics.
 *
 * Shared rules:
 *  - "Paid" means the order has a payment that went through (succeeded, or
 *    succeeded and later refunded). A refund is reported as a refund, it does
 *    not erase the sale.
 *  - An order belongs to the day it was placed, in Bali time.
 *  - Money is grouped by currency, never added across currencies.
 */

export interface Range {
  start: Date
  end: Date
}

export const COLLECTED = ['succeeded', 'refunded'] as const
export const BOOKABLE = ['activity', 'activity_tier', 'package', 'driver'] as const

export const placedAt = sql`coalesce(${orders.placedAt}, ${orders.createdAt})`

export const everPaid = sql`exists (select 1 from payments pp where pp.order_id = ${orders.id} and pp.status in ('succeeded', 'refunded'))`

/** Lines that were sold on their own (not an activity included at 0 in a package). */
export const soldLine = sql`coalesce(${orderItems.options}->>'includedInPackage', ${orderItems.options}->>'includedInTier') is null`

function iso(date: Date) {
  return date.toISOString()
}

export function inRange(expr: SQL, range: Range): SQL {
  return sql`${expr} >= ${iso(range.start)}::timestamptz and ${expr} < ${iso(range.end)}::timestamptz`
}

export function lineTypeSql(type: ProductType): SQL {
  switch (type) {
    case 'activity':
      return sql`${orderItems.kind} in ('activity', 'activity_tier')`
    case 'vip':
      return sql`${orderItems.kind} = 'plan' and exists (select 1 from plans pl where pl.id = ${orderItems.refId} and pl.entitlement_kind = 'vip')`
    case 'map':
      return sql`${orderItems.kind} = 'plan' and not exists (select 1 from plans pl where pl.id = ${orderItems.refId} and pl.entitlement_kind = 'vip')`
    default:
      return sql`${orderItems.kind} = ${type}`
  }
}

/** Line-level conditions from the filters (type, supplier); null when none apply. */
export function lineFilter(filters: Pick<ReportFilters, 'type' | 'supplierId'>): SQL | null {
  const parts: SQL[] = []
  if (filters.type) parts.push(lineTypeSql(filters.type))
  if (filters.supplierId) parts.push(sql`${orderItems.supplierId} = ${filters.supplierId}`)
  if (parts.length === 0) return null
  return sql.join(parts, sql` and `)
}

/** Orders containing at least one line matching the filters (or every order). */
function orderHasLine(filters: Pick<ReportFilters, 'type' | 'supplierId'>): SQL | undefined {
  const line = lineFilter(filters)
  if (line === null) return undefined
  return sql`exists (select 1 from order_items where order_items.order_id = ${orders.id} and ${line})`
}

function currencyCond(filters: Pick<ReportFilters, 'currency'>): SQL | undefined {
  return filters.currency ? eq(orders.presentmentCurrency, filters.currency) : undefined
}

/**
 * Phase 6 staff filter: "orders handled by this staff member" = orders whose
 * customer account is assigned to them (`users.assigned_to_user_id`, set on
 * the customer page). A guest order has no account, so no staff member.
 *
 * `orderId` is the SQL of the order's id column (`orders.id`, or `o.id` in
 * raw SQL), so the same definition serves every query.
 */
export function staffOrderSql(staffId: string, orderId: SQLWrapper): SQL {
  return sql`exists (select 1 from orders so join users su on su.id = so.user_id where so.id = ${orderId} and su.assigned_to_user_id = ${staffId})`
}

/** The staff condition on the `orders` table, or nothing without the filter. */
export function staffCond(f: { staffId?: string | null }): SQL | undefined {
  return f.staffId ? staffOrderSql(f.staffId, orders.id) : undefined
}

/** The staff condition for raw SQL where the orders table is aliased (`and …`, or empty). */
export function staffAnd(f: { staffId?: string | null }, orderIdSql: SQL): SQL {
  return f.staffId ? sql`and ${staffOrderSql(f.staffId, orderIdSql)}` : sql``
}

type F = Pick<ReportFilters, 'type' | 'supplierId' | 'currency'> & { staffId?: string | null }

/* --------------------------------------------------------------------------
   Sales
   -------------------------------------------------------------------------- */

/** Value of paid bookings placed in the range (whole orders, or the matching lines). */
export async function bookingsValue(range: Range, f: F): Promise<Money[]> {
  const line = lineFilter(f)
  if (line === null) {
    const rows = await db
      .select({
        currency: orders.presentmentCurrency,
        minor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::float8`,
      })
      .from(orders)
      .where(and(everPaid, inRange(placedAt, range), currencyCond(f), staffCond(f)))
      .groupBy(orders.presentmentCurrency)
    return sumByCurrency(rows)
  }
  const rows = await db
    .select({
      currency: orders.presentmentCurrency,
      minor: sql<number>`coalesce(sum(${orderItems.lineTotalMinor}), 0)::float8`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(everPaid, inRange(placedAt, range), currencyCond(f), staffCond(f), line))
    .groupBy(orders.presentmentCurrency)
  return sumByCurrency(rows)
}

/** Discount codes taken off paid orders placed in the range (phase 4). */
export async function discountTotals(
  range: Range,
  f: F,
): Promise<{ money: Money[]; orders: number }> {
  const rows = await db
    .select({
      currency: orders.presentmentCurrency,
      minor: sql<number>`coalesce(sum(${orders.discountMinor}), 0)::float8`,
      orders: sql<number>`count(*) filter (where ${orders.discountMinor} > 0)::int`,
    })
    .from(orders)
    .where(and(everPaid, inRange(placedAt, range), currencyCond(f), staffCond(f), orderHasLine(f)))
    .groupBy(orders.presentmentCurrency)
  return { money: sumByCurrency(rows), orders: rows.reduce((sum, r) => sum + r.orders, 0) }
}

/** Orders placed in the range: all of them, and the paid ones. */
export async function orderCounts(range: Range, f: F): Promise<{ placed: number; paid: number }> {
  const [row] = await db
    .select({
      placed: sql<number>`count(*)::int`,
      paid: sql<number>`count(*) filter (where ${everPaid})::int`,
    })
    .from(orders)
    .where(and(inRange(placedAt, range), currencyCond(f), staffCond(f), orderHasLine(f)))
  return { placed: row?.placed ?? 0, paid: row?.paid ?? 0 }
}

/** Money taken: payments that went through, by the day the payment was made. */
export async function collected(range: Range, f: F): Promise<Money[]> {
  const rows = await db
    .select({
      currency: payments.currency,
      minor: sql<number>`coalesce(sum(${payments.amountMinor}), 0)::float8`,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        inArray(payments.status, [...COLLECTED]),
        gte(payments.createdAt, range.start),
        lt(payments.createdAt, range.end),
        f.currency ? eq(payments.currency, f.currency) : undefined,
        staffCond(f),
        orderHasLine(f),
      ),
    )
    .groupBy(payments.currency)
  return sumByCurrency(rows)
}

/** Refunds issued in the range (pending or done; failed ones are not money). */
export async function refundTotals(range: Range, f: F): Promise<{ money: Money[]; count: number }> {
  const line = lineFilter(f)
  const rows = await db
    .select({
      currency: refunds.currency,
      minor: sql<number>`coalesce(sum(${refunds.amountMinor}), 0)::float8`,
      count: sql<number>`count(*)::int`,
    })
    .from(refunds)
    .leftJoin(orderItems, eq(orderItems.id, refunds.orderItemId))
    .where(
      and(
        ne(refunds.status, 'failed'),
        gte(refunds.createdAt, range.start),
        lt(refunds.createdAt, range.end),
        f.currency ? eq(refunds.currency, f.currency) : undefined,
        f.staffId
          ? staffOrderSql(
              f.staffId,
              sql`(select rp.order_id from payments rp where rp.id = ${refunds.paymentId})`,
            )
          : undefined,
        line ?? undefined,
      ),
    )
    .groupBy(refunds.currency)
  return { money: sumByCurrency(rows), count: rows.reduce((sum, r) => sum + r.count, 0) }
}

/** Paid lines with their revenue and supplier cost (for margin). */
export async function costLines(range: Range, f: F) {
  return db
    .select({
      currency: orders.presentmentCurrency,
      revenueMinor: orderItems.lineTotalMinor,
      costMinor: orderItems.costMinor,
      costCurrency: orderItems.costCurrency,
      supplierId: orderItems.supplierId,
      kind: orderItems.kind,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        everPaid,
        inRange(placedAt, range),
        inArray(orderItems.kind, [...BOOKABLE]),
        currencyCond(f),
        staffCond(f),
        lineFilter(f) ?? undefined,
      ),
    )
}

/** Booking statuses of bookable lines in paid orders placed in the range. */
export async function bookingStatusCounts(range: Range, f: F): Promise<Map<string, number>> {
  const rows = await db
    .select({ status: orderItems.bookingStatus, count: sql<number>`count(*)::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        everPaid,
        inRange(placedAt, range),
        inArray(orderItems.kind, [...BOOKABLE]),
        currencyCond(f),
        staffCond(f),
        lineFilter(f) ?? undefined,
      ),
    )
    .groupBy(orderItems.bookingStatus)
  return new Map(rows.map((row) => [row.status, row.count]))
}

/** Payment attempts started in the range: went through vs failed. */
export async function paymentOutcomes(
  range: Range,
  f: F,
): Promise<{ succeeded: number; failed: number }> {
  const [row] = await db
    .select({
      succeeded: sql<number>`count(*) filter (where ${payments.status} in ('succeeded', 'refunded'))::int`,
      failed: sql<number>`count(*) filter (where ${payments.status} = 'failed')::int`,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        gte(payments.createdAt, range.start),
        lt(payments.createdAt, range.end),
        f.currency ? eq(payments.currency, f.currency) : undefined,
        staffCond(f),
        orderHasLine(f),
      ),
    )
  return { succeeded: row?.succeeded ?? 0, failed: row?.failed ?? 0 }
}

export type SalesGroup =
  | 'itinerary'
  | 'activity'
  | 'package'
  | 'vip'
  | 'map'
  | 'driver'
  | 'custom'
  | 'other'

const salesGroupSql = sql<string>`case
  when ${orderItems.kind} in ('activity', 'activity_tier') then 'activity'
  when ${orderItems.kind} = 'plan' and exists (select 1 from plans pl where pl.id = ${orderItems.refId} and pl.entitlement_kind = 'vip') then 'vip'
  when ${orderItems.kind} = 'plan' then 'map'
  when ${orderItems.kind} in ('itinerary', 'package', 'driver', 'custom') then ${orderItems.kind}
  else 'other' end`

/** Paid lines sold in the range, per product group: how many and their value. */
export async function salesByGroup(
  range: Range,
  f: F,
): Promise<Map<SalesGroup, { count: number; money: Money[] }>> {
  const rows = await db
    .select({
      group: salesGroupSql,
      currency: orders.presentmentCurrency,
      count: sql<number>`count(*)::int`,
      minor: sql<number>`coalesce(sum(${orderItems.lineTotalMinor}), 0)::float8`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        everPaid,
        inRange(placedAt, range),
        soldLine,
        currencyCond(f),
        staffCond(f),
        lineFilter(f) ?? undefined,
      ),
    )
    .groupBy(sql`1`, orders.presentmentCurrency)
  const out = new Map<SalesGroup, { count: number; money: Money[] }>()
  for (const row of rows) {
    const group = row.group as SalesGroup
    const entry = out.get(group) ?? { count: 0, money: [] }
    entry.count += row.count
    entry.money = sumByCurrency([...entry.money, { currency: row.currency, minor: row.minor }])
    out.set(group, entry)
  }
  return out
}

/** Customer key: the account, or the email of a guest. */
const customerKey = sql<string>`coalesce(${orders.userId}::text, lower(${orders.customerSnapshot}->>'email'))`

/** Customers who paid in the range, split new / returning (see metrics.newVsReturning). */
export async function customerSplit(
  range: Range,
  f: F,
): Promise<{ newCount: number; returningCount: number }> {
  const rows = await db.execute<{ is_new: boolean; n: number }>(sql`
    with buyers as (
      select distinct ${customerKey} as customer
      from ${orders}
      where ${everPaid} and ${inRange(placedAt, range)}
        ${f.currency ? sql`and ${orders.presentmentCurrency} = ${f.currency}` : sql``}
        ${staffAnd(f, sql`${orders.id}`)}
        ${orderHasLine(f) ? sql`and ${orderHasLine(f)}` : sql``}
    ),
    firsts as (
      select ${customerKey} as customer, min(${placedAt}) as first_paid
      from ${orders}
      where ${everPaid}
      group by 1
    )
    select (f.first_paid >= ${iso(range.start)}::timestamptz) as is_new, count(*)::int as n
    from buyers b join firsts f on f.customer = b.customer
    where b.customer is not null
    group by 1
  `)
  let newCount = 0
  let returningCount = 0
  for (const row of rows) {
    if (row.is_new) newCount += Number(row.n)
    else returningCount += Number(row.n)
  }
  return { newCount, returningCount }
}

/** Custom trip requests still open now (not completed, not cancelled). */
export async function openCustomRequests(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(customTripRequests)
    .where(notInArray(customTripRequests.status, ['completed', 'cancelled']))
  return row?.n ?? 0
}

/** Hours an open ticket may wait for its first answer (same as the escalation rule). */
export const TICKET_LATE_HOURS = 4

/**
 * Support tickets right now: open = waiting on us or on the customer (not
 * resolved, not closed); late = waiting on us with no first answer after
 * TICKET_LATE_HOURS.
 */
export async function openTickets(now = new Date()): Promise<{ open: number; late: number }> {
  const lateBefore = new Date(now.getTime() - TICKET_LATE_HOURS * 3_600_000)
  const [row] = await db
    .select({
      open: sql<number>`count(*)::int`,
      late: sql<number>`count(*) filter (where ${supportTickets.status} = 'open' and ${supportTickets.firstResponseAt} is null and ${supportTickets.createdAt} < ${lateBefore.toISOString()}::timestamptz)::int`,
    })
    .from(supportTickets)
    .where(inArray(supportTickets.status, ['open', 'pending_customer']))
  return { open: row?.open ?? 0, late: row?.late ?? 0 }
}

export const LOW_AVAILABILITY_LEFT = 2
export const LOW_AVAILABILITY_DAYS = 14

/**
 * Departures in the next 14 days with 2 places or fewer left (and not
 * closed) — from the capacity calendar.
 */
export async function lowAvailability(now = new Date()) {
  const today = new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
  const until = new Date(now.getTime() + (8 + 24 * LOW_AVAILABILITY_DAYS) * 3_600_000)
    .toISOString()
    .slice(0, 10)
  const capacity = sql<number>`coalesce(${activityAvailability.capacity}, ${activities.capacityPerSlot})`
  return db
    .select({
      activityId: activities.id,
      name: activities.name,
      slug: activities.slug,
      day: activityAvailability.day,
      slot: activityAvailability.slot,
      capacity,
      booked: activityAvailability.booked,
    })
    .from(activityAvailability)
    .innerJoin(activities, eq(activities.id, activityAvailability.activityId))
    .where(
      and(
        gte(activityAvailability.day, today),
        lt(activityAvailability.day, until),
        eq(activityAvailability.isClosed, false),
        sql`${capacity} is not null and ${capacity} > 0`,
        sql`${capacity} - ${activityAvailability.booked} <= ${LOW_AVAILABILITY_LEFT}`,
      ),
    )
    .orderBy(activityAvailability.day, activityAvailability.slot)
    .limit(200)
}

/**
 * Product view → purchase: visitors (who allowed statistics) that opened a
 * product page in the range, and how many of them bought in the range.
 */
export async function viewToPurchase(range: Range): Promise<{ viewers: number; buyers: number }> {
  const rows = await db.execute<{ viewers: number; buyers: number }>(sql`
    with viewers as (
      select distinct anon_id from ${analyticsEvents}
      where name in ('view_item', 'itinerary_view', 'package_view')
        and anon_id is not null
        and created_at >= ${iso(range.start)}::timestamptz and created_at < ${iso(range.end)}::timestamptz
    ),
    buyers as (
      select distinct anon_id from ${analyticsEvents}
      where name = 'purchase' and anon_id is not null
        and created_at >= ${iso(range.start)}::timestamptz and created_at < ${iso(range.end)}::timestamptz
    )
    select (select count(*) from viewers)::int as viewers,
           (select count(*) from viewers v join buyers b on b.anon_id = v.anon_id)::int as buyers
  `)
  const row = rows[0]
  return { viewers: Number(row?.viewers ?? 0), buyers: Number(row?.buyers ?? 0) }
}

/** Bookings value per bucket (Bali time) in one currency. */
export async function salesSeries(
  range: Range,
  bucket: Bucket,
  currency: string,
  f: F,
): Promise<Map<string, number>> {
  const key = sql<string>`to_char(${placedAt} at time zone 'Asia/Makassar', ${bucketSqlFormat(bucket)})`
  const line = lineFilter(f)
  const rows =
    line === null
      ? await db
          .select({ key, minor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::float8` })
          .from(orders)
          .where(
            and(
              everPaid,
              inRange(placedAt, range),
              eq(orders.presentmentCurrency, currency),
              staffCond(f),
            ),
          )
          .groupBy(sql`1`)
      : await db
          .select({
            key,
            minor: sql<number>`coalesce(sum(${orderItems.lineTotalMinor}), 0)::float8`,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orders.id, orderItems.orderId))
          .where(
            and(
              everPaid,
              inRange(placedAt, range),
              eq(orders.presentmentCurrency, currency),
              staffCond(f),
              line,
            ),
          )
          .groupBy(sql`1`)
  return new Map(rows.map((row) => [row.key, row.minor]))
}

/** Best-selling products (paid lines) in one currency. */
export async function topProducts(range: Range, currency: string, f: F, limit = 8) {
  const name = sql<
    Record<string, string>
  >`(array_agg(${orderItems.nameSnapshot} order by ${orderItems.createdAt} desc))[1]`
  const refKey = sql<string>`coalesce(${orderItems.refId}::text, ${orderItems.kind})`
  return db
    .select({
      kind: orderItems.kind,
      refId: refKey,
      name,
      count: sql<number>`count(*)::int`,
      minor: sql<number>`coalesce(sum(${orderItems.lineTotalMinor}), 0)::float8`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        everPaid,
        inRange(placedAt, range),
        soldLine,
        eq(orders.presentmentCurrency, currency),
        staffCond(f),
        lineFilter(f) ?? undefined,
      ),
    )
    .groupBy(orderItems.kind, refKey)
    .orderBy(sql`5 desc`, sql`4 desc`)
    .limit(limit)
}

/** Paid orders by where the visitor came from (last-touch UTM; empty = direct / unknown). */
export async function ordersBySource(range: Range, f: F) {
  return db
    .select({
      source: orders.utmSource,
      medium: orders.utmMedium,
      campaign: orders.utmCampaign,
      currency: orders.presentmentCurrency,
      count: sql<number>`count(*)::int`,
      minor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)::float8`,
    })
    .from(orders)
    .where(and(everPaid, inRange(placedAt, range), currencyCond(f), staffCond(f), orderHasLine(f)))
    .groupBy(orders.utmSource, orders.utmMedium, orders.utmCampaign, orders.presentmentCurrency)
}

/** Event counts by name in a range. */
export async function eventCounts(
  range: Range,
  names: readonly string[],
): Promise<Map<string, number>> {
  if (names.length === 0) return new Map()
  const rows = await db
    .select({ name: analyticsEvents.name, n: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(
      and(
        inArray(analyticsEvents.name, [...names]),
        gte(analyticsEvents.createdAt, range.start),
        lt(analyticsEvents.createdAt, range.end),
      ),
    )
    .groupBy(analyticsEvents.name)
  return new Map(rows.map((row) => [row.name, row.n]))
}

/** Events per item (kind + id) for one event name. */
export async function eventsByItem(range: Range, name: string, itemKind?: string) {
  return db
    .select({
      itemId: analyticsEvents.itemId,
      itemRef: analyticsEvents.itemRef,
      n: sql<number>`count(*)::int`,
      visitors: sql<number>`count(distinct coalesce(${analyticsEvents.anonId}, ${analyticsEvents.userId}::text))::int`,
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.name, name),
        itemKind ? eq(analyticsEvents.itemKind, itemKind) : undefined,
        gte(analyticsEvents.createdAt, range.start),
        lt(analyticsEvents.createdAt, range.end),
      ),
    )
    .groupBy(analyticsEvents.itemId, analyticsEvents.itemRef)
    .orderBy(sql`3 desc`)
    .limit(50)
}

/** Distinct visitors per funnel step (statistics consent only). */
export async function funnelSteps(range: Range, steps: readonly string[]) {
  const rows = await db
    .select({
      name: analyticsEvents.name,
      visitors: sql<number>`count(distinct coalesce(${analyticsEvents.anonId}, ${analyticsEvents.userId}::text))::int`,
    })
    .from(analyticsEvents)
    .where(
      and(
        inArray(analyticsEvents.name, [...steps]),
        gte(analyticsEvents.createdAt, range.start),
        lt(analyticsEvents.createdAt, range.end),
      ),
    )
    .groupBy(analyticsEvents.name)
  return new Map(rows.map((row) => [row.name, row.visitors]))
}

/** Suppliers that are not deleted, for the filter. */
export async function supplierOptions() {
  return db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(isNull(suppliers.deletedAt))
    .orderBy(suppliers.name)
}

/** Currencies that orders were placed in, most used first. */
export async function currencyOptions(): Promise<string[]> {
  const rows = await db
    .select({ currency: orders.presentmentCurrency, n: sql<number>`count(*)::int` })
    .from(orders)
    .groupBy(orders.presentmentCurrency)
    .orderBy(sql`2 desc`)
  return rows.map((row) => row.currency)
}

/**
 * Phase 6: team members for the "Staff" report filter — every account with a
 * Studio role, active or not (an inactive member's past orders still count).
 */
export async function staffOptions() {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(inArray(users.role, [...STUDIO_ROLES]), isNull(users.deletedAt)))
    .orderBy(users.name, users.email)
}

/** Staff and admins (for scheduled report recipients). */
export async function staffMembers() {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(and(inArray(users.role, ['staff', 'admin']), isNull(users.deletedAt)))
    .orderBy(users.email)
}
