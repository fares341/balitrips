import { and, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm'

import { db } from '@/db'
import { orderItems, orders, suppliers, type Localized } from '@/db/schema'

import { param } from '../../_lib/result'

/**
 * Profit figures (Studio → الأرباح). Shared by the page and its CSV export so
 * the file always matches the screen.
 *
 *   sales      = what the lines were sold for (before any discount code)
 *   charged    = what the customer paid: sales − discount + fees + tax
 *   refunded   = money given back
 *   revenue    = charged − tax − refunded   (tax is not ours)
 *   cost       = what we pay suppliers (order_items.cost_minor), only for
 *                lines not fully refunded, only in the order's own currency
 *   margin     = revenue − cost
 *
 * Every figure is per currency: amounts in different currencies are never added.
 */

export const PAID_STATUSES = ['paid', 'confirmed', 'partially_refunded', 'refunded'] as const

type Params = Record<string, string | string[] | undefined>

export interface ProfitFilters {
  from: string | null
  to: string | null
  where: SQL | undefined
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Dates are Bali calendar days (UTC+8), inclusive. */
export function profitFilters(params: Params): ProfitFilters {
  const rawFrom = param(params, 'from')
  const rawTo = param(params, 'to')
  const from = rawFrom && DATE.test(rawFrom) ? rawFrom : null
  const to = rawTo && DATE.test(rawTo) ? rawTo : null
  const placed = sql`coalesce(${orders.placedAt}, ${orders.createdAt})`
  const parts: SQL[] = [inArray(orders.status, [...PAID_STATUSES])]
  if (from) parts.push(gte(placed, new Date(`${from}T00:00:00+08:00`)))
  if (to) {
    const end = new Date(`${to}T00:00:00+08:00`)
    end.setUTCDate(end.getUTCDate() + 1)
    parts.push(lt(placed, end))
  }
  return { from, to, where: and(...parts) }
}

export interface OrderProfitRow {
  id: string
  orderNumber: string
  placedAt: Date
  currency: string
  subtotalMinor: number
  discountMinor: number
  feesMinor: number
  taxMinor: number
  totalMinor: number
  refundedMinor: number
  costMinor: number
  /** Lines whose supplier cost is in another currency (not counted in cost). */
  foreignCostLines: number
}

export async function loadOrderProfit(where: SQL | undefined, limit = 20_000) {
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      placedAt: sql<Date>`coalesce(${orders.placedAt}, ${orders.createdAt})`,
      currency: orders.presentmentCurrency,
      subtotalMinor: orders.subtotalMinor,
      discountMinor: orders.discountMinor,
      feesMinor: orders.feesMinor,
      taxMinor: orders.taxMinor,
      totalMinor: orders.totalMinor,
      refundedMinor: sql<string>`(select coalesce(sum(i.refunded_minor), 0) from order_items i where i.order_id = ${orders.id})::text`,
      costMinor: sql<string>`(select coalesce(sum(i.cost_minor), 0) from order_items i where i.order_id = ${orders.id} and i.cost_currency = ${orders.presentmentCurrency} and i.refunded_minor < i.line_total_minor)::text`,
      foreignCostLines: sql<number>`(select count(*) from order_items i where i.order_id = ${orders.id} and i.cost_minor is not null and i.cost_currency <> ${orders.presentmentCurrency})::int`,
    })
    .from(orders)
    .where(where)
    .orderBy(desc(sql`coalesce(${orders.placedAt}, ${orders.createdAt})`))
    .limit(limit)
  return rows.map(
    (row): OrderProfitRow => ({
      ...row,
      placedAt: new Date(row.placedAt),
      refundedMinor: Number(row.refundedMinor),
      costMinor: Number(row.costMinor),
    }),
  )
}

export interface Totals {
  orders: number
  sales: number
  discount: number
  fees: number
  tax: number
  charged: number
  refunded: number
  revenue: number
  cost: number
  margin: number
}

