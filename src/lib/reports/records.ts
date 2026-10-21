import { and, desc, eq, gte, inArray, lt, ne, sql, type SQL } from 'drizzle-orm'

import { db } from '@/db'
import { orderItems, orders, payments, refunds, users } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'

import {
  BOOKABLE,
  COLLECTED,
  everPaid,
  inRange,
  lineFilter,
  lowAvailability,
  placedAt,
  soldLine,
  staffAnd,
  staffCond,
} from './data'
import type { ReportFilters } from './filters'
import { bookingGroup } from './metrics'
import type { Translate } from './builders/helpers'
import type { TableBlock } from './types'

/**
 * Drill-down: the records behind a number, with the same filters and the
 * same definition — so a figure on the dashboard can always be checked row
 * by row. Each row links to the order (or the activity) it came from.
 */

export const RECORD_METRICS = [
  'orders_paid',
  'orders_all',
  'collected',
  'payments',
  'refunds',
  'lines',
  'bookings',
  'customers',
  'low_availability',
] as const
export type RecordMetric = (typeof RECORD_METRICS)[number]

export function isRecordMetric(value: unknown): value is RecordMetric {
  return typeof value === 'string' && (RECORD_METRICS as readonly string[]).includes(value)
}

const LIMIT = 500
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface RecordsInput {
  metric: RecordMetric
  filters: ReportFilters
  group?: string | null
  status?: string | null
  ref?: string | null
  kind?: string | null
}

function groupLines(group: string | null | undefined): SQL | undefined {
  switch (group) {
    case 'itinerary':
      return sql`${orderItems.kind} = 'itinerary'`
    case 'activity_package':
      return sql`${orderItems.kind} in ('activity', 'activity_tier', 'package')`
    case 'vip':
      return sql`${orderItems.kind} = 'plan' and exists (select 1 from plans pl where pl.id = ${orderItems.refId} and pl.entitlement_kind = 'vip')`
    case 'bookable':
      return inArray(orderItems.kind, [...BOOKABLE])
    default:
      return undefined
  }
}

function refCond(ref: string | null | undefined): SQL | undefined {
  if (!ref) return undefined
  if (UUID.test(ref)) return eq(orderItems.refId, ref)
  if (/^[a-z_]{2,24}$/.test(ref))
    return sql`${orderItems.refId} is null and ${orderItems.kind} = ${ref}`
  return undefined
}

