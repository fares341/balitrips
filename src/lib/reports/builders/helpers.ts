import { formatMoney } from '@/lib/money'

import { filterQuery, type ReportFilters } from '../filters'
import { mainCurrency, type Money } from '../metrics'
import { BALI_OFFSET_MS, bucketKeys, type Period } from '../period'
import type { Block, Cell, Kpi, LineChartBlock, ReportResult } from '../types'
import type { Range } from '../data'

export type Translate = (
  key: string,
  vars?: Record<string, string | number | bigint | null | undefined>,
) => string

export interface BuildContext {
  t: Translate
  /** Intl locale for numbers and dates. */
  intl: string
  /** May see costs, margins and payables (admin / finance). */
  finance: boolean
  /** May see customer figures. */
  customers: boolean
  now: Date
}

export function currentRange(filters: ReportFilters): Range {
  return { start: filters.period.start, end: filters.period.end }
}

export function previousRange(filters: ReportFilters): Range | null {
  return filters.compare ? { start: filters.period.prevStart, end: filters.period.prevEnd } : null
}

/** Run a query for the period and (when comparing) the previous one. */
export async function both<T>(
  filters: ReportFilters,
  query: (range: Range) => Promise<T>,
): Promise<[Awaited<T>, Awaited<T> | null]> {
  const prev = previousRange(filters)
  return Promise.all([query(currentRange(filters)), prev ? query(prev) : Promise.resolve(null)])
}

export function money(minor: number, currency: string, intl: string): string {
  return formatMoney(minor, currency, intl)
}

export function moneyText(list: readonly Money[], intl: string): string {
  if (list.length === 0) return '—'
  return list.map((m) => formatMoney(m.minor, m.currency, intl)).join(' · ')
}

export function numberText(value: number | null, intl: string, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(intl, { maximumFractionDigits: digits }).format(value)
}

export function percentText(value: number | null, intl: string): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(value)}%`
}

/** The currency charts are drawn in: the filter, else the busiest one. */
export function chartCurrency(
  filters: ReportFilters,
  fallback: string,
  ...amounts: readonly (readonly Money[] | null)[]
): string {
  return (
    filters.currency ?? mainCurrency(...amounts.filter((a): a is Money[] => a !== null)) ?? fallback
  )
}

/** Studio path of the records behind a number. */
export function recordsHref(
  metric: string,
  filters: ReportFilters,
  extra: Record<string, string> = {},
): string {
  return `/reports/records?${filterQuery(filters, { metric, ...extra })}`
}

export function cell(text: string, raw?: string | number | null, href?: string): Cell {
  return { text, ...(raw !== undefined ? { raw } : {}), ...(href ? { href } : {}) }
}

/** x-axis labels for a period's buckets, in Bali time. */
export function bucketLabels(period: Period, intl: string): string[] {
  const keys = bucketKeys(period.start, period.end, period.bucket)
  if (period.bucket === 'hour') return keys.map((h) => `${h}:00`)
  if (period.bucket === 'month') {
    const fmt = new Intl.DateTimeFormat(intl, { month: 'short', year: 'numeric', timeZone: 'UTC' })
    return keys.map((k) => fmt.format(new Date(`${k}-01T00:00:00Z`)))
  }
  const fmt = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return keys.map((k) => fmt.format(new Date(`${k}T00:00:00Z`)))
}

/** "1 Oct – 20 Oct 2026" for a period or its comparison. */
export function rangeLabel(from: string, to: string, intl: string): string {
  const fmt = new Intl.DateTimeFormat(intl, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  const a = fmt.format(new Date(`${from}T00:00:00Z`))
  const b = fmt.format(new Date(`${to}T00:00:00Z`))
  return a === b ? a : `${a} – ${b}`
}

/** Keys of the previous period's buckets, aligned by position with the current ones. */
export function previousKeys(period: Period): string[] {
  return bucketKeys(period.prevStart, period.prevEnd, period.bucket)
}

export function lineChart(
  input: Omit<LineChartBlock, 'kind' | 'labels'> & { period: Period; intl: string },
): LineChartBlock {
  const { period, intl, ...rest } = input
  return { kind: 'line', labels: bucketLabels(period, intl), ...rest }
}

export function moneyKpi(
  id: string,
  label: string,
  definition: string,
  current: Money[],
  prev: Money[] | null,
  href?: string,
  lowerIsBetter?: boolean,
): Kpi {
  return {
    id,
    label,
    definition,
    value: { kind: 'money', money: current, prev },
    ...(href ? { href } : {}),
    ...(lowerIsBetter ? { lowerIsBetter } : {}),
  }
}

export function countKpi(
  id: string,
  label: string,
  definition: string,
  current: number | null,
  prev: number | null,
  href?: string,
  options: { kind?: 'count' | 'percent' | 'hours'; lowerIsBetter?: boolean; note?: string } = {},
): Kpi {
  return {
    id,
    label,
    definition,
    value: { kind: options.kind ?? 'count', value: current, prev },
    ...(href ? { href } : {}),
    ...(options.lowerIsBetter ? { lowerIsBetter: true } : {}),
    ...(options.note ? { note: options.note } : {}),
  }
}

/** Bali time "now" as a date string, for snapshot notes. */
export function baliToday(now: Date): string {
  return new Date(now.getTime() + BALI_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Phase 6: mark a figure the "Staff" filter cannot narrow (it is not about
 * orders). With the filter off nothing changes; with it on, the Studio shows
 * the figure greyed with "لا ينطبق عليه فلتر الموظف" instead of passing an
 * unfiltered number off as the staff member's.
 */
export function notByStaff(filters: Pick<ReportFilters, 'staffId'>, item: Kpi): Kpi
export function notByStaff(filters: Pick<ReportFilters, 'staffId'>, item: Block): Block
export function notByStaff(
  filters: Pick<ReportFilters, 'staffId'>,
  item: Kpi | Block,
): Kpi | Block {
  return filters.staffId ? { ...item, staffNA: true } : item
}

/** Same, for some columns of a table (`keys`). */
export function staffNAColumns<T extends { key: string }>(
  filters: Pick<ReportFilters, 'staffId'>,
  columns: T[],
  keys: readonly string[],
): (T & { staffNA?: boolean })[] {
  if (!filters.staffId) return columns
  return columns.map((column) =>
    keys.includes(column.key) ? { ...column, staffNA: true } : column,
  )
}

/** `notByStaff` for a list of blocks (all of them come from site events). */
export function blocksNotByStaff(
  filters: Pick<ReportFilters, 'staffId'>,
  blocks: Block[],
): Block[] {
  return blocks.map((block) => notByStaff(filters, block))
}

/** The staff filter's definition in the report's footnotes (page, CSV, PDF, email). */
export function withStaffNote(
  result: ReportResult,
  filters: Pick<ReportFilters, 'staffId'>,
  t: Translate,
): ReportResult {
  // Off: the definition closes the footnotes, so the filter is explained
  // before anyone uses it. On: it leads them.
  if (!filters.staffId) return { ...result, notes: [...result.notes, t('rp.def_staff_filter')] }
  return { ...result, notes: [t('rp.def_staff_filter'), ...result.notes] }
}
