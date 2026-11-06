/**
 * One base currency, one exchange-rate source (owner decision, Nov 2026).
 *
 * The Saudi riyal is the single base currency: every catalog price is stored
 * and edited in SAR halalas, and every card is charged in SAR. Visitors see
 * an approximate price in their own currency, converted with the table that
 * lives in Studio → Configuration → «العملة والصرف» (`site_settings` key
 * `currencies`). Nothing else holds a rate: the old `vehicles.sarPerUsd` is
 * read only as a back-compat fallback for the USD rate, and the old
 * hard-coded fallback table is gone — the shipped defaults below are the
 * setting's own defaults.
 *
 * Rates are "units of X per 1 SAR" (USD 0.2667 ≈ 1 / 3.75). Pure and
 * client-safe: no database, no `server-only`.
 */

import { z } from 'zod'

import { minorUnitExponent } from '@/lib/money'

export const BASE_CURRENCY = 'SAR' as const
export type BaseCurrency = typeof BASE_CURRENCY

/** The official USD peg, used only when no rate has ever been set. */
export const PEG_SAR_PER_USD = 3.75

const code = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, 'Expected a three-letter ISO 4217 code'))

/**
 * The shipped table (Nov 2026, rounded). The owner edits these in Studio;
 * an optional worker job can refresh them from a free feed (off by default).
 */
export const DEFAULT_SAR_RATES: Readonly<Record<string, number>> = {
  USD: 1 / PEG_SAR_PER_USD,
  EUR: 0.2453,
  GBP: 0.208,
  EGP: 12.93,
  AED: 0.9793,
  KWD: 0.0819,
  QAR: 0.9707,
  BHD: 0.1003,
  OMR: 0.1025,
  JOD: 0.1891,
  IDR: 4347,
  TRY: 9.07,
  MYR: 1.187,
}

/** What the switcher offers by default (SAR first: it is what is charged). */
export const DEFAULT_PRESENTMENT: readonly string[] = ['SAR', ...Object.keys(DEFAULT_SAR_RATES)]

const rate = z.number().positive().finite().max(1_000_000)

export const currenciesSchema = z.object({
  /**
   * Always SAR. Kept as a field so rows written before the switch still
   * parse; whatever they stored, the base is SAR.
   */
  baseCurrency: z
    .string()
    .optional()
    .transform(() => BASE_CURRENCY),
  /** Currencies a visitor may see prices in (the switcher list). SAR is always added. */
  presentmentCurrencies: z
    .array(code)
    .min(1)
    .max(60)
    .default([...DEFAULT_PRESENTMENT]),
  /** Shown when the visitor's country is unknown or its currency is not listed. */
  defaultPresentment: code.default(BASE_CURRENCY),
  /** SAR → X. Missing codes fall back to the shipped table (and USD to the old vehicles rate). */
  rates: z.record(code, rate).optional(),
  /** Optional daily refresh from a free feed (worker). Off by default. */
  autoRefresh: z.boolean().default(false),
  /** When the table last changed, and by what. Informational. */
  ratesUpdatedAt: z.string().max(40).optional(),
  ratesSource: z.enum(['default', 'manual', 'feed']).optional(),
})
export type CurrenciesSetting = z.infer<typeof currenciesSchema>

export const CURRENCIES_DEFAULT: CurrenciesSetting = currenciesSchema.parse({})

/** The resolved table every reader uses. */
export interface FxTable {
  base: BaseCurrency
  /** Units of X per 1 SAR; always has SAR = 1. */
  rates: Record<string, number>
  /** SAR first, de-duplicated, only codes with a rate. */
  presentment: string[]
  defaultPresentment: string
  /** SAR per 1 USD (the inverse of `rates.USD`). */
  sarPerUsd: number
}

/**
 * Resolve the setting into the table everyone reads.
 *
 * `legacySarPerUsd` is the old `vehicles.sarPerUsd`; it fills the USD rate
 * only when the currencies row has never stored one.
 */
