import { pick } from '@/lib/content/localize'
import { sourceLabel } from '@/lib/analytics/utm'

import {
  bookingStatusCounts,
  bookingsValue,
  collected,
  costLines,
  currencyOptions,
  customerSplit,
  lowAvailability,
  openCustomRequests,
  orderCounts,
  ordersBySource,
  paymentOutcomes,
  refundTotals,
  salesByGroup,
  salesSeries,
  topProducts,
  viewToPurchase,
  type SalesGroup,
} from '../data'
import type { ReportFilters } from '../filters'
import { bookingGroup, margin, rate, sumByCurrency, type BookingGroup, type Money } from '../metrics'
import { alignSeries, bucketKeys } from '../period'
import type { BarChartBlock, Block, Kpi, ReportResult } from '../types'
import {
  both,
  chartCurrency,
  countKpi,
  lineChart,
  money,
  moneyKpi,
  numberText,
  previousKeys,
  rangeLabel,
  recordsHref,
  type BuildContext,
} from './helpers'

/**
 * The Studio home: the numbers of the chosen period next to the previous
 * one, each a link to the records behind it, and four charts.
 */

const GROUPS: readonly BookingGroup[] = ['confirmed', 'pending', 'cancelled']

export function groupMoney(
  groups: Map<SalesGroup, { count: number; money: Money[] }> | null,
  keys: readonly SalesGroup[],
): { count: number; money: Money[] } {
  if (groups === null) return { count: 0, money: [] }
  let count = 0
  const all: Money[] = []
  for (const key of keys) {
    const entry = groups.get(key)
    if (!entry) continue
    count += entry.count
    all.push(...entry.money)
  }
  return { count, money: sumByCurrency(all) }
}

function groupCounts(map: Map<string, number> | null): Record<BookingGroup, number> | null {
  if (map === null) return null
  const out: Record<BookingGroup, number> = { confirmed: 0, pending: 0, cancelled: 0 }
  for (const [status, n] of map) out[bookingGroup(status)] += n
  return out
}

