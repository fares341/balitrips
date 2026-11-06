import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'

import { db } from '@/db'
import { leadContacts, orderItems, orders, payments, refunds, suppliers, users } from '@/db/schema'
import type { Translate } from '@/app/(admin)/_i18n'
import {
  orderStatusLabel,
  paymentProviderName,
  paymentStatusLabel,
} from '@/app/(admin)/studio/orders/labels'
import { PAID_ORDER_STATUSES, payableWhere } from '@/app/(admin)/studio/payables/queries'
import { can, type Capability, type Role } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { studioSarMinor } from '@/lib/currency/studio'
import { formatMoney } from '@/lib/money'

/**
 * Listing PDFs (Studio v2): the rows of a Studio list or report screen as an
 * Arabic, right-to-left A4 document in SAR — orders, payments, refunds,
 * supplier payables, customers, sales and itinerary sales, plus the monthly
 * accountant's report that puts four of them together.
 *
 * Built in the worker (Chromium renders it, see ./listing-html.ts) from the
 * filters the screen had, with the requester's CURRENT role. Every amount is
 * converted to SAR with the Studio rate; customer contact details never go
 * into a PDF, and customer names only for a role that may export customers.
 */

export const LISTING_KINDS = [
  'sales',
  'orders',
  'payments',
  'refunds',
  'payables',
  'customers',
  'itinerary_sales',
  'accountant',
  'leads',
] as const
export type ListingKind = (typeof LISTING_KINDS)[number]

export function isListingKind(value: unknown): value is ListingKind {
  return typeof value === 'string' && (LISTING_KINDS as readonly string[]).includes(value)
}

/** Who may make each PDF: the same people who see the screen's CSV / figures. */
export const LISTING_ACCESS: Record<ListingKind, Capability> = {
  sales: 'reports.read',
  orders: 'orders.read',
  payments: 'payments.read',
  refunds: 'payments.read',
  payables: 'suppliers.write',
  customers: 'customers.export',
  itinerary_sales: 'reports.read',
  accountant: 'finance.read',
  leads: 'customers.export',
}

export function mayExportListing(role: Role, kind: ListingKind): boolean {
  return can(role, 'admin.access') && can(role, LISTING_ACCESS[kind])
}

/** `report_exports.report` value for a listing (the column is 32 chars). */
export const listingReportId = (kind: ListingKind) => `list:${kind}`

export function listingKindOf(report: string): ListingKind | null {
  const kind = report.startsWith('list:') ? report.slice(5) : null
  return isListingKind(kind) ? kind : null
}

export interface ListingFilters {
  from: string | null
  to: string | null
  status: string | null
  q: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function parseListingFilters(params: Record<string, unknown>): ListingFilters {
  const str = (key: string) => {
    const value = params[key]
    return typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 100) : null
  }
  const date = (key: string) => {
    const value = str(key)
    return value && ISO_DATE.test(value) ? value : null
  }
  return { from: date('from'), to: date('to'), status: str('status'), q: str('q') }
}

export function listingParams(filters: ListingFilters): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(filters)) if (value) out[key] = value
  return out
}

export interface ListingColumn {
  label: string
  num?: boolean
}

export interface ListingSection {
  title: string
  columns: ListingColumn[]
  rows: string[][]
  /** Label → SAR total, already formatted. */
  totals: [string, string][]
  /** Rows left out because of the row cap. */
  truncated: number
}

export interface ListingDoc {
  title: string
  sections: ListingSection[]
}

export interface ListingContext {
  t: Translate
  intl: string
  role: Role
  locale: 'ar' | 'en'
}

const ROW_CAP = 1500

const baliDay = (column: SQL | unknown) =>
  sql<string>`to_char((${column} at time zone 'Asia/Makassar'), 'YYYY-MM-DD')`

