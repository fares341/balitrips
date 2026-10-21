import { pick } from '@/lib/content/localize'
import { sourceLabel } from '@/lib/analytics/utm'

import {
  bookingsValue,
  collected,
  costLines,
  currencyOptions,
  customerSplit,
  discountTotals,
  eventCounts,
  eventsByItem,
  funnelSteps,
  ordersBySource,
  refundTotals,
  salesByGroup,
  salesSeries,
  type Range,
} from '../data'
import type { ReportFilters } from '../filters'
import {
  averageOrderValue,
  bookingGroup,
  confirmationStats,
  lifetimeValue,
  margin,
  rate,
  sumByCurrency,
  type Money,
} from '../metrics'
import { alignSeries, bucketKeys } from '../period'
import type { Block, Kpi, ReportResult, TableBlock } from '../types'
import {
  both,
  cell,
  chartCurrency,
  countKpi,
  currentRange,
  lineChart,
  money,
  moneyKpi,
  moneyText,
  notByStaff,
  numberText,
  percentText,
  previousKeys,
  rangeLabel,
  recordsHref,
  staffNAColumns,
  type BuildContext,
} from './helpers'
import { groupMoney } from './overview'
import {
  abandonedCheckouts,
  addonSales,
  bookingLines,
  customerTotals,
  deniedDownloads,
  failedPayments,
  freeToVip,
  itineraryLines,
  itineraryNames,
  paidOrders,
  placeViews,
  regionViews,
  staleUnpaidOrders,
  unprocessedBookings,
  UNPROCESSED_AFTER_HOURS,
  vipFacts,
  visitorsBySource,
  mapErrors,
} from './queries'

