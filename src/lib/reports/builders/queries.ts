import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  activityLog,
  analyticsEvents,
  checkoutReminders,
  clientErrors,
  entitlements,
  itineraries,
  mapPlaces,
  orderItems,
  orders,
  payments,
  regions,
  suppliers,
} from '@/db/schema'

import { BOOKABLE, everPaid, inRange, lineFilter, placedAt, soldLine, type Range } from '../data'
import type { ReportFilters } from '../filters'

/**
 * Queries used by single reports (the shared ones are in ../data). Same
 * rules: paid = a payment went through; order day = day placed (Bali);
 * money grouped by currency.
 */

type F = Pick<ReportFilters, 'type' | 'supplierId' | 'currency'>

const iso = (d: Date) => d.toISOString()

function currencyCond(f: F) {
  return f.currency ? eq(orders.presentmentCurrency, f.currency) : undefined
}

/** When the order was paid: its first payment that went through. */
const paidAt = sql<
  string | null
>`(select min(pp.created_at) from payments pp where pp.order_id = ${orders.id} and pp.status in ('succeeded', 'refunded'))`

/** Bookable lines of paid orders placed in the range, with supplier timing. */
export async function bookingLines(range: Range, f: F) {
  return db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      kind: orderItems.kind,
      refId: orderItems.refId,
      name: orderItems.nameSnapshot,
      status: orderItems.bookingStatus,
      supplierId: orderItems.supplierId,
      supplierName: suppliers.name,
      confirmedAt: orderItems.supplierConfirmedAt,
      paidAt,
      lineTotalMinor: orderItems.lineTotalMinor,
      costMinor: orderItems.costMinor,
      costCurrency: orderItems.costCurrency,
      settlementId: orderItems.settlementId,
      currency: orders.presentmentCurrency,
      options: orderItems.options,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(suppliers, eq(suppliers.id, orderItems.supplierId))
    .where(
      and(
        everPaid,
        inRange(placedAt, range),
        inArray(orderItems.kind, [...BOOKABLE]),
        currencyCond(f),
        lineFilter(f) ?? undefined,
      ),
    )
    .limit(20_000)
}

/** Paid itinerary lines in the range, with whether the same order had VIP. */
export async function itineraryLines(range: Range, f: F) {
  return db
    .select({
      orderId: orderItems.orderId,
      refId: orderItems.refId,
      name: orderItems.nameSnapshot,
      lineTotalMinor: orderItems.lineTotalMinor,
      currency: orders.presentmentCurrency,
      withVip: sql<boolean>`exists (
        select 1 from order_items v join plans pl on pl.id = v.ref_id
        where v.order_id = ${orders.id} and v.kind = 'plan' and pl.entitlement_kind = 'vip')
        or exists (select 1 from itineraries it where it.id = ${orderItems.refId} and it.map_access = 'vip_included')`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        everPaid,
        inRange(placedAt, range),
        eq(orderItems.kind, 'itinerary'),
        soldLine,
        currencyCond(f),
      ),
    )
    .limit(20_000)
}

export async function itineraryNames() {
  return db
    .select({ id: itineraries.id, slug: itineraries.slug, name: itineraries.name })
    .from(itineraries)
    .where(isNull(itineraries.deletedAt))
}

/** VIP access rows: live now, granted in range, ended in range, and how they came. */
export async function vipFacts(range: Range, now: Date) {
  const source = sql<string>`case
    when ${entitlements.sharedByUserId} is not null then 'family'
    when ${entitlements.grantedByOrderId} is null then 'staff'
    when exists (select 1 from order_items x where x.order_id = ${entitlements.grantedByOrderId} and (x.kind = 'package' or x.options ? 'includedInPackage')) then 'package'
    when exists (select 1 from order_items x where x.order_id = ${entitlements.grantedByOrderId} and x.kind = 'itinerary') then 'itinerary'
    else 'standalone' end`
  const [live] = await db
    .select({ users: sql<number>`count(distinct ${entitlements.userId})::int` })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.kind, 'vip'),
        isNull(entitlements.revokedAt),
        sql`${entitlements.startsAt} <= ${iso(now)}::timestamptz`,
        sql`(${entitlements.expiresAt} is null or ${entitlements.expiresAt} > ${iso(now)}::timestamptz)`,
      ),
    )
  const granted = await db
    .select({ source, n: sql<number>`count(*)::int` })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.kind, 'vip'),
        gte(entitlements.createdAt, range.start),
        lt(entitlements.createdAt, range.end),
      ),
    )
    .groupBy(sql`1`)
  const [ended] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.kind, 'vip'),
        isNull(entitlements.revokedAt),
        gte(entitlements.expiresAt, range.start),
        lt(entitlements.expiresAt, range.end),
      ),
    )
  const [renewed] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.kind, 'vip'),
        gte(entitlements.createdAt, range.start),
        lt(entitlements.createdAt, range.end),
        sql`exists (select 1 from entitlements e2 where e2.user_id = ${entitlements.userId} and e2.kind = 'vip' and e2.id <> ${entitlements.id} and e2.created_at < ${entitlements.createdAt})`,
      ),
    )
  return {
    activeUsers: live?.users ?? 0,
    granted: new Map(granted.map((row) => [row.source, row.n])),
    ended: ended?.n ?? 0,
    renewed: renewed?.n ?? 0,
  }
}