export function emptyTotals(): Totals {
  return {
    orders: 0,
    sales: 0,
    discount: 0,
    fees: 0,
    tax: 0,
    charged: 0,
    refunded: 0,
    revenue: 0,
    cost: 0,
    margin: 0,
  }
}

export function addOrder(totals: Totals, row: OrderProfitRow): Totals {
  const revenue = row.totalMinor - row.taxMinor - row.refundedMinor
  return {
    orders: totals.orders + 1,
    sales: totals.sales + row.subtotalMinor,
    discount: totals.discount + row.discountMinor,
    fees: totals.fees + row.feesMinor,
    tax: totals.tax + row.taxMinor,
    charged: totals.charged + row.totalMinor,
    refunded: totals.refunded + row.refundedMinor,
    revenue: totals.revenue + revenue,
    cost: totals.cost + row.costMinor,
    margin: totals.margin + revenue - row.costMinor,
  }
}

/** Bali month `YYYY-MM` of an instant. */
export function baliMonth(at: Date): string {
  return new Date(at.getTime() + 8 * 3_600_000).toISOString().slice(0, 7)
}

export interface LineGroupRow {
  key: string
  name: Localized | null
  kind: string
  currency: string
  lines: number
  salesMinor: number
  refundedMinor: number
  costMinor: number
}

/** Sales, refunds and supplier cost per product (kind + catalogue id). */
export async function loadByProduct(where: SQL | undefined): Promise<LineGroupRow[]> {
  const rows = await db
    .select({
      kind: orderItems.kind,
      refId: orderItems.refId,
      currency: orders.presentmentCurrency,
      name: sql<Localized | null>`(array_agg(${orderItems.nameSnapshot}))[1]`,
      lines: sql<number>`count(*)::int`,
      salesMinor: sql<string>`coalesce(sum(${orderItems.lineTotalMinor}), 0)::text`,
      refundedMinor: sql<string>`coalesce(sum(${orderItems.refundedMinor}), 0)::text`,
      costMinor: sql<string>`coalesce(sum(case when ${orderItems.costCurrency} = ${orders.presentmentCurrency} and ${orderItems.refundedMinor} < ${orderItems.lineTotalMinor} then ${orderItems.costMinor} else 0 end), 0)::text`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(where, sql`${orderItems.lineTotalMinor} > 0`))
    .groupBy(orderItems.kind, orderItems.refId, orders.presentmentCurrency)
    .orderBy(desc(sql`sum(${orderItems.lineTotalMinor})`))
    .limit(200)
  return rows.map((row) => ({
    key: `${row.kind}:${row.refId ?? '-'}:${row.currency}`,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    lines: row.lines,
    salesMinor: Number(row.salesMinor),
    refundedMinor: Number(row.refundedMinor),
    costMinor: Number(row.costMinor),
  }))
}

export interface SupplierGroupRow {
  supplierId: string
  supplierName: string
  currency: string
  lines: number
  salesMinor: number
  refundedMinor: number
  costMinor: number
}

/** The same per supplier — only lines a supplier runs. */
export async function loadBySupplier(where: SQL | undefined): Promise<SupplierGroupRow[]> {
  const rows = await db
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      currency: orders.presentmentCurrency,
      lines: sql<number>`count(*)::int`,
      salesMinor: sql<string>`coalesce(sum(${orderItems.lineTotalMinor}), 0)::text`,
      refundedMinor: sql<string>`coalesce(sum(${orderItems.refundedMinor}), 0)::text`,
      costMinor: sql<string>`coalesce(sum(case when ${orderItems.costCurrency} = ${orders.presentmentCurrency} and ${orderItems.refundedMinor} < ${orderItems.lineTotalMinor} then ${orderItems.costMinor} else 0 end), 0)::text`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orderItems.supplierId))
    .where(where)
    .groupBy(suppliers.id, suppliers.name, orders.presentmentCurrency)
    .orderBy(suppliers.name)
  return rows.map((row) => ({
    ...row,
    salesMinor: Number(row.salesMinor),
    refundedMinor: Number(row.refundedMinor),
    costMinor: Number(row.costMinor),
  }))
}