const toDate = (value: unknown): Date | null => {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

const loc = (intl: string) => (intl.startsWith('ar') ? 'ar' : 'en') as 'ar' | 'en'

/** Phase 6: grey the listed figures when the staff filter is on (see `notByStaff`). */
function markNotByStaff(filters: ReportFilters, kpis: Kpi[], ids: readonly string[]): Kpi[] {
  return kpis.map((kpi) => (ids.includes(kpi.id) ? notByStaff(filters, kpi) : kpi))
}

async function salesLine(filters: ReportFilters, ctx: BuildContext, currency: string, id: string) {
  const p = filters.period
  const [series, prev] = await Promise.all([
    salesSeries({ start: p.start, end: p.end }, p.bucket, currency, filters),
    filters.compare
      ? salesSeries({ start: p.prevStart, end: p.prevEnd }, p.bucket, currency, filters)
      : Promise.resolve(null),
  ])
  return lineChart({
    id,
    title: ctx.t('rp.chart_sales', { currency }),
    definition: ctx.t('rp.def_chart_sales'),
    current: alignSeries(bucketKeys(p.start, p.end, p.bucket), series),
    previous: prev ? alignSeries(previousKeys(p), prev) : null,
    currentLabel: rangeLabel(p.fromDate, p.toDate, ctx.intl),
    previousLabel: rangeLabel(p.prevFromDate, p.prevToDate, ctx.intl),
    unit: 'money',
    currency,
    period: p,
    intl: ctx.intl,
  })
}

function subtract(a: readonly Money[], b: readonly Money[]): Money[] {
  return sumByCurrency([...a, ...b.map((m) => ({ currency: m.currency, minor: -m.minor }))])
}

/* --------------------------------------------------------------------------
   Financial (admin / finance only)
   -------------------------------------------------------------------------- */

export async function buildFinancial(
  filters: ReportFilters,
  ctx: BuildContext,
): Promise<ReportResult> {
  const { t, intl } = ctx
  const [
    [value, valuePrev],
    [paid, paidPrev],
    [refund, refundPrev],
    [lines, linesPrev],
    [orders, ordersPrev],
    currencies,
  ] = await Promise.all([
    both(filters, (r) => bookingsValue(r, filters)),
    both(filters, (r) => collected(r, filters)),
    both(filters, (r) => refundTotals(r, filters)),
    both(filters, (r) => costLines(r, filters)),
    both(filters, (r) => paidOrders(r, filters)),
    currencyOptions(),
  ])
  const [discounts, discountsPrev] = await both(filters, (r) => discountTotals(r, filters))
  const m = margin(lines)
  const mPrev = linesPrev ? margin(linesPrev) : null
  const net = subtract(paid, refund.money)
  const netPrev = paidPrev && refundPrev ? subtract(paidPrev, refundPrev.money) : null

  const kpis: Kpi[] = [
    moneyKpi(
      'bookings_value',
      t('rp.kpi_bookings_value'),
      t('rp.def_bookings_value'),
      value,
      valuePrev,
      recordsHref('orders_paid', filters),
    ),
    moneyKpi(
      'collected',
      t('rp.kpi_collected'),
      t('rp.def_collected'),
      paid,
      paidPrev,
      recordsHref('collected', filters),
    ),
    moneyKpi(
      'refunds',
      t('rp.kpi_refunds'),
      t('rp.def_refunds'),
      refund.money,
      refundPrev?.money ?? null,
      recordsHref('refunds', filters),
      true,
    ),
    moneyKpi(
      'net',
      t('rp.kpi_net'),
      t('rp.def_net'),
      net,
      netPrev,
      recordsHref('collected', filters),
    ),
    {
      ...moneyKpi(
        'supplier_cost',
        t('rp.kpi_supplier_cost'),
        t('rp.def_supplier_cost'),
        m.cost,
        mPrev?.cost ?? null,
        recordsHref('lines', filters, { group: 'bookable' }),
      ),
      ...(m.withoutCost > 0 ? { note: t('rp.note_without_cost', { n: m.withoutCost }) } : {}),
    },
    moneyKpi(
      'margin',
      t('rp.kpi_margin'),
      t('rp.def_margin'),
      m.margin,
      mPrev?.margin ?? null,
      recordsHref('lines', filters, { group: 'bookable' }),
    ),
    moneyKpi(
      'aov',
      t('rp.kpi_aov'),
      t('rp.def_aov'),
      averageOrderValue(orders),
      ordersPrev ? averageOrderValue(ordersPrev) : null,
      recordsHref('orders_paid', filters),
    ),
    {
      ...moneyKpi(
        'discounts',
        t('rp.kpi_discounts'),
        t('rp.def_discounts'),
        discounts.money,
        discountsPrev?.money ?? null,
        '/discounts',
      ),
      note: t('rp.note_orders', { n: discounts.orders }),
    },
  ]

  const all = new Set([...value, ...paid, ...refund.money, ...m.cost].map((x) => x.currency))
  const amount = (list: readonly Money[], currency: string) =>
    list.find((x) => x.currency === currency)?.minor ?? 0
  const byCurrency: TableBlock = {
    kind: 'table',
    id: 'by_currency',
    title: t('rp.table_by_currency'),
    definition: t('rp.note_currency'),
    columns: [
      { key: 'currency', label: t('common.currency') },
      { key: 'value', label: t('rp.kpi_bookings_value'), num: true },
      { key: 'collected', label: t('rp.kpi_collected'), num: true },
      { key: 'refunds', label: t('rp.kpi_refunds'), num: true },
      { key: 'net', label: t('rp.kpi_net'), num: true },
      { key: 'cost', label: t('rp.kpi_supplier_cost'), num: true },
      { key: 'margin', label: t('rp.kpi_margin'), num: true },
    ],
    rows: [...all].sort().map((currency) => ({
      currency: cell(currency, currency),
      value: cell(money(amount(value, currency), currency, intl), amount(value, currency)),
      collected: cell(money(amount(paid, currency), currency, intl), amount(paid, currency)),
      refunds: cell(
        money(amount(refund.money, currency), currency, intl),
        amount(refund.money, currency),
      ),
      net: cell(money(amount(net, currency), currency, intl), amount(net, currency)),
      cost: cell(money(amount(m.cost, currency), currency, intl), amount(m.cost, currency)),
      margin: cell(money(amount(m.margin, currency), currency, intl), amount(m.margin, currency)),
    })),
    empty: t('rp.empty'),
  }

  const currency = chartCurrency(filters, currencies[0] ?? 'USD', value, valuePrev)
  return {
    id: 'financial',
    title: t('rp.r_financial'),
    description: t('rp.r_financial_d'),
    kpis,
    blocks: [await salesLine(filters, ctx, currency, 'sales'), byCurrency],
    notes: [t('rp.note_currency'), t('rp.note_bali_time'), t('rp.note_margin_currency')],
  }
}

/* --------------------------------------------------------------------------
   Bookings
   -------------------------------------------------------------------------- */

export async function buildBookings(
  filters: ReportFilters,
  ctx: BuildContext,
): Promise<ReportResult> {
  const { t, intl } = ctx
  const [lines, linesPrev] = await both(filters, (r) => bookingLines(r, filters))
  const stats = (rows: typeof lines) => {
    const groups = { confirmed: 0, pending: 0, cancelled: 0 }
    for (const row of rows) groups[bookingGroup(row.status)] += 1
    const withSupplier = rows.filter((row) => row.supplierId !== null && row.kind !== 'driver')
    const confirmation = confirmationStats(
      withSupplier
        .map((row) => ({ paidAt: toDate(row.paidAt), confirmedAt: toDate(row.confirmedAt) }))
        .filter((row): row is { paidAt: Date; confirmedAt: Date | null } => row.paidAt !== null),
    )
    return { total: rows.length, groups, confirmation }
  }
  const now = stats(lines)
  const before = linesPrev ? stats(linesPrev) : null

  const kpis: Kpi[] = [
    countKpi(
      'bookings',
      t('rp.kpi_bookings'),
      t('rp.def_bookings'),
      now.total,
      before?.total ?? null,
      recordsHref('bookings', filters),
    ),
    countKpi(
      'bookings_confirmed',
      t('rp.kpi_bookings_confirmed'),
      t('rp.def_bookings_confirmed'),
      now.groups.confirmed,
      before?.groups.confirmed ?? null,
      recordsHref('bookings', filters, { group: 'confirmed' }),
    ),
    countKpi(
      'bookings_pending',
      t('rp.kpi_bookings_pending'),
      t('rp.def_bookings_pending'),
      now.groups.pending,
      before?.groups.pending ?? null,
      recordsHref('bookings', filters, { group: 'pending' }),
      { lowerIsBetter: true },
    ),
    countKpi(
      'bookings_cancelled',
      t('rp.kpi_bookings_cancelled'),
      t('rp.def_bookings_cancelled'),
      now.groups.cancelled,
      before?.groups.cancelled ?? null,
      recordsHref('bookings', filters, { group: 'cancelled' }),
      { lowerIsBetter: true },
    ),
    countKpi(
      'cancellation_rate',
      t('rp.kpi_cancellation_rate'),
      t('rp.def_cancellation_rate'),
      rate(now.groups.cancelled, now.total),
      before ? rate(before.groups.cancelled, before.total) : null,
      recordsHref('bookings', filters, { group: 'cancelled' }),
      { kind: 'percent', lowerIsBetter: true },
    ),
    countKpi(
      'supplier_confirm_rate',
      t('rp.kpi_supplier_confirm_rate'),
      t('rp.def_supplier_confirm_rate'),
      now.confirmation.rate,
      before?.confirmation.rate ?? null,
      recordsHref('bookings', filters, { group: 'supplier' }),
      { kind: 'percent' },
    ),
    countKpi(
      'supplier_confirm_hours',
      t('rp.kpi_supplier_confirm_hours'),
      t('rp.def_supplier_confirm_hours'),
      now.confirmation.avgHours,
      before?.confirmation.avgHours ?? null,
      recordsHref('bookings', filters, { group: 'supplier' }),
      { kind: 'hours', lowerIsBetter: true },
    ),
  ]

  const statusCounts = new Map<string, number>()
  for (const row of lines) statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1)
  const blocks: Block[] = [
    {
      kind: 'bar',
      id: 'by_status',
      title: t('rp.chart_bookings_status'),
      definition: t('rp.def_chart_bookings_status_detail'),
      rows: [...statusCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([status, n]) => ({
          label: t(`rp.status_${status}`),
          value: n,
          display: numberText(n, intl),
          href: recordsHref('bookings', filters, { status }),
          tone:
            bookingGroup(status) === 'confirmed'
              ? 'good'
              : bookingGroup(status) === 'pending'
                ? 'warn'
                : 'bad',
        })),
    },
  ]

  const locale = loc(intl)
  const byProduct = new Map<
    string,
    { name: string; total: number; confirmed: number; cancelled: number }
  >()
  for (const row of lines) {
    const key = row.refId ?? row.kind
    const entry = byProduct.get(key) ?? {
      name: pick(row.name, locale, key),
      total: 0,
      confirmed: 0,
      cancelled: 0,
    }
    entry.total += 1
    if (bookingGroup(row.status) === 'confirmed') entry.confirmed += 1
    if (bookingGroup(row.status) === 'cancelled') entry.cancelled += 1
    byProduct.set(key, entry)
  }
  blocks.push({
    kind: 'table',
    id: 'by_product',
    title: t('rp.table_by_product'),
    columns: [
      { key: 'name', label: t('rp.col_product') },
      { key: 'total', label: t('rp.kpi_bookings'), num: true },
      { key: 'confirmed', label: t('rp.group_confirmed'), num: true },
      { key: 'cancelled', label: t('rp.group_cancelled'), num: true },
      { key: 'rate', label: t('rp.kpi_cancellation_rate'), num: true },
    ],
    rows: [...byProduct.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 50)
      .map(([key, entry]) => ({
        name: cell(entry.name, entry.name, recordsHref('bookings', filters, { ref: key })),
        total: cell(numberText(entry.total, intl), entry.total),
        confirmed: cell(numberText(entry.confirmed, intl), entry.confirmed),
        cancelled: cell(numberText(entry.cancelled, intl), entry.cancelled),
        rate: cell(
          percentText(rate(entry.cancelled, entry.total), intl),
          rate(entry.cancelled, entry.total),
        ),
      })),
    empty: t('rp.empty'),
  })

  return {
    id: 'bookings',
    title: t('rp.r_bookings'),
    description: t('rp.r_bookings_d'),
    kpis,
    blocks,
    notes: [t('rp.note_bookable'), t('rp.note_bali_time')],
  }
}

