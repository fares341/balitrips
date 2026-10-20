import { resolvePeriod, type Period } from './period'

/**
 * Report filters, read from the page URL — so every view, export and
 * drill-down link is a plain address that shows the same numbers again.
 */

export const PRODUCT_TYPES = [
  'activity',
  'package',
  'itinerary',
  'vip',
  'map',
  'driver',
  'custom',
] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

export interface ReportFilters {
  period: Period
  /** Compare with the previous period (on unless `compare=0`). */
  compare: boolean
  type: ProductType | null
  supplierId: string | null
  currency: string | null
}

type Params = Record<string, string | string[] | undefined>

function one(params: Params, name: string): string | null {
  const value = params[name]
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' && first !== '' ? first : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseReportFilters(params: Params, now: Date = new Date()): ReportFilters {
  const type = one(params, 'type')
  const supplier = one(params, 'supplier')
  const currency = one(params, 'currency')
  return {
    period: resolvePeriod(
      { preset: one(params, 'period'), from: one(params, 'from'), to: one(params, 'to') },
      now,
    ),
    compare: one(params, 'compare') !== '0',
    type:
      type && (PRODUCT_TYPES as readonly string[]).includes(type) ? (type as ProductType) : null,
    supplierId: supplier && UUID.test(supplier) ? supplier : null,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
  }
}

/** The filters as URL parameters (for links, exports and drill-downs). */
export function filterParams(filters: ReportFilters): Record<string, string> {
  const out: Record<string, string> = { period: filters.period.preset }
  if (filters.period.preset === 'custom') {
    out.from = filters.period.fromDate
    out.to = filters.period.toDate
  }
  if (!filters.compare) out.compare = '0'
  if (filters.type) out.type = filters.type
  if (filters.supplierId) out.supplier = filters.supplierId
  if (filters.currency) out.currency = filters.currency
  return out
}

export function filterQuery(filters: ReportFilters, extra: Record<string, string> = {}): string {
  return new URLSearchParams({ ...filterParams(filters), ...extra }).toString()
}
