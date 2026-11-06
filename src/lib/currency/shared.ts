/**
 * Display currencies — client-safe helpers.
 *
 * Purely informational: catalog prices are SAR and every charge is SAR (see
 * ./fx.ts and ./charge.ts). A visitor's own currency is an approximation,
 * marked «≈», converted with the Studio table passed in as `rates`
 * (units of X per 1 SAR). There is no hard-coded rate table any more.
 */

import { minorUnitExponent } from '@/lib/money'

import { BASE_CURRENCY, DEFAULT_FX, fromSarMinor, toSarMinor } from './fx'
import { formatMoneyText } from './money-format'

/** Any ISO 4217 code the Studio list offers. */
export type DisplayCurrency = string

/** The switcher's choice (wins over detection). */
export const CURRENCY_COOKIE = 'bt_currency'
/** What the proxy detected from the visitor's country (informational, not HttpOnly). */
export const GEO_CURRENCY_COOKIE = 'bt_cur_geo'

/** The shipped presentment list (Studio may add or remove codes). */
export const DISPLAY_CURRENCIES: readonly string[] = DEFAULT_FX.presentment

export function isDisplayCurrency(
  value: unknown,
  supported: readonly string[] = DISPLAY_CURRENCIES,
): value is DisplayCurrency {
  return typeof value === 'string' && supported.includes(value.toUpperCase())
}

const EURO_COUNTRIES = [
  'AT',
  'BE',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
]

const COUNTRY_CURRENCY: Record<string, string> = {
  SA: 'SAR',
  AE: 'AED',
  KW: 'KWD',
  QA: 'QAR',
  BH: 'BHD',
  OM: 'OMR',
  EG: 'EGP',
  JO: 'JOD',
  GB: 'GBP',
  ID: 'IDR',
  MY: 'MYR',
  SG: 'SGD',
  AU: 'AUD',
  CA: 'CAD',
  IN: 'INR',
  TR: 'TRY',
  JP: 'JPY',
  CN: 'CNY',
  US: 'USD',
  ...Object.fromEntries(EURO_COUNTRIES.map((c) => [c, 'EUR'])),
}

/** Unknown or unmapped visitors see the riyal — also what every card is charged in. */
export const DEFAULT_DISPLAY_CURRENCY: DisplayCurrency = BASE_CURRENCY

/**
 * ISO 3166-1 alpha-2 → display currency. SAR for an unknown country, and SAR
 * when the country's currency is not in the Studio list (`supported`).
 */
export function currencyForCountry(
  country: string | null | undefined,
  supported: readonly string[] = DISPLAY_CURRENCIES,
): DisplayCurrency {
  if (!country) return DEFAULT_DISPLAY_CURRENCY
  const mapped = COUNTRY_CURRENCY[country.trim().toUpperCase()]
  return mapped !== undefined && supported.includes(mapped) ? mapped : DEFAULT_DISPLAY_CURRENCY
}

/**
 * A stored amount (minor units of `from`, normally SAR) in major units of
 * `to`, through the SAR table. Null when either side has no rate.
 */
export function convertMinor(
  minor: number,
  from: string,
  to: DisplayCurrency,
  rates: Readonly<Record<string, number>>,
): number | null {
  const src = from.toUpperCase()
  if (src === to.toUpperCase()) return minor / 10 ** minorUnitExponent(src)
  const sar = toSarMinor(minor, src, rates)
  return sar === null ? null : fromSarMinor(sar, to, rates)
}

/** Intl locale for a display price: Arabic keeps the riyal sign but Latin digits. */
export function displayLocale(locale: string): string {
  if (locale === 'ar' || locale.startsWith('ar-')) return 'ar-SA-u-nu-latn'
  if (locale === 'id' || locale.startsWith('id-')) return 'id-ID'
  return 'en-US'
}

/** Headline price: "375 ر.س", "Rp 1.630.000", "$100" (rounded per currency). */
export function formatDisplay(amount: number, currency: DisplayCurrency, locale: string): string {
  return formatMoneyText(amount, currency, locale)
}

/**
 * Stored amount → display string in `to`; «≈ » in front when `to` is not
 * SAR (an approximation). Falls back to SAR when there is no rate.
 */
export function formatInCurrency(
  minor: number,
  from: string,
  to: DisplayCurrency,
  locale: string,
  rates: Readonly<Record<string, number>> = DEFAULT_FX.rates,
): string {
  const target = to.toUpperCase()
  const amount = convertMinor(minor, from, target, rates)
  if (amount === null) {
    const sar = toSarMinor(minor, from, rates)
    return formatDisplay((sar ?? minor) / 100, BASE_CURRENCY, locale)
  }
  const text = formatDisplay(amount, target, locale)
  return target === BASE_CURRENCY ? text : `≈ ${text}`
}

/** The SAR text for a stored amount (what the server renders, and what is charged). */
export function formatSar(
  minor: number,
  from: string,
  locale: string,
  rates: Readonly<Record<string, number>> = DEFAULT_FX.rates,
): string {
  return formatInCurrency(minor, from, BASE_CURRENCY, locale, rates)
}
