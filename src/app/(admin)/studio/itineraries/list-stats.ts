/** Studio → Itineraries list: KPIs and per-row sales (phase 1, spec §5). */

import { and, count, eq, gte, inArray, isNull, notInArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import { activityLog, itineraries, orderItems, orders } from '@/db/schema'

const SETTLED = ['paid', 'confirmed', 'partially_refunded']
const VOID_ITEM = ['refunded', 'cancelled']

export interface ItineraryKpis {
  published: number
  drafts: number
  salesThisMonth: number
  /** Share (0–1) of this month's itinerary orders that also bought the map; null with no orders. */
  mapAttachRate: number | null
  downloadsThisMonth: number
}

function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export async function itineraryKpis(): Promise<ItineraryKpis> {
  const since = monthStart()
  const [statusRows, itineraryOrders, downloads] = await Promise.all([
    db
      .select({ status: itineraries.status, value: count() })
      .from(itineraries)
      .where(isNull(itineraries.deletedAt))
      .groupBy(itineraries.status),
    // This month's settled orders with a live itinerary line, and whether
    // the same order also holds a map/VIP plan line.
    db
      .select({
        orderId: orderItems.orderId,
        items: count(),
        withMap: sql<boolean>`bool_or(exists (
          select 1 from ${orderItems} as m
          where m.order_id = ${orderItems.orderId} and m.kind = 'plan'
        ))`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.kind, 'itinerary'),
          inArray(orders.status, SETTLED),
          notInArray(orderItems.fulfilmentStatus, VOID_ITEM),
          gte(orders.createdAt, since),
        ),
      )
      .groupBy(orderItems.orderId),
    db
      .select({ value: count() })
      .from(activityLog)
      .where(and(eq(activityLog.action, 'download_pdf'), gte(activityLog.createdAt, since))),
  ])
  const byStatus = new Map(statusRows.map((row) => [row.status, row.value]))
  const sales = itineraryOrders.reduce((sum, row) => sum + row.items, 0)
  const withMap = itineraryOrders.filter((row) => row.withMap).length
  return {
    published: byStatus.get('published') ?? 0,
    drafts: byStatus.get('draft') ?? 0,
    salesThisMonth: sales,
    mapAttachRate: itineraryOrders.length > 0 ? withMap / itineraryOrders.length : null,
    downloadsThisMonth: downloads[0]?.value ?? 0,
  }
}

/** Settled, unrefunded itinerary lines per itinerary (all time). */
export async function salesByItinerary(ids: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (ids.length === 0) return out
  const rows = await db
    .select({ id: orderItems.refId, value: count() })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.kind, 'itinerary'),
        inArray(orderItems.refId, [...ids]),
        inArray(orders.status, SETTLED),
        notInArray(orderItems.fulfilmentStatus, VOID_ITEM),
      ),
    )
    .groupBy(orderItems.refId)
  for (const row of rows) if (row.id) out.set(row.id, row.value)
  return out
}