export async function recordsTable(
  input: RecordsInput,
  ctx: { t: Translate; intl: string; finance: boolean },
): Promise<TableBlock> {
  const { t, intl } = ctx
  const f = input.filters
  const range = { start: f.period.start, end: f.period.end }
  const locale = intl.startsWith('ar') ? 'ar' : 'en'
  const when = new Intl.DateTimeFormat(intl, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Makassar',
  })
  const asDate = (value: unknown) => {
    const d = value instanceof Date ? value : new Date(String(value))
    return Number.isNaN(d.getTime()) ? null : d
  }
  const currency = f.currency ? eq(orders.presentmentCurrency, f.currency) : undefined
  const line = lineFilter(f)
  const hasLine = line
    ? sql`exists (select 1 from order_items where order_items.order_id = ${orders.id} and ${line})`
    : undefined

  const base = { kind: 'table' as const, id: `records_${input.metric}`, empty: t('rp.empty') }

  if (input.metric === 'orders_paid' || input.metric === 'orders_all') {
    const rows = await db
      .select({
        id: orders.id,
        number: orders.orderNumber,
        status: orders.status,
        total: orders.totalMinor,
        currency: orders.presentmentCurrency,
        placed: placedAt,
        source: orders.utmSource,
        email: sql<string | null>`coalesce(${users.email}, ${orders.customerSnapshot}->>'email')`,
      })
      .from(orders)
      .leftJoin(users, eq(users.id, orders.userId))
      .where(
        and(
          inRange(placedAt, range),
          input.metric === 'orders_paid' ? everPaid : undefined,
          currency,
          staffCond(f),
          hasLine,
        ),
      )
      .orderBy(desc(placedAt))
      .limit(LIMIT)
    return {
      ...base,
      title: t(`rp.rec_${input.metric}`),
      columns: [
        { key: 'order', label: t('rp.col_order') },
        { key: 'customer', label: t('rp.col_customer') },
        { key: 'status', label: t('common.status') },
        { key: 'source', label: t('rp.col_source') },
        { key: 'total', label: t('common.total'), num: true },
        { key: 'placed', label: t('rp.col_placed') },
      ],
      rows: rows.map((row) => {
        const d = asDate(row.placed)
        return {
          order: { text: row.number, raw: row.number, href: `/orders/${row.id}` },
          customer: { text: row.email ?? '—', raw: row.email },
          status: { text: row.status, raw: row.status },
          source: { text: row.source ?? t('rp.source_direct'), raw: row.source },
          total: {
            text: formatMoney(row.total, row.currency, intl),
            raw: `${row.total} ${row.currency}`,
          },
          placed: { text: d ? when.format(d) : '—', raw: d?.toISOString() ?? null },
        }
      }),
    }
  }

  if (input.metric === 'collected' || input.metric === 'payments') {
    const statuses =
      input.metric === 'collected' || input.status === 'succeeded'
        ? [...COLLECTED]
        : input.status === 'failed'
          ? ['failed']
          : null
    const rows = await db
      .select({
        id: payments.id,
        orderId: orders.id,
        number: orders.orderNumber,
        provider: payments.provider,
        method: payments.method,
        status: payments.status,
        amount: payments.amountMinor,
        currency: payments.currency,
        created: payments.createdAt,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          gte(payments.createdAt, range.start),
          lt(payments.createdAt, range.end),
          statuses ? inArray(payments.status, statuses) : undefined,
          f.currency ? eq(payments.currency, f.currency) : undefined,
          staffCond(f),
          hasLine,
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(LIMIT)
    return {
      ...base,
      title: t(input.metric === 'collected' ? 'rp.rec_collected' : 'rp.rec_payments'),
      columns: [
        { key: 'order', label: t('rp.col_order') },
        { key: 'provider', label: t('rp.col_provider') },
        { key: 'status', label: t('common.status') },
        { key: 'amount', label: t('common.total'), num: true },
        { key: 'when', label: t('rp.col_when') },
      ],
      rows: rows.map((row) => ({
        order: { text: row.number, raw: row.number, href: `/orders/${row.orderId}` },
        provider: {
          text: `${row.provider}${row.method ? ` · ${row.method}` : ''}`,
          raw: row.provider,
        },
        status: { text: row.status, raw: row.status },
        amount: {
          text: formatMoney(row.amount, row.currency, intl),
          raw: `${row.amount} ${row.currency}`,
        },
        when: { text: when.format(row.created), raw: row.created.toISOString() },
      })),
    }
  }

  if (input.metric === 'refunds') {
    const rows = await db
      .select({
        orderId: orders.id,
        number: orders.orderNumber,
        amount: refunds.amountMinor,
        currency: refunds.currency,
        status: refunds.status,
        reason: refunds.reason,
        created: refunds.createdAt,
      })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .leftJoin(orderItems, eq(orderItems.id, refunds.orderItemId))
      .where(
        and(
          ne(refunds.status, 'failed'),
          gte(refunds.createdAt, range.start),
          lt(refunds.createdAt, range.end),
          f.currency ? eq(refunds.currency, f.currency) : undefined,
          staffCond(f),
          line ?? undefined,
        ),
      )
      .orderBy(desc(refunds.createdAt))
      .limit(LIMIT)
    return {
      ...base,
      title: t('rp.rec_refunds'),
      columns: [
        { key: 'order', label: t('rp.col_order') },
        { key: 'status', label: t('common.status') },
        { key: 'reason', label: t('rp.col_reason') },
        { key: 'amount', label: t('common.total'), num: true },
        { key: 'when', label: t('rp.col_when') },
      ],
      rows: rows.map((row) => ({
        order: { text: row.number, raw: row.number, href: `/orders/${row.orderId}` },
        status: { text: row.status, raw: row.status },
        reason: { text: row.reason ?? '—', raw: row.reason },
        amount: {
          text: formatMoney(row.amount, row.currency, intl),
          raw: `${row.amount} ${row.currency}`,
        },
        when: { text: when.format(row.created), raw: row.created.toISOString() },
      })),
    }
  }

  if (input.metric === 'lines' || input.metric === 'bookings') {
    const bookings = input.metric === 'bookings'
    const status = input.status && /^[a-z_]{2,24}$/.test(input.status) ? input.status : null
    const rows = await db
      .select({
        orderId: orders.id,
        number: orders.orderNumber,
        kind: orderItems.kind,
        name: orderItems.nameSnapshot,
        status: orderItems.bookingStatus,
        total: orderItems.lineTotalMinor,
        currency: orders.presentmentCurrency,
        cost: orderItems.costMinor,
        costCurrency: orderItems.costCurrency,
        supplierId: orderItems.supplierId,
        confirmedAt: orderItems.supplierConfirmedAt,
        travelDate: orderItems.travelDate,
        placed: placedAt,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          everPaid,
          inRange(placedAt, range),
          currency,
          staffCond(f),
          line ?? undefined,
          bookings ? inArray(orderItems.kind, [...BOOKABLE]) : soldLine,
          groupLines(bookings ? null : input.group),
          refCond(input.ref),
          status ? eq(orderItems.bookingStatus, status) : undefined,
        ),
      )
      .orderBy(desc(placedAt))
      .limit(bookings ? 5000 : LIMIT)
    const group = bookings ? input.group : null
    const filtered = rows.filter((row) => {
      if (!group) return true
      if (group === 'supplier') return row.supplierId !== null && row.kind !== 'driver'
      return bookingGroup(row.status) === group
    })
    const columns: TableBlock['columns'] = [
      { key: 'order', label: t('rp.col_order') },
      { key: 'name', label: t('rp.col_product') },
      { key: 'kind', label: t('rp.col_type') },
      { key: 'status', label: t('common.status') },
      { key: 'total', label: t('common.total'), num: true },
    ]
    if (ctx.finance) columns.push({ key: 'cost', label: t('rp.kpi_supplier_cost'), num: true })
    columns.push(
      { key: 'travel', label: t('rp.col_travel_date') },
      { key: 'placed', label: t('rp.col_placed') },
    )
    return {
      ...base,
      title: t(bookings ? 'rp.rec_bookings' : 'rp.rec_lines'),
      columns,
      rows: filtered.slice(0, LIMIT).map((row) => {
        const d = asDate(row.placed)
        return {
          order: { text: row.number, raw: row.number, href: `/orders/${row.orderId}` },
          name: { text: pick(row.name, locale), raw: pick(row.name, 'en') },
          kind: { text: t(`rp.kind_${row.kind}`), raw: row.kind },
          status: { text: t(`rp.status_${row.status}`), raw: row.status },
          total: {
            text: formatMoney(row.total, row.currency, intl),
            raw: `${row.total} ${row.currency}`,
          },
          ...(ctx.finance
            ? {
                cost: {
                  text:
                    row.cost === null || !row.costCurrency
                      ? '—'
                      : formatMoney(row.cost, row.costCurrency, intl),
                  raw: row.cost === null ? null : `${row.cost} ${row.costCurrency ?? ''}`,
                },
              }
            : {}),
          travel: { text: row.travelDate ?? '—', raw: row.travelDate },
          placed: { text: d ? when.format(d) : '—', raw: d?.toISOString() ?? null },
        }
      }),
    }
  }

  if (input.metric === 'customers') {
    const kind = input.kind === 'new' || input.kind === 'returning' ? input.kind : null
    const rows = await db.execute<{
      customer: string
      user_id: string | null
      email: string | null
      orders: number
      first_paid: string
    }>(sql`
      with buyers as (
        select coalesce(o.user_id::text, lower(o.customer_snapshot->>'email')) as customer,
               max(o.user_id::text) as user_id,
               max(coalesce(u.email, o.customer_snapshot->>'email')) as email,
               count(*)::int as orders
        from ${orders} o left join ${users} u on u.id = o.user_id
        where exists (select 1 from payments pp where pp.order_id = o.id and pp.status in ('succeeded', 'refunded'))
          and coalesce(o.placed_at, o.created_at) >= ${range.start.toISOString()}::timestamptz
          and coalesce(o.placed_at, o.created_at) < ${range.end.toISOString()}::timestamptz
          ${f.currency ? sql`and o.presentment_currency = ${f.currency}` : sql``}
          ${staffAnd(f, sql`o.id`)}
        group by 1
      ),
      firsts as (
        select coalesce(o.user_id::text, lower(o.customer_snapshot->>'email')) as customer,
               min(coalesce(o.placed_at, o.created_at)) as first_paid
        from ${orders} o
        where exists (select 1 from payments pp where pp.order_id = o.id and pp.status in ('succeeded', 'refunded'))
        group by 1
      )
      select b.customer, b.user_id, b.email, b.orders, f.first_paid
      from buyers b join firsts f on f.customer = b.customer
      where b.customer is not null
      ${
        kind === 'new'
          ? sql`and f.first_paid >= ${range.start.toISOString()}::timestamptz`
          : kind === 'returning'
            ? sql`and f.first_paid < ${range.start.toISOString()}::timestamptz`
            : sql``
      }
      order by b.orders desc
      limit ${LIMIT}
    `)
    return {
      ...base,
      title: t('rp.rec_customers'),
      columns: [
        { key: 'customer', label: t('rp.col_customer') },
        { key: 'orders', label: t('rp.col_orders'), num: true },
        { key: 'first', label: t('rp.col_first_paid') },
      ],
      rows: [...rows].map((row) => {
        const d = asDate(row.first_paid)
        return {
          customer: {
            text: row.email ?? '—',
            raw: row.email,
            ...(row.user_id ? { href: `/customers/${row.user_id}` } : {}),
          },
          orders: { text: String(row.orders), raw: Number(row.orders) },
          first: { text: d ? when.format(d) : '—', raw: d?.toISOString() ?? null },
        }
      }),
    }
  }

  // low_availability: live capacity, not orders — the staff filter does not apply.
  const rows = await lowAvailability()
  return {
    ...base,
    ...(f.staffId ? { staffNA: true } : {}),
    title: t('rp.rec_low_availability'),
    columns: [
      { key: 'activity', label: t('rp.col_product') },
      { key: 'day', label: t('rp.col_travel_date') },
      { key: 'slot', label: t('rp.col_slot') },
      { key: 'left', label: t('rp.col_left'), num: true },
    ],
    rows: rows.map((row) => ({
      activity: {
        text: pick(row.name, locale, row.slug),
        raw: row.slug,
        href: `/capacity?activity=${row.activityId}`,
      },
      day: { text: row.day, raw: row.day },
      slot: { text: row.slot === '' ? t('rp.whole_day') : row.slot, raw: row.slot },
      left: {
        text: String(Number(row.capacity) - row.booked),
        raw: Number(row.capacity) - row.booked,
      },
    })),
  }
}
