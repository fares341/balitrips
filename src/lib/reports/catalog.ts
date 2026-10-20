import type { ReportFilters } from './filters'
import type { BuildContext } from './builders/helpers'
import type { ReportResult } from './types'

/**
 * The report centre (Studio → التقارير). Who may open each report:
 *  - financial  needs the money picture (`finance`: admin / finance);
 *  - customers  needs customer access;
 *  - the rest   anyone who reads orders. Cost, margin and payable columns
 *               inside them still need `finance` and are left out otherwise.
 */
export const REPORT_IDS = [
  'financial',
  'bookings',
  'itineraries',
  'vip',
  'activities',
  'customers',
  'marketing',
  'suppliers',
  'operations',
] as const

export type ReportId = (typeof REPORT_IDS)[number]

export function isReportId(value: unknown): value is ReportId {
  return typeof value === 'string' && (REPORT_IDS as readonly string[]).includes(value)
}

export type ReportAccess = 'finance' | 'customers' | 'orders'

export const REPORT_ACCESS: Record<ReportId, ReportAccess> = {
  financial: 'finance',
  bookings: 'orders',
  itineraries: 'orders',
  vip: 'orders',
  activities: 'orders',
  customers: 'customers',
  marketing: 'orders',
  suppliers: 'orders',
  operations: 'orders',
}

export const REPORT_ICONS: Record<ReportId, string> = {
  financial: 'card',
  bookings: 'clipboard',
  itineraries: 'route',
  vip: 'star',
  activities: 'compass',
  customers: 'users',
  marketing: 'globe',
  suppliers: 'box',
  operations: 'pulse',
}

export function mayOpen(
  id: ReportId,
  access: { finance: boolean; customers: boolean; orders: boolean },
): boolean {
  const need = REPORT_ACCESS[id]
  return need === 'finance'
    ? access.finance
    : need === 'customers'
      ? access.customers
      : access.orders
}

export async function buildReport(
  id: ReportId,
  filters: ReportFilters,
  ctx: BuildContext,
): Promise<ReportResult> {
  const builders = await import('./builders/reports')
  switch (id) {
    case 'financial':
      return builders.buildFinancial(filters, ctx)
    case 'bookings':
      return builders.buildBookings(filters, ctx)
    case 'itineraries':
      return builders.buildItineraries(filters, ctx)
    case 'vip':
      return builders.buildVip(filters, ctx)
    case 'activities':
      return builders.buildActivities(filters, ctx)
    case 'customers':
      return builders.buildCustomers(filters, ctx)
    case 'marketing':
      return builders.buildMarketing(filters, ctx)
    case 'suppliers':
      return builders.buildSuppliers(filters, ctx)
    case 'operations':
      return builders.buildOperations(filters, ctx)
  }
}