export async function buildOverview(
  filters: ReportFilters,
  ctx: BuildContext,
  options: { openTickets?: { open: number; late: number } | null } = {},
): Promise<ReportResult> {
  const { t, intl } = ctx
  const p = filters.period

  const [
    [value, valuePrev],
    [paid, paidPrev],
    [refund, refundPrev],
    [counts, countsPrev],
    [statuses, statusesPrev],
    [outcomes, outcomesPrev],
    [groups, groupsPrev],
    [customers, customersPrev],
    [conversion, conversionPrev],
    [lines, linesPrev],
    openRequests,
    lowSpots,
    currencies,
  ] = await Promise.all([
    both(filters, (r) => bookingsValue(r, filters)),
    both(filters, (r) => collected(r, filters)),
    both(filters, (r) => refundTotals(r, filters)),
    both(filters, (r) => orderCounts(r, filters)),
    both(filters, (r) => bookingStatusCounts(r, filters)),
    both(filters, (r) => paymentOutcomes(r, filters)),
    both(filters, (r) => salesByGroup(r, filters)),
    ctx.customers
      ? both(filters, (r) => customerSplit(r, filters))
      : Promise.resolve([null, null] as const),
    both(filters, (r) => viewToPurchase(r)),
    ctx.finance ? both(filters, (r) => costLines(r, filters)) : Promise.resolve([null, null] as const),
    openCustomRequests(),
    lowAvailability(ctx.now),
    currencyOptions(),
  ])

  const group = groupCounts(statuses)
  const groupPrev = groupCounts(statusesPrev)

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
  ]

  if (ctx.finance && lines !== null) {
    const m = margin(lines)
    const mPrev = linesPrev ? margin(linesPrev) : null
    kpis.push(
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
    )
  }

  kpis.push(
    countKpi(
      'orders',
      t('rp.kpi_orders'),
      t('rp.def_orders'),
      counts.placed,
      countsPrev?.placed ?? null,
      recordsHref('orders_all', filters),
      { note: t('rp.note_paid_orders', { n: counts.paid }) },
    ),
  )
  for (const key of GROUPS) {
    kpis.push(
      countKpi(
        `bookings_${key}`,
        t(`rp.kpi_bookings_${key}`),
        t(`rp.def_bookings_${key}`),
        group?.[key] ?? 0,
        groupPrev?.[key] ?? null,
        recordsHref('bookings', filters, { group: key }),
        { lowerIsBetter: key !== 'confirmed' },
      ),
    )
  }
  const attempts = outcomes.succeeded + outcomes.failed
  const attemptsPrev = outcomesPrev ? outcomesPrev.succeeded + outcomesPrev.failed : 0
  kpis.push(
    countKpi(
      'payment_success',
      t('rp.kpi_payment_success'),
      t('rp.def_payment_success'),
      rate(outcomes.succeeded, attempts),
      outcomesPrev ? rate(outcomesPrev.succeeded, attemptsPrev) : null,
      recordsHref('payments', filters, { status: 'succeeded' }),
      { kind: 'percent', note: t('rp.note_attempts', { n: attempts }) },
    ),
    countKpi(
      'payment_failed',
      t('rp.kpi_payment_failed'),
      t('rp.def_payment_failed'),
      outcomes.failed,
      outcomesPrev?.failed ?? null,
      recordsHref('payments', filters, { status: 'failed' }),
      { lowerIsBetter: true },
    ),
  )

  const salesKpi = (id: string, keys: SalesGroup[], href: string) => {
    const now = groupMoney(groups, keys)
    const before = groupsPrev ? groupMoney(groupsPrev, keys) : null
    return {
      ...moneyKpi(id, t(`rp.kpi_${id}`), t(`rp.def_${id}`), now.money, before?.money ?? null, href),
      note: t('rp.note_sold', { n: now.count }),
    }
  }
  kpis.push(
    salesKpi('itinerary_sales', ['itinerary'], recordsHref('lines', filters, { group: 'itinerary' })),
    salesKpi(
      'activity_sales',
      ['activity', 'package'],
      recordsHref('lines', filters, { group: 'activity_package' }),
    ),
    salesKpi('vip_sales', ['vip'], recordsHref('lines', filters, { group: 'vip' })),
  )

  if (customers !== null) {
    kpis.push(
      countKpi(
        'new_customers',
        t('rp.kpi_new_customers'),
        t('rp.def_new_customers'),
        customers.newCount,
        customersPrev?.newCount ?? null,
        recordsHref('customers', filters, { kind: 'new' }),
      ),
      countKpi(
        'returning_customers',
        t('rp.kpi_returning_customers'),
        t('rp.def_returning_customers'),
        customers.returningCount,
        customersPrev?.returningCount ?? null,
        recordsHref('customers', filters, { kind: 'returning' }),
      ),
    )
  }

  kpis.push(
    countKpi(
      'open_requests',
      t('rp.kpi_open_requests'),
      t('rp.def_open_requests'),
      openRequests,
      null,
      '/leads',
      { note: t('rp.note_now') },
    ),
  )
  kpis.push(
    options.openTickets
      ? countKpi(
          'open_tickets',
          t('rp.kpi_open_tickets'),
          t('rp.def_open_tickets'),
          options.openTickets.open,
          null,
          '/support',
          { note: t('rp.note_late_tickets', { n: options.openTickets.late }) },
        )
      : {
          id: 'open_tickets',
          label: t('rp.kpi_open_tickets'),
          definition: t('rp.def_open_tickets'),
          value: { kind: 'unavailable', reason: t('rp.not_connected') },
        },
    countKpi(
      'low_availability',
      t('rp.kpi_low_availability'),
      t('rp.def_low_availability'),
      lowSpots.length,
      null,
      recordsHref('low_availability', filters),
      { lowerIsBetter: true, note: t('rp.note_now') },
    ),
    {
      id: 'supplier_sync_errors',
      label: t('rp.kpi_supplier_sync'),
      definition: t('rp.def_supplier_sync'),
      value: { kind: 'unavailable', reason: t('rp.not_connected') },
    },
    countKpi(
      'view_to_booking',
      t('rp.kpi_view_to_booking'),
      t('rp.def_view_to_booking'),
      rate(conversion.buyers, conversion.viewers),
      conversionPrev ? rate(conversionPrev.buyers, conversionPrev.viewers) : null,
      '/reports/marketing',
      {
        kind: 'percent',
        note: t('rp.note_conversion', { buyers: conversion.buyers, viewers: conversion.viewers }),
      },
    ),
  )

  // --- Charts --------------------------------------------------------------
  const currency = chartCurrency(filters, currencies[0] ?? 'USD', value, valuePrev)
  const [series, seriesPrev, top, sources] = await Promise.all([
    salesSeries({ start: p.start, end: p.end }, p.bucket, currency, filters),
    filters.compare
      ? salesSeries({ start: p.prevStart, end: p.prevEnd }, p.bucket, currency, filters)
      : Promise.resolve(null),
    topProducts({ start: p.start, end: p.end }, currency, filters),
    ordersBySource({ start: p.start, end: p.end }, filters),
  ])

  const keys = bucketKeys(p.start, p.end, p.bucket)
  const blocks: Block[] = [
    lineChart({
      id: 'sales_over_time',
      title: t('rp.chart_sales', { currency }),
      definition: t('rp.def_chart_sales'),
      current: alignSeries(keys, series),
      previous: seriesPrev ? alignSeries(previousKeys(p), seriesPrev) : null,
      currentLabel: rangeLabel(p.fromDate, p.toDate, intl),
      previousLabel: rangeLabel(p.prevFromDate, p.prevToDate, intl),
      unit: 'money',
      currency,
      period: p,
      intl,
    }),
  ]

  const statusChart: BarChartBlock = {
    kind: 'bar',
    id: 'bookings_by_status',
    title: t('rp.chart_bookings_status'),
    definition: t('rp.def_chart_bookings_status'),
    rows: GROUPS.map((key) => ({
      label: t(`rp.group_${key}`),
      value: group?.[key] ?? 0,
      display: numberText(group?.[key] ?? 0, intl),
      href: recordsHref('bookings', filters, { group: key }),
      tone: key === 'confirmed' ? 'good' : key === 'pending' ? 'warn' : 'bad',
    })),
  }
  blocks.push(statusChart)

  const locale = intl.startsWith('ar') ? 'ar' : 'en'
  blocks.push({
    kind: 'bar',
    id: 'top_products',
    title: t('rp.chart_top_products', { currency }),
    definition: t('rp.def_chart_top_products'),
    rows: top.map((row) => ({
      label: `${pick(row.name, locale, row.refId)} · ${t(`rp.kind_${row.kind}`)}`,
      value: row.minor,
      display: `${money(row.minor, currency, intl)} · ${t('rp.note_sold', { n: row.count })}`,
      href: recordsHref('lines', filters, { ref: row.refId }),
    })),
  })

  const bySource = new Map<string, { count: number; minor: number }>()
  for (const row of sources) {
    if (row.currency !== currency) continue
    const label = row.source ? sourceLabel(row.source, row.medium) : t('rp.source_direct')
    const entry = bySource.get(label) ?? { count: 0, minor: 0 }
    entry.count += row.count
    entry.minor += row.minor
    bySource.set(label, entry)
  }
  blocks.push({
    kind: 'bar',
    id: 'customer_sources',
    title: t('rp.chart_sources', { currency }),
    definition: t('rp.def_chart_sources'),
    rows: [...bySource.entries()]
      .sort((a, b) => b[1].minor - a[1].minor)
      .slice(0, 8)
      .map(([label, entry]) => ({
        label,
        value: entry.minor,
        display: `${money(entry.minor, currency, intl)} · ${t('rp.note_orders', { n: entry.count })}`,
        href: '/reports/marketing',
      })),
  })

  return {
    id: 'overview',
    title: t('rp.overview_title'),
    description: t('rp.overview_description'),
    kpis,
    blocks,
    notes: [t('rp.note_currency'), t('rp.note_bali_time'), t('rp.note_consent')],
  }
}