/* --------------------------------------------------------------------------
   Itineraries
   -------------------------------------------------------------------------- */

export async function buildItineraries(
  filters: ReportFilters,
  ctx: BuildContext,
): Promise<ReportResult> {
  const { t, intl } = ctx
  const range = currentRange(filters)
  const [[lines, linesPrev], views, downloads, dayViews, mapClicks, names, [events, eventsPrev]] =
    await Promise.all([
      both(filters, (r) => itineraryLines(r, filters)),
      eventsByItem(range, 'itinerary_view', 'itinerary'),
      eventsByItem(range, 'itinerary_download'),
      eventsByItem(range, 'itinerary_day_view', 'itinerary'),
      eventsByItem(range, 'itinerary_map_click', 'itinerary'),
      itineraryNames(),
      both(filters, (r) => eventCounts(r, ['itinerary_view', 'itinerary_download'])),
    ])
  const totals = (rows: typeof lines) => ({
    sold: rows.length,
    money: sumByCurrency(rows.map((r) => ({ currency: r.currency, minor: r.lineTotalMinor }))),
    vip: rows.filter((r) => r.withVip).length,
  })
  const now = totals(lines)
  const before = linesPrev ? totals(linesPrev) : null
  const viewCount = events.get('itinerary_view') ?? 0
  const viewers = views.reduce((sum, row) => sum + row.visitors, 0)

  const kpis: Kpi[] = [
    countKpi(
      'itineraries_sold',
      t('rp.kpi_itineraries_sold'),
      t('rp.def_itineraries_sold'),
      now.sold,
      before?.sold ?? null,
      recordsHref('lines', filters, { group: 'itinerary' }),
    ),
    moneyKpi(
      'itinerary_sales',
      t('rp.kpi_itinerary_sales'),
      t('rp.def_itinerary_sales'),
      now.money,
      before?.money ?? null,
      recordsHref('lines', filters, { group: 'itinerary' }),
    ),
    countKpi(
      'itinerary_views',
      t('rp.kpi_itinerary_views'),
      t('rp.def_itinerary_views'),
      viewCount,
      eventsPrev?.get('itinerary_view') ?? null,
    ),
    countKpi(
      'itinerary_downloads',
      t('rp.kpi_itinerary_downloads'),
      t('rp.def_itinerary_downloads'),
      events.get('itinerary_download') ?? 0,
      eventsPrev?.get('itinerary_download') ?? null,
    ),
    countKpi(
      'itinerary_conversion',
      t('rp.kpi_itinerary_conversion'),
      t('rp.def_itinerary_conversion'),
      rate(now.sold, viewers),
      null,
      undefined,
      { kind: 'percent' },
    ),
    countKpi(
      'vip_attach',
      t('rp.kpi_vip_attach'),
      t('rp.def_vip_attach'),
      rate(now.vip, now.sold),
      before ? rate(before.vip, before.sold) : null,
      recordsHref('lines', filters, { group: 'itinerary' }),
      { kind: 'percent' },
    ),
  ]

  const locale = loc(intl)
  const nameOf = new Map(names.map((row) => [row.id, pick(row.name, locale, row.slug)]))
  type Row = {
    name: string
    sold: number
    money: Money[]
    vip: number
    views: number
    viewers: number
    downloads: number
    days: number
    maps: number
  }
  const rows = new Map<string, Row>()
  const get = (id: string, fallback: string) => {
    const existing = rows.get(id)
    if (existing) return existing
    const fresh: Row = {
      name: nameOf.get(id) ?? fallback,
      sold: 0,
      money: [],
      vip: 0,
      views: 0,
      viewers: 0,
      downloads: 0,
      days: 0,
      maps: 0,
    }
    rows.set(id, fresh)
    return fresh
  }
  for (const line of lines) {
    if (!line.refId) continue
    const row = get(line.refId, pick(line.name, locale, line.refId))
    row.sold += 1
    row.money = sumByCurrency([
      ...row.money,
      { currency: line.currency, minor: line.lineTotalMinor },
    ])
    if (line.withVip) row.vip += 1
  }
  for (const v of views)
    if (v.itemId) Object.assign(get(v.itemId, v.itemRef ?? ''), { views: v.n, viewers: v.visitors })
  for (const d of downloads) if (d.itemId) get(d.itemId, d.itemRef ?? '').downloads = d.n
  for (const d of dayViews) if (d.itemId) get(d.itemId, d.itemRef ?? '').days = d.n
  for (const d of mapClicks) if (d.itemId) get(d.itemId, d.itemRef ?? '').maps = d.n

  return {
    id: 'itineraries',
    title: t('rp.r_itineraries'),
    description: t('rp.r_itineraries_d'),
    // Views, downloads and view → sale come from site visits, not orders.
    kpis: markNotByStaff(filters, kpis, [
      'itinerary_views',
      'itinerary_downloads',
      'itinerary_conversion',
    ]),
    blocks: [
      {
        kind: 'bar',
        id: 'best_sellers',
        title: t('rp.chart_best_itineraries'),
        definition: t('rp.def_itineraries_sold'),
        rows: [...rows.entries()]
          .filter(([, r]) => r.sold > 0)
          .sort((a, b) => b[1].sold - a[1].sold)
          .slice(0, 8)
          .map(([id, r]) => ({
            label: r.name,
            value: r.sold,
            display: `${numberText(r.sold, intl)} · ${moneyText(r.money, intl)}`,
            href: recordsHref('lines', filters, { ref: id }),
          })),
      },
      {
        kind: 'table',
        id: 'itineraries',
        title: t('rp.table_itineraries'),
        columns: staffNAColumns(
          filters,
          [
            { key: 'name', label: t('rp.col_itinerary') },
            { key: 'sold', label: t('rp.col_sold'), num: true },
            { key: 'money', label: t('rp.col_revenue'), num: true },
            { key: 'views', label: t('rp.col_views'), num: true },
            { key: 'days', label: t('rp.col_day_views'), num: true },
            { key: 'maps', label: t('rp.col_map_clicks'), num: true },
            { key: 'downloads', label: t('rp.col_downloads'), num: true },
            { key: 'conversion', label: t('rp.col_conversion'), num: true },
            { key: 'vip', label: t('rp.kpi_vip_attach'), num: true },
          ],
          ['views', 'days', 'maps', 'downloads', 'conversion'],
        ),
        rows: [...rows.entries()]
          .sort((a, b) => b[1].sold - a[1].sold || b[1].views - a[1].views)
          .map(([id, r]) => ({
            name: cell(r.name, r.name, recordsHref('lines', filters, { ref: id })),
            sold: cell(numberText(r.sold, intl), r.sold),
            money: cell(
              moneyText(r.money, intl),
              r.money.map((m) => `${m.minor} ${m.currency}`).join(' '),
            ),
            views: cell(numberText(r.views, intl), r.views),
            days: cell(numberText(r.days, intl), r.days),
            maps: cell(numberText(r.maps, intl), r.maps),
            downloads: cell(numberText(r.downloads, intl), r.downloads),
            conversion: cell(percentText(rate(r.sold, r.viewers), intl), rate(r.sold, r.viewers)),
            vip: cell(percentText(rate(r.vip, r.sold), intl), rate(r.vip, r.sold)),
          })),
        empty: t('rp.empty'),
      },
    ],
    notes: [t('rp.note_consent'), t('rp.note_bali_time')],
  }
}

