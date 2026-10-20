/**
 * The shape every report is built into — one structure, four outputs: the
 * Studio page, the CSV file, the PDF and the scheduled email all render it.
 *
 * Strings are already translated by the builder (with the Studio
 * translator); `href`s are Studio paths without the admin base (the page
 * adds it, the email makes it absolute).
 */

import type { Money } from './metrics'

export type KpiValue =
  | { kind: 'money'; money: Money[]; prev: Money[] | null }
  | { kind: 'count' | 'percent' | 'hours'; value: number | null; prev: number | null }
  /** A source that is not connected yet: shown as such, never as a fake 0. */
  | { kind: 'unavailable'; reason: string }

export interface Kpi {
  id: string
  label: string
  /** Exact definition, shown in the info tip and the footnotes. */
  definition: string
  value: KpiValue
  /** Underlying records (Studio path). */
  href?: string
  /** For a number where up is bad (refunds, failed payments). */
  lowerIsBetter?: boolean
  /** Shown under the number, e.g. "now" for snapshot figures. */
  note?: string
}

export interface LineChartBlock {
  kind: 'line'
  id: string
  title: string
  definition: string
  /** Bucket labels shown on the x axis. */
  labels: string[]
  current: number[]
  previous: number[] | null
  currentLabel: string
  previousLabel: string
  /** money: values are minor units of `currency`. */
  unit: 'money' | 'count'
  currency?: string
}

export interface BarChartBlock {
  kind: 'bar'
  id: string
  title: string
  definition: string
  rows: {
    label: string
    value: number
    display: string
    href?: string
    tone?: 'good' | 'warn' | 'bad' | 'info'
  }[]
}

export interface Cell {
  text: string
  /** Raw value for CSV/sorting (number or plain string). */
  raw?: string | number | null
  href?: string
}

export interface TableBlock {
  kind: 'table'
  id: string
  title: string
  definition?: string
  columns: { key: string; label: string; num?: boolean }[]
  rows: Record<string, Cell>[]
  empty: string
}

export type Block = LineChartBlock | BarChartBlock | TableBlock

export interface ReportResult {
  id: string
  title: string
  description: string
  kpis: Kpi[]
  blocks: Block[]
  /** Extra footnotes (sources, consent caveats). */
  notes: string[]
}
