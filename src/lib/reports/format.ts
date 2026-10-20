import { formatMoney } from '@/lib/money'

import { amountIn } from './metrics'
import { pctChange } from './period'
import type { Kpi } from './types'

/**
 * Turning KPI values into text — shared by the Studio cards, CSV, PDF and
 * email so they never disagree.
 */

export function kpiText(kpi: Kpi, intl: string, hoursLabel = 'h'): string[] {
  const v = kpi.value
  switch (v.kind) {
    case 'money':
      return v.money.length === 0
        ? ['—']
        : v.money.map((m) => formatMoney(m.minor, m.currency, intl))
    case 'percent':
      return [
        v.value === null
          ? '—'
          : `${new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(v.value)}%`,
      ]
    case 'hours':
      return [
        v.value === null
          ? '—'
          : `${new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(v.value)} ${hoursLabel}`,
      ]
    case 'count':
      return [v.value === null ? '—' : new Intl.NumberFormat(intl).format(v.value)]
    case 'unavailable':
      return [v.reason]
  }
}

export interface Change {
  /** Percentage change, null when it cannot be computed ("new"). */
  pct: number | null
  /** There is a comparison at all. */
  compared: boolean
  /** up | down | flat — the direction of the number. */
  direction: 'up' | 'down' | 'flat'
  /** Good news for this metric (taking lowerIsBetter into account). */
  good: boolean | null
}

/** The comparison of a KPI with its previous period (money: in its main currency). */
export function kpiChange(kpi: Kpi): Change {
  const v = kpi.value
  let current: number | null = null
  let previous: number | null = null
  if (v.kind === 'money') {
    if (v.prev === null) return { pct: null, compared: false, direction: 'flat', good: null }
    const currency = v.money[0]?.currency ?? v.prev[0]?.currency
    if (!currency) return { pct: null, compared: false, direction: 'flat', good: null }
    current = amountIn(v.money, currency)
    previous = amountIn(v.prev, currency)
  } else if (v.kind === 'unavailable') {
    return { pct: null, compared: false, direction: 'flat', good: null }
  } else {
    if (v.prev === null || v.value === null) {
      return { pct: null, compared: false, direction: 'flat', good: null }
    }
    current = v.value
    previous = v.prev
  }
  // Nothing then and nothing now: no comparison worth showing.
  if (current === 0 && previous === 0) {
    return { pct: null, compared: false, direction: 'flat', good: null }
  }
  const pct = v.kind === 'percent' ? current - previous : pctChange(current, previous)
  const delta = current - previous
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const good = direction === 'flat' ? null : (direction === 'up') !== (kpi.lowerIsBetter === true)
  return { pct, compared: true, direction, good }
}

/** "+12.5%", "−3%", "new", "0%"; for percent KPIs the change is in points ("+2.1 pt"). */
export function changeText(
  kpi: Kpi,
  change: Change,
  intl: string,
  labels: { newLabel: string; points: string },
): string {
  if (!change.compared) return ''
  if (change.pct === null) return labels.newLabel
  const sign = change.pct > 0 ? '+' : change.pct < 0 ? '−' : ''
  const value = new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(
    Math.abs(change.pct),
  )
  return kpi.value.kind === 'percent' ? `${sign}${value} ${labels.points}` : `${sign}${value}%`
}

/** Previous value as text (for CSV / tooltips). */
export function prevText(kpi: Kpi, intl: string): string {
  const v = kpi.value
  if (v.kind === 'money') {
    return v.prev === null
      ? ''
      : v.prev.length === 0
        ? '—'
        : v.prev.map((m) => formatMoney(m.minor, m.currency, intl)).join(' · ')
  }
  if (v.kind === 'unavailable' || v.prev === null) return ''
  return kpiText({ ...kpi, value: { ...v, value: v.prev } }, intl).join(' ')
}