export function resolveFx(
  setting: Partial<CurrenciesSetting> | null | undefined,
  legacySarPerUsd?: number | null,
): FxTable {
  const rates: Record<string, number> = { ...DEFAULT_SAR_RATES }
  if (
    typeof legacySarPerUsd === 'number' &&
    Number.isFinite(legacySarPerUsd) &&
    legacySarPerUsd > 0
  ) {
    rates.USD = 1 / legacySarPerUsd
  }
  for (const [key, value] of Object.entries(setting?.rates ?? {})) {
    if (Number.isFinite(value) && value > 0) rates[key.toUpperCase()] = value
  }
  rates[BASE_CURRENCY] = 1

  const listed = setting?.presentmentCurrencies ?? [...DEFAULT_PRESENTMENT]
  const presentment = [
    BASE_CURRENCY,
    ...listed.map((c) => c.toUpperCase()).filter((c) => c !== BASE_CURRENCY),
  ].filter((c, i, all) => all.indexOf(c) === i && rates[c] !== undefined)

  const wanted = (setting?.defaultPresentment ?? BASE_CURRENCY).toUpperCase()
  const usd = rates.USD
  return {
    base: BASE_CURRENCY,
    rates,
    presentment,
    defaultPresentment: presentment.includes(wanted) ? wanted : BASE_CURRENCY,
    sarPerUsd: usd !== undefined && usd > 0 ? round4(1 / usd) : PEG_SAR_PER_USD,
  }
}

/** The table with no row at all (also what tests and the seed use). */
export const DEFAULT_FX: FxTable = resolveFx(CURRENCIES_DEFAULT)

/** SAR per USD to 4 decimals: 1 / 0.263158 reads as 3.8, not 3.799998. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

/**
 * SAR halalas for an amount in minor units of `from`, rounded half-up to the
 * halala. Null when there is no rate for `from`. Integer maths on a scaled
 * rate keeps 19.99 × 3.75 from picking up float noise.
 */
export function toSarMinor(
  minor: number,
  from: string,
  rates: Readonly<Record<string, number>>,
): number | null {
  const src = from.toUpperCase()
  if (src === BASE_CURRENCY) return minor
  const perSar = rates[src]
  if (perSar === undefined || !Number.isFinite(perSar) || perSar <= 0) return null
  // halalas = minor / 10^exp(src) / perSar × 100
  const sarPerUnit = 1 / perSar
  const scaled = Math.round(sarPerUnit * 1_000_000)
  const exp = minorUnitExponent(src)
  const numerator = minor * scaled * 100
  const denominator = 1_000_000 * 10 ** exp
  return Math.sign(numerator) * Math.floor((Math.abs(numerator) + denominator / 2) / denominator)
}

/** An amount in SAR halalas, in major units of `to` (approximate, for display). */
export function fromSarMinor(
  sarMinor: number,
  to: string,
  rates: Readonly<Record<string, number>>,
): number | null {
  const target = to.toUpperCase()
  const perSar = target === BASE_CURRENCY ? 1 : rates[target]
  if (perSar === undefined || !Number.isFinite(perSar) || perSar <= 0) return null
  return (sarMinor / 100) * perSar
}

/** Validates a rate table typed in Studio: positive numbers, three-letter codes. */
export function parseRateLines(lines: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const raw of lines) {
    const line = raw.trim()
    if (line === '') continue
    const match = /^([A-Za-z]{3})\s*[=:,\s]\s*([0-9]+(?:[.,][0-9]+)?)$/.exec(line)
    if (!match?.[1] || !match[2]) throw new Error(`Cannot read the rate line «${line}»`)
    const value = Number(match[2].replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Rate must be positive: «${line}»`)
    out[match[1].toUpperCase()] = value
  }
  return out
}

/** What changed between two SAR→X tables, for activity_log. */
export function rateChanges(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
): { currency: string; from: number | null; to: number | null }[] {
  const codes = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (c) => c !== BASE_CURRENCY,
  )
  return codes
    .map((currency) => ({
      currency,
      from: before[currency] ?? null,
      to: after[currency] ?? null,
    }))
    .filter((row) => row.from !== row.to && row.to !== null)
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

/** The feed refresh's guard: a move larger than this is skipped. */
const MAX_MOVE = 0.25

/** Pure: the new table from a feed payload, or null when nothing usable. */
export function mergeFeedRates(
  current: Readonly<Record<string, number>>,
  feed: unknown,
): Record<string, number> | null {
  const body = feed as { result?: string; base_code?: string; rates?: Record<string, unknown> }
  if (body?.result !== 'success' || body.base_code !== BASE_CURRENCY || !body.rates) return null
  const next: Record<string, number> = {}
  for (const [code, old] of Object.entries(current)) {
    if (code === BASE_CURRENCY) continue
    const value = body.rates[code]
    const ok =
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value > 0 &&
      Math.abs(value - old) / old <= MAX_MOVE
    next[code] = ok ? value : old
  }
  return next
}