function dayRange(column: unknown, f: ListingFilters): (SQL | undefined)[] {
  return [
    f.from ? sql`(${column} at time zone 'Asia/Makassar')::date >= ${f.from}::date` : undefined,
    f.to ? sql`(${column} at time zone 'Asia/Makassar')::date <= ${f.to}::date` : undefined,
  ]
}

function likeOf(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

function sar(minor: number | string | null | undefined, currency: string | null | undefined) {
  return studioSarMinor(Number(minor ?? 0), currency) ?? 0
}

function money(minor: number, intl: string): string {
  return formatMoney(minor, 'SAR', intl)
}

function section(
  title: string,
  columns: ListingColumn[],
  all: string[][],
  totals: [string, string][],
): ListingSection {
  return {
    title,
    columns,
    rows: all.slice(0, ROW_CAP),
    totals,
    truncated: Math.max(0, all.length - ROW_CAP),
  }
}

/* -------------------------------------------------------------------------- */

async function ordersSection(f: ListingFilters, ctx: ListingContext): Promise<ListingSection> {
  const { t, intl } = ctx
  const names = can(ctx.role, 'customers.export')
  const rows = await db
    .select({
      number: orders.orderNumber,
      status: orders.status,
      total: orders.totalMinor,
      currency: orders.presentmentCurrency,
      day: baliDay(orders.createdAt),
      snapshot: orders.customerSnapshot,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(
      and(
        ...dayRange(orders.createdAt, f),
        f.status ? eq(orders.status, f.status) : undefined,
        f.q
          ? or(ilike(orders.orderNumber, likeOf(f.q)), ilike(users.email, likeOf(f.q)))
          : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(ROW_CAP + 1)
  let total = 0
  const body = rows.map((row) => {
    const value = sar(row.total, row.currency)
    total += value
    return [
      row.day,
      row.number,
      ...(names ? [row.snapshot?.name ?? '—'] : []),
      orderStatusLabel(t, row.status),
      money(value, intl),
    ]
  })
  return section(
    t('pdf.s_orders'),
    [
      { label: t('pdf.c_date') },
      { label: t('pdf.c_order') },
      ...(names ? [{ label: t('pdf.c_customer') }] : []),
      { label: t('pdf.c_status') },
      { label: t('pdf.c_total'), num: true },
    ],
    body,
    [
      [t('pdf.c_orders'), String(rows.length)],
      [t('pdf.c_total'), money(total, intl)],
    ],
  )
}

async function paymentsSection(f: ListingFilters, ctx: ListingContext): Promise<ListingSection> {
  const { t, intl } = ctx
  const rows = await db
    .select({
      number: orders.orderNumber,
      provider: payments.provider,
      status: payments.status,
      amount: payments.amountMinor,
      currency: payments.currency,
      day: baliDay(payments.createdAt),
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        ...dayRange(payments.createdAt, f),
        f.status ? eq(payments.status, f.status) : undefined,
        f.q ? ilike(orders.orderNumber, likeOf(f.q)) : undefined,
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(ROW_CAP + 1)
  let succeeded = 0
  const body = rows.map((row) => {
    const value = sar(row.amount, row.currency)
    if (row.status === 'succeeded' || row.status === 'refunded') succeeded += value
    return [
      row.day,
      row.number,
      paymentProviderName(t, row.provider),
      paymentStatusLabel(t, row.status),
      money(value, intl),
    ]
  })
  return section(
    t('pdf.s_payments'),
    [
      { label: t('pdf.c_date') },
      { label: t('pdf.c_order') },
      { label: t('pdf.c_provider') },
      { label: t('pdf.c_status') },
      { label: t('pdf.c_amount'), num: true },
    ],
    body,
    [
      [t('pdf.c_count'), String(rows.length)],
      [t('pdf.c_paid'), money(succeeded, intl)],
    ],
  )
}

async function refundsSection(f: ListingFilters, ctx: ListingContext): Promise<ListingSection> {
  const { t, intl } = ctx
  const rows = await db
    .select({
      number: orders.orderNumber,
      status: refunds.status,
      amount: refunds.amountMinor,
      currency: refunds.currency,
      reason: refunds.reason,
      day: baliDay(refunds.createdAt),
    })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(
      and(
        ...dayRange(refunds.createdAt, f),
        f.q ? ilike(orders.orderNumber, likeOf(f.q)) : undefined,
      ),
    )
    .orderBy(desc(refunds.createdAt))
    .limit(ROW_CAP + 1)
  let total = 0
  const body = rows.map((row) => {
    const value = sar(row.amount, row.currency)
    if (row.status !== 'failed') total += value
    return [
      row.day,
      row.number,
      paymentStatusLabel(t, row.status),
      (row.reason ?? '').slice(0, 120),
      money(value, intl),
    ]
  })
  return section(
    t('pdf.s_refunds'),
    [
      { label: t('pdf.c_date') },
      { label: t('pdf.c_order') },
      { label: t('pdf.c_status') },
      { label: t('pdf.c_reason') },
      { label: t('pdf.c_amount'), num: true },
    ],
    body,
    [
      [t('pdf.c_count'), String(rows.length)],
      [t('pdf.c_amount'), money(total, intl)],
    ],
  )
}

/** What we owe suppliers: delivered lines of paid orders not yet in a payment run. */
async function payablesSection(f: ListingFilters, ctx: ListingContext): Promise<ListingSection> {
  const { t, intl } = ctx
  const rows = await db
    .select({
      supplier: suppliers.name,
      currency: orderItems.costCurrency,
      lines: sql<number>`count(*)::int`,
      cost: sql<string>`coalesce(sum(${orderItems.costMinor}), 0)::text`,
      first: sql<string | null>`min(${orderItems.travelDate})::text`,
      last: sql<string | null>`max(${orderItems.travelDate})::text`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(suppliers, eq(suppliers.id, orderItems.supplierId))
    .where(
      and(
        // Exactly the payables screen's rule (Studio → Supplier payments).
        payableWhere({ from: f.from, to: f.to }),
        f.q ? ilike(suppliers.name, likeOf(f.q)) : undefined,
      ),
    )
    .groupBy(suppliers.name, orderItems.costCurrency)
    .orderBy(suppliers.name)
  let total = 0
  const body = rows.map((row) => {
    const value = sar(row.cost, row.currency)
    total += value
    return [
      row.supplier,
      String(row.lines),
      `${row.first ?? '—'} – ${row.last ?? '—'}`,
      money(value, intl),
    ]
  })
  return section(
    t('pdf.s_payables'),
    [
      { label: t('pdf.c_supplier') },
      { label: t('pdf.c_lines'), num: true },
      { label: t('pdf.c_date') },
      { label: t('pdf.c_due'), num: true },
    ],
    body,
    [[t('pdf.c_due'), money(total, intl)]],
  )
}

async function customersSection(f: ListingFilters, ctx: ListingContext): Promise<ListingSection> {
  const { t, intl } = ctx
  const rows = await db
    .select({
      name: users.name,
      day: baliDay(users.createdAt),
      orders: sql<number>`(select count(*) from ${orders} o where o.user_id = ${users.id} and o.status in ('paid','confirmed','partially_refunded'))::int`,
      spent: sql<string>`(select coalesce(sum(o.total_minor), 0) from ${orders} o where o.user_id = ${users.id} and o.status in ('paid','confirmed','partially_refunded') and o.presentment_currency = 'SAR')::text`,
    })
    .from(users)
    .where(
      and(
        eq(users.role, 'customer'),
        isNull(users.deletedAt),
        ...dayRange(users.createdAt, f),
        f.q ? or(ilike(users.name, likeOf(f.q)), ilike(users.email, likeOf(f.q))) : undefined,
      ),
    )
    .orderBy(desc(users.createdAt))
    .limit(ROW_CAP + 1)
  let spent = 0
  const body = rows.map((row) => {
    spent += Number(row.spent)
    return [row.day, row.name ?? '—', String(row.orders), money(Number(row.spent), intl)]
  })
  return section(
    t('pdf.l_customers'),
    [
      { label: t('pdf.c_date') },
      { label: t('pdf.c_customer') },
      { label: t('pdf.c_orders'), num: true },
      { label: t('pdf.c_spent'), num: true },
    ],
    body,
    [
      [t('pdf.c_count'), String(rows.length)],
      [t('pdf.c_spent'), money(spent, intl)],
    ],
  )
}

/** Paid orders per Bali day: count and revenue (SAR). */
async function salesSection(f: ListingFilters, ctx: ListingContext): Promise<ListingSection> {
  const { t, intl } = ctx
  const day = baliDay(orders.createdAt)
  const rows = await db
    .select({
      day,
      currency: orders.presentmentCurrency,
      n: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${orders.totalMinor}), 0)::text`,
    })
    .from(orders)
    .where(and(inArray(orders.status, [...PAID_ORDER_STATUSES]), ...dayRange(orders.createdAt, f)))
    .groupBy(day, orders.presentmentCurrency)
    .orderBy(desc(day))
  const byDay = new Map<string, { n: number; sar: number }>()
  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { n: 0, sar: 0 }
    entry.n += row.n
    entry.sar += sar(row.total, row.currency)
    byDay.set(row.day, entry)
  }
  let n = 0
  let total = 0
  const body = [...byDay.entries()].map(([d, v]) => {
    n += v.n
    total += v.sar
    return [d, String(v.n), money(v.sar, intl)]
  })
  return section(
    t('pdf.l_sales'),
    [
      { label: t('pdf.c_day') },
      { label: t('pdf.c_orders'), num: true },
      { label: t('pdf.c_revenue'), num: true },
    ],
    body,
    [
      [t('pdf.c_orders'), String(n)],
      [t('pdf.c_revenue'), money(total, intl)],
    ],
  )
}

async function itinerarySalesSection(
  f: ListingFilters,
  ctx: ListingContext,
): Promise<ListingSection> {
  const { t, intl } = ctx
  const rows = await db
    .select({
      name: orderItems.nameSnapshot,
      currency: orders.presentmentCurrency,
      sold: sql<number>`sum(${orderItems.quantity})::int`,
      total: sql<string>`coalesce(sum(${orderItems.lineTotalMinor}), 0)::text`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.kind, 'itinerary'),
        inArray(orders.status, [...PAID_ORDER_STATUSES]),
        ...dayRange(orders.createdAt, f),
      ),
    )
    .groupBy(orderItems.nameSnapshot, orders.presentmentCurrency)
  const byName = new Map<string, { sold: number; sar: number }>()
  for (const row of rows) {
    const name = pick(row.name, ctx.locale, '—')
    const entry = byName.get(name) ?? { sold: 0, sar: 0 }
    entry.sold += row.sold
    entry.sar += sar(row.total, row.currency)
    byName.set(name, entry)
  }
  let sold = 0
  let total = 0
  const body = [...byName.entries()]
    .sort((a, b) => b[1].sar - a[1].sar)
    .map(([name, v]) => {
      sold += v.sold
      total += v.sar
      return [name, String(v.sold), money(v.sar, intl)]
    })
  return section(
    t('pdf.l_itinerary_sales'),
    [
      { label: t('pdf.c_itinerary') },
      { label: t('pdf.c_sold'), num: true },
      { label: t('pdf.c_revenue'), num: true },
    ],
    body,
    [
      [t('pdf.c_sold'), String(sold)],
      [t('pdf.c_revenue'), money(total, intl)],
    ],
  )
}

/**
 * Lead capture: people who left their details (no phone or e-mail in the PDF —
 * contact details stay in the CSV). `status` filters by source.
 */
async function leadsSection(f: ListingFilters, ctx: ListingContext): Promise<ListingSection> {
  const { t, intl } = ctx
  const paid = sql`o.status in ('paid','confirmed','partially_refunded')
    and ((${leadContacts.userId} is not null and o.user_id = ${leadContacts.userId})
      or (${leadContacts.email} is not null and lower(o.customer_snapshot->>'email') = ${leadContacts.email})
      or (${leadContacts.phone} is not null and o.customer_snapshot->>'phone' = ${leadContacts.phone}))`
  const rows = await db
    .select({
      day: baliDay(leadContacts.createdAt),
      name: leadContacts.name,
      source: leadContacts.source,
      wa: leadContacts.whatsappConsent,
      mail: leadContacts.emailConsent,
      orders: sql<number>`(select count(*) from ${orders} o where ${paid})::int`,
      spent: sql<string>`(select coalesce(sum(o.total_minor), 0) from ${orders} o where ${paid} and o.presentment_currency = 'SAR')::text`,
    })
    .from(leadContacts)
    .where(
      and(
        ...dayRange(leadContacts.createdAt, f),
        f.status ? eq(leadContacts.source, f.status) : undefined,
        f.q ? ilike(leadContacts.name, likeOf(f.q)) : undefined,
      ),
    )
    .orderBy(desc(leadContacts.createdAt))
    .limit(ROW_CAP + 1)
  let spent = 0
  let consenting = 0
  const body = rows.map((row) => {
    spent += Number(row.spent)
    if (row.wa || row.mail) consenting += 1
    const consent = [row.wa ? t('lc.ch_whatsapp') : '', row.mail ? t('lc.ch_email') : '']
      .filter(Boolean)
      .join(' + ')
    return [
      row.day,
      row.name ?? '—',
      t(`lc.src_${row.source}`),
      consent || t('lc.no_consent'),
      String(row.orders),
      money(Number(row.spent), intl),
    ]
  })
  return section(
    t('pdf.l_leads'),
    [
      { label: t('pdf.c_date') },
      { label: t('pdf.c_customer') },
      { label: t('lc.col_source') },
      { label: t('lc.col_consent') },
      { label: t('pdf.c_orders'), num: true },
      { label: t('pdf.c_spent'), num: true },
    ],
    body,
    [
      [t('pdf.c_count'), String(rows.length)],
      [t('lc.with_consent'), String(consenting)],
      [t('pdf.c_spent'), money(spent, intl)],
    ],
  )
}

/** Build the document for one listing kind. */
export async function buildListing(
  kind: ListingKind,
  f: ListingFilters,
  ctx: ListingContext,
): Promise<ListingDoc> {
  const { t } = ctx
  switch (kind) {
    case 'orders':
      return { title: t('pdf.l_orders'), sections: [await ordersSection(f, ctx)] }
    case 'payments':
      return { title: t('pdf.l_payments'), sections: [await paymentsSection(f, ctx)] }
    case 'refunds':
      return { title: t('pdf.l_refunds'), sections: [await refundsSection(f, ctx)] }
    case 'payables':
      return { title: t('pdf.l_payables'), sections: [await payablesSection(f, ctx)] }
    case 'customers':
      return { title: t('pdf.l_customers'), sections: [await customersSection(f, ctx)] }
    case 'sales':
      return { title: t('pdf.l_sales'), sections: [await salesSection(f, ctx)] }
    case 'itinerary_sales':
      return {
        title: t('pdf.l_itinerary_sales'),
        sections: [await itinerarySalesSection(f, ctx)],
      }
    case 'leads':
      return { title: t('pdf.l_leads'), sections: [await leadsSection(f, ctx)] }
    case 'accountant': {
      // One month for the accountant: what came in, what went back, what we owe.
      const plain = { ...f, status: null, q: null }
      const [o, p, r, pay] = await Promise.all([
        ordersSection(plain, ctx),
        paymentsSection(plain, ctx),
        refundsSection(plain, ctx),
        payablesSection({ ...plain, from: null, to: null }, ctx),
      ])
      return { title: t('pdf.l_accountant'), sections: [o, p, r, pay] }
    }
  }
}