/**
 * Free → VIP: signed-in people who opened the Free map in the range, and how
 * many of them got VIP later in the same range.
 */
export async function freeToVip(range: Range) {
  const rows = await db.execute<{ free_users: number; upgraded: number }>(sql`
    with free_users as (
      select user_id, min(created_at) as first_free from ${analyticsEvents}
      where name = 'view_free_map' and user_id is not null
        and created_at >= ${iso(range.start)}::timestamptz and created_at < ${iso(range.end)}::timestamptz
      group by user_id
    )
    select (select count(*) from free_users)::int as free_users,
           (select count(*) from free_users f where exists (
              select 1 from entitlements e where e.user_id = f.user_id and e.kind = 'vip'
                and e.created_at > f.first_free and e.created_at < ${iso(range.end)}::timestamptz))::int as upgraded
  `)
  return { freeUsers: Number(rows[0]?.free_users ?? 0), upgraded: Number(rows[0]?.upgraded ?? 0) }
}

/** Place views in the range, with region and access level. */
export async function placeViews(range: Range, limit = 15) {
  return db
    .select({
      placeId: mapPlaces.id,
      name: mapPlaces.name,
      slug: mapPlaces.slug,
      vip: sql<boolean>`${mapPlaces.requiredEntitlement} = 'vip' and not ${mapPlaces.isFree}`,
      region: regions.label,
      views: sql<number>`count(*)::int`,
    })
    .from(analyticsEvents)
    .innerJoin(mapPlaces, eq(mapPlaces.id, analyticsEvents.itemId))
    .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
    .where(
      and(
        eq(analyticsEvents.name, 'map_place_view'),
        gte(analyticsEvents.createdAt, range.start),
        lt(analyticsEvents.createdAt, range.end),
      ),
    )
    .groupBy(mapPlaces.id, mapPlaces.name, mapPlaces.slug, regions.label)
    .orderBy(sql`count(*) desc`)
    .limit(limit)
}

export async function regionViews(range: Range) {
  return db
    .select({
      region: regions.label,
      key: regions.key,
      views: sql<number>`count(*)::int`,
    })
    .from(analyticsEvents)
    .innerJoin(mapPlaces, eq(mapPlaces.id, analyticsEvents.itemId))
    .innerJoin(regions, eq(regions.id, mapPlaces.regionId))
    .where(
      and(
        eq(analyticsEvents.name, 'map_place_view'),
        gte(analyticsEvents.createdAt, range.start),
        lt(analyticsEvents.createdAt, range.end),
      ),
    )
    .groupBy(regions.label, regions.key)
    .orderBy(sql`count(*) desc`)
    .limit(12)
}