/* --------------------------------------------------------------------------
   VIP map
   -------------------------------------------------------------------------- */

export async function buildVip(filters: ReportFilters, ctx: BuildContext): Promise<ReportResult> {
  const { t, intl } = ctx
  const range = currentRange(filters)
  const [[facts, factsPrev], [groups, groupsPrev], [upgrade, upgradePrev], places, regionsSeen] =
    await Promise.all([
      both(filters, (r) => vipFacts(r, ctx.now)),
      both(filters, (r) => salesByGroup(r, filters)),
      both(filters, (r) => freeToVip(r)),
      placeViews(range),
      regionViews(range),
    ])
  const granted = (map: Map<string, number>) => [...map.values()].reduce((a, b) => a + b, 0)
  const vipMoney = groupMoney(groups, ['vip'])
  const vipMoneyPrev = groupsPrev ? groupMoney(groupsPrev, ['vip']) : null
  const locale = loc(intl)
  const SOURCES = ['standalone', 'itinerary', 'package', 'staff', 'family'] as const

  return {
    id: 'vip',
    title: t('rp.r_vip'),
    description: t('rp.r_vip_d'),
    // Access rows and map visits are not orders; only VIP sales are.
    kpis: markNotByStaff(
      filters,
      [
        countKpi(
          'vip_active',
          t('rp.kpi_vip_active'),
          t('rp.def_vip_active'),
          facts.activeUsers,
          null,
          '/entitlements',
          { note: t('rp.note_now') },
        ),
        countKpi(
          'vip_new',
          t('rp.kpi_vip_new'),
          t('rp.def_vip_new'),
          granted(facts.granted),
          factsPrev ? granted(factsPrev.granted) : null,
          '/entitlements',
        ),
        countKpi(
          'vip_expired',
          t('rp.kpi_vip_expired'),
          t('rp.def_vip_expired'),
          facts.ended,
          factsPrev?.ended ?? null,
          '/entitlements',
          { lowerIsBetter: true },
        ),
        countKpi(
          'vip_renewed',
          t('rp.kpi_vip_renewed'),
          t('rp.def_vip_renewed'),
          facts.renewed,
          factsPrev?.renewed ?? null,
          '/entitlements',
        ),
        {
          ...moneyKpi(
            'vip_sales',
            t('rp.kpi_vip_sales'),
            t('rp.def_vip_sales'),
            vipMoney.money,
            vipMoneyPrev?.money ?? null,
            recordsHref('lines', filters, { group: 'vip' }),
          ),
          note: t('rp.note_sold', { n: vipMoney.count }),
        },
        countKpi(
          'free_to_vip',
          t('rp.kpi_free_to_vip'),
          t('rp.def_free_to_vip'),
          rate(upgrade.upgraded, upgrade.freeUsers),
          upgradePrev ? rate(upgradePrev.upgraded, upgradePrev.freeUsers) : null,
          undefined,
          {
            kind: 'percent',
            note: t('rp.note_conversion', { buyers: upgrade.upgraded, viewers: upgrade.freeUsers }),
          },
        ),
      ],
      ['vip_active', 'vip_new', 'vip_expired', 'vip_renewed', 'free_to_vip'],
    ),
    blocks: [
      notByStaff(filters, {
        kind: 'bar',
        id: 'vip_sources',
        title: t('rp.chart_vip_sources'),
        definition: t('rp.def_chart_vip_sources'),
        rows: SOURCES.map((key) => ({
          label: t(`rp.vip_source_${key}`),
          value: facts.granted.get(key) ?? 0,
          display: numberText(facts.granted.get(key) ?? 0, intl),
        })),
      }),
      notByStaff(filters, {
        kind: 'table',
        id: 'top_places',
        title: t('rp.table_top_places'),
        definition: t('rp.def_place_views'),
        columns: [
          { key: 'name', label: t('rp.col_place') },
          { key: 'region', label: t('rp.col_region') },
          { key: 'access', label: t('rp.col_access') },
          { key: 'views', label: t('rp.col_views'), num: true },
        ],
        rows: places.map((row) => ({
          name: cell(pick(row.name, locale, row.slug), row.slug, `/places/${row.placeId}`),
          region: cell(row.region ? pick(row.region, locale) : '—'),
          access: cell(row.vip ? 'VIP' : t('rp.access_free'), row.vip ? 'vip' : 'free'),
          views: cell(numberText(row.views, intl), row.views),
        })),
        empty: t('rp.empty_events'),
      }),
      notByStaff(filters, {
        kind: 'bar',
        id: 'top_regions',
        title: t('rp.chart_top_regions'),
        definition: t('rp.def_place_views'),
        rows: regionsSeen.map((row) => ({
          label: pick(row.region, locale, row.key),
          value: row.views,
          display: numberText(row.views, intl),
        })),
      }),
    ],
    notes: [t('rp.note_consent'), t('rp.note_no_location')],
  }
}

