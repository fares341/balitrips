/**
 * Report arithmetic — pure functions over plain rows, tested with fixtures
 * (metrics.test.ts). The database queries only fetch rows; every ratio,
 * average and classification shown in the Studio is computed here, so its
 * definition lives in one testable place.
 *
 * Money is never added across currencies: anything with an amount is grouped
 * by currency first.
 */

export interface Money {
  currency: string
  minor: number
}

/** n / d as a percentage, or null when there is nothing to divide by. */
export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null
  return (numerator / denominator) * 100
}

/** Sum amounts per currency, largest first. Zero totals are dropped. */
export function sumByCurrency(rows: readonly { currency: string; minor: number }[]): Money[] {
  const totals = new Map<string, number>()
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.minor)
  return [...totals.entries()]
    .filter(([, minor]) => minor !== 0)
    .map(([currency, minor]) => ({ currency, minor }))
    .sort((a, b) => b.minor - a.minor || a.currency.localeCompare(b.currency))
}

/** The amount in one currency (0 when absent). */
export function amountIn(money: readonly Money[], currency: string): number {
  return money.find((m) => m.currency === currency)?.minor ?? 0
}

/** The main currency of a set of amounts: the largest; null when empty. */
export function mainCurrency(...groups: readonly (readonly Money[])[]): string | null {
  const totals = sumByCurrency(groups.flat())
  return totals[0]?.currency ?? null
}

/** Average order value per currency: revenue ÷ number of paid orders in it. */
export function averageOrderValue(
  orders: readonly { currency: string; totalMinor: number }[],
): Money[] {
  const sums = new Map<string, { total: number; count: number }>()
  for (const order of orders) {
    const entry = sums.get(order.currency) ?? { total: 0, count: 0 }
    entry.total += order.totalMinor
    entry.count += 1
    sums.set(order.currency, entry)
  }
  return [...sums.entries()]
    .map(([currency, { total, count }]) => ({ currency, minor: Math.round(total / count) }))
    .sort((a, b) => b.minor - a.minor)
}

/**
 * New vs returning customers in a period.
 *
 * A customer is the account, or the email for a guest. New = their first
 * ever paid order is inside the period; returning = they had a paid order
 * before the period started and bought again inside it.
 */
export function newVsReturning(
  rows: readonly { customer: string; firstPaidAt: Date; paidInPeriod: boolean }[],
  periodStart: Date,
): { newCount: number; returningCount: number } {
  let newCount = 0
  let returningCount = 0
  for (const row of rows) {
    if (!row.paidInPeriod) continue
    if (row.firstPaidAt >= periodStart) newCount += 1
    else returningCount += 1
  }
  return { newCount, returningCount }
}

/**
 * Lifetime value: everything a customer paid (less refunds), averaged over
 * customers, per currency.
 */
export function lifetimeValue(
  rows: readonly { customer: string; currency: string; paidMinor: number; refundedMinor: number }[],
): Money[] {
  const perCurrency = new Map<string, { total: number; customers: Set<string> }>()
  for (const row of rows) {
    const entry = perCurrency.get(row.currency) ?? { total: 0, customers: new Set<string>() }
    entry.total += row.paidMinor - row.refundedMinor
    entry.customers.add(row.customer)
    perCurrency.set(row.currency, entry)
  }
  return [...perCurrency.entries()]
    .map(([currency, { total, customers }]) => ({
      currency,
      minor: customers.size === 0 ? 0 : Math.round(total / customers.size),
    }))
    .sort((a, b) => b.minor - a.minor)
}

/**
 * Supplier confirmation: share of bookings the supplier confirmed, and the
 * average hours from payment to their confirmation (confirmed ones only).
 */
export function confirmationStats(rows: readonly { paidAt: Date; confirmedAt: Date | null }[]): {
  total: number
  confirmed: number
  rate: number | null
  avgHours: number | null
} {
  let confirmed = 0
  let hours = 0
  for (const row of rows) {
    if (row.confirmedAt === null) continue
    confirmed += 1
    hours += Math.max(0, row.confirmedAt.getTime() - row.paidAt.getTime()) / 3_600_000
  }
  return {
    total: rows.length,
    confirmed,
    rate: rate(confirmed, rows.length),
    avgHours: confirmed === 0 ? null : hours / confirmed,
  }
}

/** Booking status groups shown in the reports. */
export type BookingGroup = 'confirmed' | 'pending' | 'cancelled'

export function bookingGroup(status: string): BookingGroup {
  if (status === 'confirmed' || status === 'in_progress' || status === 'completed')
    return 'confirmed'
  if (status === 'cancelled' || status === 'refunded' || status === 'failed') return 'cancelled'
  return 'pending'
}

export function countBookingGroups(statuses: readonly string[]): Record<BookingGroup, number> {
  const out: Record<BookingGroup, number> = { confirmed: 0, pending: 0, cancelled: 0 }
  for (const status of statuses) out[bookingGroup(status)] += 1
  return out
}

/** Margin = what the customer paid for the line − what we pay the supplier. */
export function margin(
  lines: readonly {
    currency: string
    revenueMinor: number
    costMinor: number | null
    costCurrency: string | null
  }[],
): { revenue: Money[]; cost: Money[]; margin: Money[]; withoutCost: number } {
  const revenue: Money[] = []
  const cost: Money[] = []
  const marginRows: Money[] = []
  let withoutCost = 0
  for (const line of lines) {
    // A cost in another currency cannot be subtracted honestly: left out.
    if (line.costMinor === null || line.costCurrency !== line.currency) {
      withoutCost += 1
      continue
    }
    revenue.push({ currency: line.currency, minor: line.revenueMinor })
    cost.push({ currency: line.currency, minor: line.costMinor })
    marginRows.push({ currency: line.currency, minor: line.revenueMinor - line.costMinor })
  }
  return {
    revenue: sumByCurrency(revenue),
    cost: sumByCurrency(cost),
    margin: sumByCurrency(marginRows),
    withoutCost,
  }
}

/** Distinct visitors who did `a`, and how many of them also did `b`. */
export function funnel(rows: readonly { visitor: string; step: 'a' | 'b' }[]): {
  a: number
  b: number
  rate: number | null
} {
  const a = new Set<string>()
  const b = new Set<string>()
  for (const row of rows) (row.step === 'a' ? a : b).add(row.visitor)
  let both = 0
  for (const visitor of b) if (a.has(visitor)) both += 1
  return { a: a.size, b: both, rate: rate(both, a.size) }
}

/** Top N by value with the rest folded into one "other" row. */
export function topWithOther<T extends { value: number }>(
  rows: readonly T[],
  n: number,
  other: (rest: readonly T[]) => T,
): T[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  if (sorted.length <= n) return sorted
  return [...sorted.slice(0, n), other(sorted.slice(n))]
}