/** Event counts grouped by one prop key (filters used, VIP purchase source…). */
export async function eventsByProp(range: Range, name: string, prop: string) {
  const value = sql<string>`coalesce(${analyticsEvents.props}->>${prop}, '')`
  return db
    .select({ value, n: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.name, name),
        gte(analyticsEvents.createdAt, range.start),
        lt(analyticsEvents.createdAt, range.end),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`)
    .limit(20)
}

/** Distinct visitors per device type for an event. */
export async function devicesFor(range: Range, names: readonly string[]) {
  return db
    .select({
      device: analyticsEvents.deviceType,
      visitors: sql<number>`count(distinct coalesce(${analyticsEvents.anonId}, ${analyticsEvents.userId}::text))::int`,
    })
    .from(analyticsEvents)
    .where(
      and(
        inArray(analyticsEvents.name, [...names]),
        gte(analyticsEvents.createdAt, range.start),
        lt(analyticsEvents.createdAt, range.end),
      ),
    )
    .groupBy(analyticsEvents.deviceType)
}

/** Free / VIP map visitors (distinct) in the range. */
export async function mapVisitors(range: Range) {
  return db
    .select({
      name: analyticsEvents.name,
      visitors: sql<number>`count(distinct coalesce(${analyticsEvents.anonId}, ${analyticsEvents.userId}::text))::int`,
      users: sql<number>`count(distinct ${analyticsEvents.userId})::int`,
    })
    .from(analyticsEvents)
    .where(
      and(
        inArray(analyticsEvents.name, ['view_map', 'view_free_map', 'view_vip_map']),
        gte(analyticsEvents.createdAt, range.start),
        lt(analyticsEvents.createdAt, range.end),
      ),
    )
    .groupBy(analyticsEvents.name)
}

/** Bookings that came after a map → activity click by the same visitor (same range). */
export async function bookingsFromMap(range: Range) {
  const rows = await db.execute<{ n: number }>(sql`
    select count(distinct p.id)::int as n
    from ${analyticsEvents} c
    join ${analyticsEvents} p on p.anon_id = c.anon_id and p.name = 'add_to_cart'
      and p.item_id = (select a.id from activities a where a.slug = c.item_ref limit 1)
      and p.created_at > c.created_at
    where c.name = 'map_to_activity_click' and c.anon_id is not null
      and c.created_at >= ${iso(range.start)}::timestamptz and c.created_at < ${iso(range.end)}::timestamptz
      and p.created_at < ${iso(range.end)}::timestamptz
  `)
  return Number(rows[0]?.n ?? 0)
}

/** Map load errors reported by browsers, by code. */
export async function mapErrors(range: Range) {
  return db
    .select({ code: clientErrors.code, n: sql<number>`count(*)::int` })
    .from(clientErrors)
    .where(
      and(
        eq(clientErrors.area, 'map'),
        gte(clientErrors.createdAt, range.start),
        lt(clientErrors.createdAt, range.end),
      ),
    )
    .groupBy(clientErrors.code)
    .orderBy(sql`2 desc`)
}

/** Add-ons sold: from the frozen price lines of paid activity bookings. */
export async function addonSales(range: Range, f: F) {
  const rows = await db.execute<{
    ref_id: string | null
    name: Record<string, string> | null
    qty: number
    minor: number
    currency: string
    bookings: number
  }>(sql`
    select l->>'refId' as ref_id, (array_agg(l->'name'))[1] as name,
           sum((l->>'quantity')::numeric)::float8 as qty,
           sum((l->>'totalMinor')::numeric)::float8 as minor,
           o.presentment_currency as currency,
           count(distinct oi.id)::int as bookings
    from ${orderItems} oi
    join ${orders} o on o.id = oi.order_id
    cross join lateral jsonb_array_elements(coalesce(oi.options->'lines', '[]'::jsonb)) l
    where l->>'kind' = 'addon'
      and exists (select 1 from payments pp where pp.order_id = o.id and pp.status in ('succeeded', 'refunded'))
      and coalesce(o.placed_at, o.created_at) >= ${iso(range.start)}::timestamptz
      and coalesce(o.placed_at, o.created_at) < ${iso(range.end)}::timestamptz
      ${f.currency ? sql`and o.presentment_currency = ${f.currency}` : sql``}
    group by l->>'refId', o.presentment_currency
    order by 4 desc
    limit 30
  `)
  return [...rows]
}

/** Customers: lifetime totals (paid − refunded) and inactivity. */
export async function customerTotals(now: Date, inactiveDays = 180) {
  const rows = await db.execute<{
    customer: string
    currency: string
    paid: number
    refunded: number
    orders: number
    last_paid: string
  }>(sql`
    select coalesce(o.user_id::text, lower(o.customer_snapshot->>'email')) as customer,
           o.presentment_currency as currency,
           sum(o.total_minor)::float8 as paid,
           coalesce(sum((select coalesce(sum(r.amount_minor), 0) from refunds r join payments p on p.id = r.payment_id
                          where p.order_id = o.id and r.status <> 'failed')), 0)::float8 as refunded,
           count(*)::int as orders,
           max(coalesce(o.placed_at, o.created_at)) as last_paid
    from ${orders} o
    where exists (select 1 from payments pp where pp.order_id = o.id and pp.status in ('succeeded', 'refunded'))
    group by 1, 2
  `)
  const cutoff = now.getTime() - inactiveDays * 86_400_000
  return [...rows]
    .filter((row) => row.customer !== null)
    .map((row) => ({
      customer: row.customer,
      currency: row.currency,
      paidMinor: Number(row.paid),
      refundedMinor: Number(row.refunded),
      orders: Number(row.orders),
      inactive: new Date(row.last_paid).getTime() < cutoff,
    }))
}

/** Paid orders of the range (for AOV). */
export async function paidOrders(range: Range, f: F) {
  return db
    .select({ currency: orders.presentmentCurrency, totalMinor: orders.totalMinor })
    .from(orders)
    .where(and(everPaid, inRange(placedAt, range), currencyCond(f)))
    .limit(50_000)
}

/** Visitors by campaign source (statistics consent), and abandoned checkouts. */
export async function visitorsBySource(range: Range) {
  return db
    .select({
      source: analyticsEvents.utmSource,
      medium: analyticsEvents.utmMedium,
      campaign: analyticsEvents.utmCampaign,
      visitors: sql<number>`count(distinct ${analyticsEvents.anonId})::int`,
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.name, 'page_view'),
        gte(analyticsEvents.createdAt, range.start),
        lt(analyticsEvents.createdAt, range.end),
      ),
    )
    .groupBy(analyticsEvents.utmSource, analyticsEvents.utmMedium, analyticsEvents.utmCampaign)
}

export async function abandonedCheckouts(range: Range) {
  const rows = await db.execute<{ started: number; abandoned: number }>(sql`
    with started as (
      select distinct coalesce(anon_id, user_id::text) as v from ${analyticsEvents}
      where name = 'begin_checkout' and coalesce(anon_id, user_id::text) is not null
        and created_at >= ${iso(range.start)}::timestamptz and created_at < ${iso(range.end)}::timestamptz
    ),
    bought as (
      select distinct coalesce(anon_id, user_id::text) as v from ${analyticsEvents}
      where name = 'purchase'
        and created_at >= ${iso(range.start)}::timestamptz
    )
    select (select count(*) from started)::int as started,
           (select count(*) from started s where not exists (select 1 from bought b where b.v = s.v))::int as abandoned
  `)
  const [reminded] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(checkoutReminders)
    .where(and(gte(checkoutReminders.sentAt, range.start), lt(checkoutReminders.sentAt, range.end)))
  return {
    started: Number(rows[0]?.started ?? 0),
    abandoned: Number(rows[0]?.abandoned ?? 0),
    reminded: reminded?.n ?? 0,
  }
}

/** Operations: failed payments, unprocessed paid bookings, stale unpaid orders, denied files. */
export async function failedPayments(range: Range, limit = 25) {
  return db
    .select({
      id: payments.id,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      provider: payments.provider,
      method: payments.method,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        eq(payments.status, 'failed'),
        gte(payments.createdAt, range.start),
        lt(payments.createdAt, range.end),
      ),
    )
    .orderBy(sql`${payments.createdAt} desc`)
    .limit(limit)
}

export const UNPROCESSED_AFTER_HOURS = 24

export async function unprocessedBookings(now: Date, limit = 50) {
  const before = new Date(now.getTime() - UNPROCESSED_AFTER_HOURS * 3_600_000)
  return db
    .select({
      itemId: orderItems.id,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      name: orderItems.nameSnapshot,
      status: orderItems.bookingStatus,
      travelDate: orderItems.travelDate,
      placed: placedAt,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        everPaid,
        inArray(orderItems.kind, [...BOOKABLE]),
        inArray(orderItems.bookingStatus, [
          'created',
          'pending_supplier',
          'pending_availability',
          'sent_to_provider',
        ]),
        sql`${placedAt} < ${iso(before)}::timestamptz`,
        inArray(orders.status, ['paid', 'confirmed', 'partially_refunded']),
      ),
    )
    .orderBy(placedAt)
    .limit(limit)
}

export async function staleUnpaidOrders(now: Date) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'pending'),
        sql`${orders.createdAt} < ${iso(new Date(now.getTime() - 3_600_000))}::timestamptz`,
      ),
    )
  return row?.n ?? 0
}

export async function deniedDownloads(range: Range) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.action, 'unauthorized_access'),
        sql`(${activityLog.details}->>'resource' like 'schedule:%' or ${activityLog.details}->>'resource' like 'custom:%')`,
        gte(activityLog.createdAt, range.start),
        lt(activityLog.createdAt, range.end),
      ),
    )
  return row?.n ?? 0
}