/* --------------------------------------------------------------------------
   Activities & packages
   -------------------------------------------------------------------------- */

export async function buildActivities(
  filters: ReportFilters,
  ctx: BuildContext,
): Promise<ReportResult> {
  const { t, intl } = ctx
  const [[lines, linesPrev], addons, currencies] = await Promise.all([
    both(filters, (r) => bookingLines(r, filters)),
    addonSales(currentRange(filters), filters),
    currencyOptions(),
  ])
  const pick2 = (rows: typeof lines) =>
    rows.filter((r) => r.kind === 'activity' || r.kind === 'activity_tier' || r.kind === 'package')
  const now = pick2(lines)
  const before = linesPrev ? pick2(linesPrev) : null
  const sold = (rows: typeof now) =>
    rows.filter(
      (r) => r.options?.includedInPackage === undefined && r.options?.includedInTier === undefined,
    )
  const revenue = (rows: typeof now) =>
    sumByCurrency(sold(rows).map((r) => ({ currency: r.currency, minor: r.lineTotalMinor })))
  const cancelled = (rows: typeof now) =>
    rows.filter((r) => bookingGroup(r.status) === 'cancelled').length
  const withAddons = (rows: typeof now) =>
    sold(rows).filter((r) => (r.options?.addons?.length ?? 0) > 0).length
  const m = margin(
    sold(now).map((r) => ({
      currency: r.currency,
      revenueMinor: r.lineTotalMinor,
      costMinor: r.costMinor,
      costCurrency: r.costCurrency,
    })),
  )
  const mPrev = before
    ? margin(
        sold(before).map((r) => ({
          currency: r.currency,
          revenueMinor: r.lineTotalMinor,
          costMinor: r.costMinor,
          costCurrency: r.costCurrency,
        })),
      )
    : null

  const kpis: Kpi[] = [
    countKpi(
      'activity_bookings',
      t('rp.kpi_activity_bookings'),
      t('rp.def_activity_bookings'),
      sold(now).length,
      before ? sold(before).length : null,
      recordsHref('lines', filters, { group: 'activity_package' }),
    ),
    moneyKpi(
      'activity_sales',
      t('rp.kpi_activity_sales'),
      t('rp.def_activity_sales'),
      revenue(now),
      before ? revenue(before) : null,
      recordsHref('lines', filters, { group: 'activity_package' }),
    ),
  ]
  if (ctx.finance)
    kpis.push(
      moneyKpi(
        'margin',
        t('rp.kpi_margin'),
        t('rp.def_margin'),
        m.margin,
        mPrev?.margin ?? null,
        recordsHref('lines', filters, { group: 'bookable' }),
      ),
    )
  kpis.push(
    countKpi(
      'cancellation_rate',
      t('rp.kpi_cancellation_rate'),
      t('rp.def_cancellation_rate'),
      rate(cancelled(now), now.length),
      before ? rate(cancelled(before), before.length) : null,
      recordsHref('bookings', filters, { group: 'cancelled' }),
      { kind: 'percent', lowerIsBetter: true },
    ),
    countKpi(
      'addon_attach',
      t('rp.kpi_addon_attach'),
      t('rp.def_addon_attach'),
      rate(withAddons(now), sold(now).length),
      before ? rate(withAddons(before), sold(before).length) : null,
      undefined,
      { kind: 'percent' },
    ),
  )

  const locale = loc(intl)
  type Row = {
    name: string
    kind: string
    count: number
    cancelled: number
    money: Money[]
    lines: {
      currency: string
      revenueMinor: number
      costMinor: number | null
      costCurrency: string | null
    }[]
  }
  const rows = new Map<string, Row>()
  for (const line of sold(now)) {
    const key = line.refId ?? line.kind
    const row = rows.get(key) ?? {
      name: pick(line.name, locale, key),
      kind: line.kind,
      count: 0,
      cancelled: 0,
      money: [],
      lines: [],
    }
    row.count += 1
    if (bookingGroup(line.status) === 'cancelled') row.cancelled += 1
    row.money = sumByCurrency([
      ...row.money,
      { currency: line.currency, minor: line.lineTotalMinor },
    ])
    row.lines.push({
      currency: line.currency,
      revenueMinor: line.lineTotalMinor,
      costMinor: line.costMinor,
      costCurrency: line.costCurrency,
    })
    rows.set(key, row)
  }
  const columns: TableBlock['columns'] = [
    { key: 'name', label: t('rp.col_product') },
    { key: 'kind', label: t('rp.col_type') },
    { key: 'count', label: t('rp.kpi_activity_bookings'), num: true },
    { key: 'money', label: t('rp.col_revenue'), num: true },
  ]
  if (ctx.finance) columns.push({ key: 'margin', label: t('rp.kpi_margin'), num: true })
  columns.push({ key: 'cancel', label: t('rp.kpi_cancellation_rate'), num: true })

  const currency = chartCurrency(filters, currencies[0] ?? 'USD', revenue(now))
  return {
    id: 'activities',
    title: t('rp.r_activities'),
    description: t('rp.r_activities_d'),
    kpis,
    blocks: [
      {
        kind: 'table',
        id: 'products',
        title: t('rp.table_by_product'),
        columns,
        rows: [...rows.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .map(([key, r]) => {
            const mm = margin(r.lines)
            return {
              name: cell(r.name, r.name, recordsHref('lines', filters, { ref: key })),
              kind: cell(t(`rp.kind_${r.kind}`), r.kind),
              count: cell(numberText(r.count, intl), r.count),
              money: cell(
                moneyText(r.money, intl),
                r.money.map((x) => `${x.minor} ${x.currency}`).join(' '),
              ),
              ...(ctx.finance
                ? {
                    margin: cell(
                      moneyText(mm.margin, intl),
                      mm.margin.map((x) => `${x.minor} ${x.currency}`).join(' '),
                    ),
                  }
                : {}),
              cancel: cell(
                percentText(rate(r.cancelled, r.count), intl),
                rate(r.cancelled, r.count),
              ),
            }
          }),
        empty: t('rp.empty'),
      },
      {
        kind: 'table',
        id: 'addons',
        title: t('rp.table_addons'),
        definition: t('rp.def_addons'),
        columns: [
          { key: 'name', label: t('rp.col_addon') },
          { key: 'bookings', label: t('rp.col_bookings_with'), num: true },
          { key: 'qty', label: t('rp.col_qty'), num: true },
          { key: 'money', label: t('rp.col_revenue'), num: true },
        ],
        rows: addons.map((row) => ({
          name: cell(pick(row.name, locale, row.ref_id ?? '—')),
          bookings: cell(numberText(Number(row.bookings), intl), Number(row.bookings)),
          qty: cell(numberText(Number(row.qty), intl), Number(row.qty)),
          money: cell(money(Number(row.minor), row.currency, intl), Number(row.minor)),
        })),
        empty: t('rp.empty'),
      },
      await salesLine({ ...filters, type: filters.type ?? 'activity' }, ctx, currency, 'sales'),
    ],
    notes: [t('rp.note_included_lines'), t('rp.note_currency')],
  }
}

/* --------------------------------------------------------------------------
   Customers
   -------------------------------------------------------------------------- */

export async function buildCustomers(
  filters: ReportFilters,
  ctx: BuildContext,
): Promise<ReportResult> {
  const { t, intl } = ctx
  const [[split, splitPrev], [orders, ordersPrev], totals] = await Promise.all([
    both(filters, (r) => customerSplit(r, filters)),
    both(filters, (r) => paidOrders(r, filters)),
    customerTotals(ctx.now, filters),
  ])
  const buyers = split.newCount + split.returningCount
  const ltv = lifetimeValue(totals)
  const customers = new Set(totals.map((row) => row.customer))
  const inactive = new Set(totals.filter((row) => row.inactive).map((row) => row.customer))
  // A customer active in any currency is not inactive.
  for (const row of totals) if (!row.inactive) inactive.delete(row.customer)
  const ordersPer = new Map<string, number>()
  for (const row of totals)
    ordersPer.set(row.customer, (ordersPer.get(row.customer) ?? 0) + row.orders)
  const buckets = { one: 0, two: 0, more: 0 }
  for (const n of ordersPer.values()) {
    if (n <= 1) buckets.one += 1
    else if (n === 2) buckets.two += 1
    else buckets.more += 1
  }

  return {
    id: 'customers',
    title: t('rp.r_customers'),
    description: t('rp.r_customers_d'),
    kpis: [
      countKpi(
        'buyers',
        t('rp.kpi_buyers'),
        t('rp.def_buyers'),
        buyers,
        splitPrev ? splitPrev.newCount + splitPrev.returningCount : null,
        recordsHref('customers', filters),
      ),
      countKpi(
        'new_customers',
        t('rp.kpi_new_customers'),
        t('rp.def_new_customers'),
        split.newCount,
        splitPrev?.newCount ?? null,
        recordsHref('customers', filters, { kind: 'new' }),
      ),
      countKpi(
        'returning_customers',
        t('rp.kpi_returning_customers'),
        t('rp.def_returning_customers'),
        split.returningCount,
        splitPrev?.returningCount ?? null,
        recordsHref('customers', filters, { kind: 'returning' }),
      ),
      moneyKpi(
        'aov',
        t('rp.kpi_aov'),
        t('rp.def_aov'),
        averageOrderValue(orders),
        ordersPrev ? averageOrderValue(ordersPrev) : null,
        recordsHref('orders_paid', filters),
      ),
      {
        ...moneyKpi('ltv', t('rp.kpi_ltv'), t('rp.def_ltv'), ltv, null),
        note: t('rp.note_all_time'),
      },
      countKpi(
        'inactive',
        t('rp.kpi_inactive'),
        t('rp.def_inactive'),
        inactive.size,
        null,
        '/customers',
        { note: t('rp.note_of_customers', { n: customers.size }) },
      ),
    ],
    blocks: [
      {
        kind: 'bar',
        id: 'repeat',
        title: t('rp.chart_repeat'),
        definition: t('rp.def_chart_repeat'),
        rows: [
          { label: t('rp.repeat_one'), value: buckets.one, display: numberText(buckets.one, intl) },
          { label: t('rp.repeat_two'), value: buckets.two, display: numberText(buckets.two, intl) },
          {
            label: t('rp.repeat_more'),
            value: buckets.more,
            display: numberText(buckets.more, intl),
          },
        ],
      },
      {
        kind: 'table',
        id: 'ltv',
        title: t('rp.table_ltv'),
        definition: t('rp.def_ltv'),
        columns: [
          { key: 'currency', label: t('common.currency') },
          { key: 'aov', label: t('rp.kpi_aov'), num: true },
          { key: 'ltv', label: t('rp.kpi_ltv'), num: true },
        ],
        rows: ltv.map((row) => {
          const aov =
            averageOrderValue(orders).find((x) => x.currency === row.currency)?.minor ?? null
          return {
            currency: cell(row.currency, row.currency),
            aov: cell(aov === null ? '—' : money(aov, row.currency, intl), aov),
            ltv: cell(money(row.minor, row.currency, intl), row.minor),
          }
        }),
        empty: t('rp.empty'),
      },
    ],
    notes: [t('rp.note_customer_key'), t('rp.note_currency')],
  }
}

/* --------------------------------------------------------------------------
   Marketing
   -------------------------------------------------------------------------- */

const FUNNEL = ['page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'] as const

export async function buildMarketing(
  filters: ReportFilters,
  ctx: BuildContext,
): Promise<ReportResult> {
  const { t, intl } = ctx
  const range = currentRange(filters)
  const [sources, visitors, [steps, stepsPrev], [abandoned, abandonedPrev], currencies] =
    await Promise.all([
      ordersBySource(range, filters),
      visitorsBySource(range),
      both(filters, (r) => funnelSteps(r, FUNNEL)),
      both(filters, (r) => abandonedCheckouts(r)),
      currencyOptions(),
    ])
  const currency = filters.currency ?? currencies[0] ?? 'USD'
  type Row = { label: string; campaign: string; visitors: number; orders: number; minor: number }
  const rows = new Map<string, Row>()
  const keyOf = (s: string | null, m: string | null, c: string | null) =>
    `${s ?? ''}|${m ?? ''}|${c ?? ''}`
  const row = (s: string | null, m: string | null, c: string | null) => {
    const key = keyOf(s, m, c)
    const existing = rows.get(key)
    if (existing) return existing
    const fresh: Row = {
      label: s ? sourceLabel(s, m) : t('rp.source_direct'),
      campaign: c ?? '—',
      visitors: 0,
      orders: 0,
      minor: 0,
    }
    rows.set(key, fresh)
    return fresh
  }
  for (const v of visitors) row(v.source, v.medium, v.campaign).visitors += v.visitors
  for (const o of sources) {
    const r = row(o.source, o.medium, o.campaign)
    r.orders += o.count
    if (o.currency === currency) r.minor += o.minor
  }

  const purchase = steps.get('purchase') ?? 0
  const visits = steps.get('page_view') ?? 0
  return {
    id: 'marketing',
    title: t('rp.r_marketing'),
    description: t('rp.r_marketing_d'),
    // Visits, the funnel and abandoned checkouts are site events, not orders.
    kpis: markNotByStaff(
      filters,
      [
        countKpi(
          'visitors',
          t('rp.kpi_visitors'),
          t('rp.def_visitors'),
          visits,
          stepsPrev?.get('page_view') ?? null,
        ),
        countKpi(
          'site_conversion',
          t('rp.kpi_site_conversion'),
          t('rp.def_site_conversion'),
          rate(purchase, visits),
          stepsPrev ? rate(stepsPrev.get('purchase') ?? 0, stepsPrev.get('page_view') ?? 0) : null,
          undefined,
          { kind: 'percent' },
        ),
        countKpi(
          'checkouts_started',
          t('rp.kpi_checkouts_started'),
          t('rp.def_checkouts_started'),
          abandoned.started,
          abandonedPrev?.started ?? null,
        ),
        countKpi(
          'abandoned',
          t('rp.kpi_abandoned'),
          t('rp.def_abandoned'),
          abandoned.abandoned,
          abandonedPrev?.abandoned ?? null,
          undefined,
          { lowerIsBetter: true },
        ),
        countKpi(
          'reminders',
          t('rp.kpi_reminders'),
          t('rp.def_reminders'),
          abandoned.reminded,
          abandonedPrev?.reminded ?? null,
          '/marketing',
        ),
      ],
      ['visitors', 'site_conversion', 'checkouts_started', 'abandoned', 'reminders'],
    ),
    blocks: [
      {
        kind: 'table',
        id: 'sources',
        title: t('rp.table_sources', { currency }),
        definition: t('rp.def_sources'),
        columns: staffNAColumns(
          filters,
          [
            { key: 'source', label: t('rp.col_source') },
            { key: 'campaign', label: t('rp.col_campaign') },
            { key: 'visitors', label: t('rp.col_visitors'), num: true },
            { key: 'orders', label: t('rp.col_orders'), num: true },
            { key: 'revenue', label: t('rp.col_revenue'), num: true },
            { key: 'conversion', label: t('rp.col_conversion'), num: true },
          ],
          ['visitors', 'conversion'],
        ),
        rows: [...rows.values()]
          .sort((a, b) => b.minor - a.minor || b.visitors - a.visitors)
          .map((r) => ({
            source: cell(r.label),
            campaign: cell(r.campaign),
            visitors: cell(numberText(r.visitors, intl), r.visitors),
            orders: cell(numberText(r.orders, intl), r.orders),
            revenue: cell(money(r.minor, currency, intl), r.minor),
            conversion: cell(
              percentText(rate(r.orders, r.visitors), intl),
              rate(r.orders, r.visitors),
            ),
          })),
        empty: t('rp.empty'),
      },
      notByStaff(filters, {
        kind: 'bar',
        id: 'funnel',
        title: t('rp.chart_funnel'),
        definition: t('rp.def_chart_funnel'),
        rows: FUNNEL.map((step, index) => {
          const n = steps.get(step) ?? 0
          const before = index === 0 ? null : (steps.get(FUNNEL[index - 1] ?? 'page_view') ?? 0)
          return {
            label: t(`rp.step_${step}`),
            value: n,
            display:
              before === null
                ? numberText(n, intl)
                : `${numberText(n, intl)} · ${percentText(rate(n, before), intl)}`,
          }
        }),
      }),
    ],
    notes: [t('rp.note_consent'), t('rp.note_last_touch')],
  }
}

/* --------------------------------------------------------------------------
   Suppliers
   -------------------------------------------------------------------------- */

export async function buildSuppliers(
  filters: ReportFilters,
  ctx: BuildContext,
): Promise<ReportResult> {
  const { t, intl } = ctx
  const lines = await bookingLines(currentRange(filters), filters)
  type Row = {
    name: string
    bookings: number
    cancelled: number
    sales: Money[]
    cost: Money[]
    payable: Money[]
    timing: { paidAt: Date; confirmedAt: Date | null }[]
  }
  const rows = new Map<string, Row>()
  for (const line of lines) {
    const key = line.supplierId ?? 'none'
    const r = rows.get(key) ?? {
      name: line.supplierName ?? t('rp.no_supplier'),
      bookings: 0,
      cancelled: 0,
      sales: [],
      cost: [],
      payable: [],
      timing: [],
    }
    r.bookings += 1
    const cancelled = bookingGroup(line.status) === 'cancelled'
    if (cancelled) r.cancelled += 1
    r.sales = sumByCurrency([...r.sales, { currency: line.currency, minor: line.lineTotalMinor }])
    if (line.costMinor !== null && line.costCurrency) {
      r.cost = sumByCurrency([...r.cost, { currency: line.costCurrency, minor: line.costMinor }])
      if (!cancelled && line.settlementId === null) {
        r.payable = sumByCurrency([
          ...r.payable,
          { currency: line.costCurrency, minor: line.costMinor },
        ])
      }
    }
    const paidAt = toDate(line.paidAt)
    if (paidAt && line.supplierId) r.timing.push({ paidAt, confirmedAt: toDate(line.confirmedAt) })
    rows.set(key, r)
  }
  const columns: TableBlock['columns'] = [
    { key: 'name', label: t('rp.col_supplier') },
    { key: 'bookings', label: t('rp.kpi_bookings'), num: true },
    { key: 'sales', label: t('rp.col_revenue'), num: true },
  ]
  if (ctx.finance) {
    columns.push({ key: 'cost', label: t('rp.kpi_supplier_cost'), num: true })
    columns.push({ key: 'payable', label: t('rp.col_payable'), num: true })
  }
  columns.push(
    { key: 'confirm', label: t('rp.kpi_supplier_confirm_rate'), num: true },
    { key: 'hours', label: t('rp.kpi_supplier_confirm_hours'), num: true },
    { key: 'cancelled', label: t('rp.group_cancelled'), num: true },
  )
  const all = confirmationStats([...rows.values()].flatMap((r) => r.timing))
  const payableAll = sumByCurrency([...rows.values()].flatMap((r) => r.payable))
  const kpis: Kpi[] = [
    countKpi(
      'supplier_confirm_rate',
      t('rp.kpi_supplier_confirm_rate'),
      t('rp.def_supplier_confirm_rate'),
      all.rate,
      null,
      recordsHref('bookings', filters, { group: 'supplier' }),
      { kind: 'percent' },
    ),
    countKpi(
      'supplier_confirm_hours',
      t('rp.kpi_supplier_confirm_hours'),
      t('rp.def_supplier_confirm_hours'),
      all.avgHours,
      null,
      undefined,
      { kind: 'hours', lowerIsBetter: true },
    ),
  ]
  if (ctx.finance)
    kpis.push(
      moneyKpi('payable', t('rp.col_payable'), t('rp.def_payable'), payableAll, null, '/payables'),
    )

  return {
    id: 'suppliers',
    title: t('rp.r_suppliers'),
    description: t('rp.r_suppliers_d'),
    kpis,
    blocks: [
      {
        kind: 'table',
        id: 'suppliers',
        title: t('rp.table_suppliers'),
        definition: t('rp.def_suppliers_table'),
        columns,
        rows: [...rows.entries()]
          .sort((a, b) => b[1].bookings - a[1].bookings)
          .map(([key, r]) => {
            const s = confirmationStats(r.timing)
            return {
              name: cell(r.name, r.name, key === 'none' ? undefined : `/suppliers/${key}`),
              bookings: cell(numberText(r.bookings, intl), r.bookings),
              sales: cell(
                moneyText(r.sales, intl),
                r.sales.map((x) => `${x.minor} ${x.currency}`).join(' '),
              ),
              ...(ctx.finance
                ? {
                    cost: cell(
                      moneyText(r.cost, intl),
                      r.cost.map((x) => `${x.minor} ${x.currency}`).join(' '),
                    ),
                    payable: cell(
                      moneyText(r.payable, intl),
                      r.payable.map((x) => `${x.minor} ${x.currency}`).join(' '),
                    ),
                  }
                : {}),
              confirm: cell(percentText(s.rate, intl), s.rate),
              hours: cell(numberText(s.avgHours, intl, 1), s.avgHours),
              cancelled: cell(numberText(r.cancelled, intl), r.cancelled),
            }
          }),
        empty: t('rp.empty'),
      },
    ],
    notes: [t('rp.note_bookable'), t('rp.note_payable')],
  }
}

/* --------------------------------------------------------------------------
   Operations
   -------------------------------------------------------------------------- */

export async function buildOperations(
  filters: ReportFilters,
  ctx: BuildContext,
): Promise<ReportResult> {
  const { t, intl } = ctx
  const range: Range = currentRange(filters)
  const [failed, unprocessed, stale, [denied, deniedPrev], [errors, errorsPrev]] =
    await Promise.all([
      failedPayments(range, filters),
      unprocessedBookings(ctx.now, filters),
      staleUnpaidOrders(ctx.now, filters),
      both(filters, (r) => deniedDownloads(r)),
      both(filters, (r) => mapErrors(r)),
    ])
  const errorTotal = (rows: typeof errors) => rows.reduce((sum, row) => sum + row.n, 0)
  const locale = loc(intl)
  const dateFmt = new Intl.DateTimeFormat(intl, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Makassar',
  })

  return {
    id: 'operations',
    title: t('rp.r_operations'),
    description: t('rp.r_operations_d'),
    // Refused downloads and map errors are not orders.
    kpis: markNotByStaff(
      filters,
      [
        countKpi(
          'failed_payments',
          t('rp.kpi_payment_failed'),
          t('rp.def_payment_failed'),
          failed.length,
          null,
          recordsHref('payments', filters, { status: 'failed' }),
          { lowerIsBetter: true },
        ),
        countKpi(
          'unprocessed',
          t('rp.kpi_unprocessed'),
          t('rp.def_unprocessed', { hours: UNPROCESSED_AFTER_HOURS }),
          unprocessed.length,
          null,
          undefined,
          { lowerIsBetter: true, note: t('rp.note_now') },
        ),
        countKpi(
          'stale_unpaid',
          t('rp.kpi_stale_unpaid'),
          t('rp.def_stale_unpaid'),
          stale,
          null,
          '/orders?status=pending',
          { lowerIsBetter: true, note: t('rp.note_now') },
        ),
        countKpi(
          'denied_downloads',
          t('rp.kpi_denied_downloads'),
          t('rp.def_denied_downloads'),
          denied,
          deniedPrev,
          '/protection/activity',
          { lowerIsBetter: true },
        ),
        countKpi(
          'map_errors',
          t('rp.kpi_map_errors'),
          t('rp.def_map_errors'),
          errorTotal(errors),
          errorsPrev ? errorTotal(errorsPrev) : null,
          '/map-analytics',
          { lowerIsBetter: true },
        ),
      ],
      ['denied_downloads', 'map_errors'],
    ),
    blocks: [
      {
        kind: 'table',
        id: 'unprocessed',
        title: t('rp.table_unprocessed'),
        definition: t('rp.def_unprocessed', { hours: UNPROCESSED_AFTER_HOURS }),
        columns: [
          { key: 'order', label: t('rp.col_order') },
          { key: 'name', label: t('rp.col_product') },
          { key: 'status', label: t('common.status') },
          { key: 'travel', label: t('rp.col_travel_date') },
          { key: 'placed', label: t('rp.col_placed') },
        ],
        rows: unprocessed.map((row) => {
          const placed = toDate(row.placed)
          return {
            order: cell(row.orderNumber, row.orderNumber, `/orders/${row.orderId}`),
            name: cell(pick(row.name, locale)),
            status: cell(t(`rp.status_${row.status}`), row.status),
            travel: cell(row.travelDate ?? '—', row.travelDate),
            placed: cell(
              placed ? dateFmt.format(placed) : '—',
              placed ? placed.toISOString() : null,
            ),
          }
        }),
        empty: t('rp.empty_good'),
      },
      {
        kind: 'table',
        id: 'failed_payments',
        title: t('rp.table_failed_payments'),
        columns: [
          { key: 'order', label: t('rp.col_order') },
          { key: 'provider', label: t('rp.col_provider') },
          { key: 'amount', label: t('common.total'), num: true },
          { key: 'when', label: t('rp.col_when') },
        ],
        rows: failed.map((row) => ({
          order: cell(row.orderNumber, row.orderNumber, `/orders/${row.orderId}`),
          provider: cell(`${row.provider}${row.method ? ` · ${row.method}` : ''}`),
          amount: cell(money(row.amountMinor, row.currency, intl), row.amountMinor),
          when: cell(dateFmt.format(row.createdAt), row.createdAt.toISOString()),
        })),
        empty: t('rp.empty_good'),
      },
      notByStaff(filters, {
        kind: 'bar',
        id: 'map_errors',
        title: t('rp.kpi_map_errors'),
        definition: t('rp.def_map_errors'),
        rows: errors.map((row) => ({
          label: row.code,
          value: row.n,
          display: numberText(row.n, intl),
        })),
      }),
    ],
    notes: [t('rp.note_bali_time')],
  }
}
