/**
 * Studio money: every amount in the Studio is shown in SAR (owner, Nov 2026).
 *
 * The Studio never follows the visitor's geo / switcher cookies. Amounts
 * stored in SAR are printed as they are. Amounts stored in another currency
 * (orders placed before the SAR switch, supplier costs, AI usage in USD)
 * are converted at the Studio rate (Studio → Configuration → «العملة والصرف»):
 *
 *  - a single amount: «≈ 221.25 ر.س (US$59.00)», the SAR figure first, the
 *    original kept in brackets because that is what was actually recorded;
 *  - a total over several currencies: one SAR figure, prefixed «≈» and
 *    suffixed «(converted)» whenever any part had to be converted.
 *
 * Rates: `readFx()` (fx-store) records the table it resolved here on every
 * read, so these formatters stay synchronous and drop-in for `formatMoney`.
 * Before the first read (and in tests) the shipped table applies.
 */

import { formatMoney } from '@/lib/money'

import { BASE_CURRENCY, DEFAULT_FX, toSarMinor } from './fx'

let studioRates: Readonly<Record<string, number>> = DEFAULT_FX.rates

/** Called by readFx() with the table it resolved. */
export function setStudioRates(rates: Readonly<Record<string, number>>): void {
  studioRates = rates
}

export function getStudioRates(): Readonly<Record<string, number>> {
  return studioRates
}

/** Halalas for a stored amount, or null when there is no rate for it. */
export function studioSarMinor(
  minor: number,
  currency: string | null | undefined,
  rates: Readonly<Record<string, number>> = studioRates,
): number | null {
  return toSarMinor(minor, (currency ?? BASE_CURRENCY).toUpperCase(), rates)
}

/** One stored amount, in SAR (original in brackets when it was not SAR). */
export function studioMoney(
  minor: number,
  currency: string | null | undefined,
  intl: string,
  rates: Readonly<Record<string, number>> = studioRates,
): string {
  const code = (currency ?? BASE_CURRENCY).toUpperCase()
  if (code === BASE_CURRENCY) return formatMoney(minor, BASE_CURRENCY, intl)
  const original = formatMoney(minor, code, intl)
  const sar = toSarMinor(minor, code, rates)
  if (sar === null) return original
  return `≈ ${formatMoney(sar, BASE_CURRENCY, intl)} (${original})`
}

/** Several amounts (any currencies) as one SAR total. */
export function studioTotalSar(
  list: readonly { currency: string | null | undefined; minor: number }[],
  rates: Readonly<Record<string, number>> = studioRates,
): { minor: number; converted: boolean; unconvertible: { currency: string; minor: number }[] } {
  let minor = 0
  let converted = false
  const unconvertible: { currency: string; minor: number }[] = []
  for (const item of list) {
    const code = (item.currency ?? BASE_CURRENCY).toUpperCase()
    if (code === BASE_CURRENCY) {
      minor += item.minor
      continue
    }
    const sar = toSarMinor(item.minor, code, rates)
    if (sar === null) {
      unconvertible.push({ currency: code, minor: item.minor })
      continue
    }
    minor += sar
    if (item.minor !== 0) converted = true
  }
  return { minor, converted, unconvertible }
}

/** The text of a SAR total, labelled when part of it was converted. */
export function studioTotal(
  list: readonly { currency: string | null | undefined; minor: number }[],
  intl: string,
  rates: Readonly<Record<string, number>> = studioRates,
  /** `short`: only the «≈» prefix (where the label is explained next to it). */
  options: { short?: boolean } = {},
): string {
  if (list.length === 0) return '—'
  const total = studioTotalSar(list, rates)
  const sar = formatMoney(total.minor, BASE_CURRENCY, intl)
  const head = total.converted ? (options.short ? `≈ ${sar}` : `≈ ${sar} (converted)`) : sar
  const rest = total.unconvertible.map((m) => formatMoney(m.minor, m.currency, intl))
  return [head, ...rest].join(' · ')
}
