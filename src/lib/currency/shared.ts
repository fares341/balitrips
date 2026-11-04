/**
 * Display currencies — client-safe helpers.
 *
 * Purely informational: every charge is made in SAR (see ./charge.ts), at
 * the Studio rate frozen on the order. Nothing here touches the pricing path.
 */

export const DISPLAY_CURRENCIES = [
  'USD',
  'SAR',
  'AED',
  'KWD',
  'QAR',
  'BHD',
  'OMR',
  'EGP',
  'JOD',
  'EUR',
  'GBP',
  'IDR',
  'MYR',
  'SGD',
  'AUD',
  'CAD',
  'INR',
  'TRY',
  'JPY',
  'CNY',
] as const

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]

export const CURRENCY_COOKIE = 'bt_currency'

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return typeof value === 'string' && (DISPLAY_CURRENCIES as readonly string[]).includes(value)
}

/** Units of each currency per 1 USD. Fallback when the live feed is down. */
export const FALLBACK_RATES: Record<DisplayCurrency, number> = {
  USD: 1,
  SAR: 3.75,
  AED: 3.6725,
  KWD: 0.307,
  QAR: 3.64,
  BHD: 0.376,
  OMR: 0.3845,
  EGP: 48.5,
  JOD: 0.709,
  EUR: 0.92,
  GBP: 0.78,
  IDR: 16300,
  MYR: 4.45,
  SGD: 1.34,
  AUD: 1.52,
  CAD: 1.37,
  INR: 84,
  TRY: 34,
  JPY: 150,
  CNY: 7.2,
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

const COUNTRY_CURRENCY: Record<string, DisplayCurrency> = {
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
  ...Object.fromEntries(EURO_COUNTRIES.map((c) => [c, 'EUR' as const])),
}

/**
 * Shown when the visitor's country is unknown or unmapped: the riyal, which
 * is also the currency every card is charged in.
 */
export const DEFAULT_DISPLAY_CURRENCY: DisplayCurrency = 'SAR'

/** ISO 3166-1 alpha-2 → display currency; SAR for anything unknown or unmapped. */
export function currencyForCountry(country: string | null | undefined): DisplayCurrency {
  if (!country) return DEFAULT_DISPLAY_CURRENCY
  return COUNTRY_CURRENCY[country.trim().toUpperCase()] ?? DEFAULT_DISPLAY_CURRENCY
}

/** Approximate amount in `currency` for a USD amount in minor units. */
export function convertUsdMinor(
  usdMinor: number,
  currency: DisplayCurrency,
  rates: Partial<Record<string, number>>,
): number | null {
  const rate = rates[currency] ?? FALLBACK_RATES[currency]
  if (!Number.isFinite(rate) || rate <= 0) return null
  return (usdMinor / 100) * rate
}

/** "≈ 375 ر.س" style: rounded, no decimals for amounts ≥ 100. */
export function formatApprox(amount: number, currency: DisplayCurrency, locale: string): string {
  const digits = amount >= 100 ? 0 : 2
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(amount)
}

/** Minor-unit exponent of a stored (catalogue) currency. */
function storedExponent(currency: string): number {
  const c = currency.toUpperCase()
  if (c === 'KWD' || c === 'BHD' || c === 'OMR' || c === 'JOD') return 3
  if (c === 'JPY' || c === 'IDR') return 0
  return 2
}

/**
 * Convert a stored amount (minor units of `from`, normally USD) into
 * `to`, through the USD rate table. Null when either rate is unknown.
 */
export function convertMinor(
  minor: number,
  from: string,
  to: DisplayCurrency,
  rates: Partial<Record<string, number>>,
): number | null {
  const src = from.toUpperCase()
  const major = minor / 10 ** storedExponent(src)
  if (src === to) return major
  const rateFrom =
    src === 'USD' ? 1 : (rates[src] ?? (isDisplayCurrency(src) ? FALLBACK_RATES[src] : undefined))
  const rateTo = rates[to] ?? FALLBACK_RATES[to]
  if (!rateFrom || !rateTo || !Number.isFinite(rateFrom) || !Number.isFinite(rateTo)) return null
  return (major / rateFrom) * rateTo
}

/** Currencies whose small units are never shown on a price. */
const NO_DECIMALS = new Set<DisplayCurrency>(['IDR', 'JPY', 'EGP', 'INR', 'TRY', 'CNY'])

/**
 * Round a converted display price sensibly for its currency: whole units for
 * big-number currencies (IDR to the nearest 1,000), and no decimals once the
 * amount reaches 100 in any currency.
 */
export function roundDisplay(amount: number, currency: DisplayCurrency): number {
  if (currency === 'IDR')
    return amount >= 10_000 ? Math.round(amount / 1000) * 1000 : Math.round(amount)
  if (NO_DECIMALS.has(currency) || amount >= 100) return Math.round(amount)
  return Math.round(amount * 100) / 100
}

/** Intl locale for a display price: Arabic keeps the riyal sign but Latin digits. */
export function displayLocale(locale: string): string {
  if (locale === 'ar' || locale.startsWith('ar-')) return 'ar-SA-u-nu-latn'
  if (locale === 'id' || locale.startsWith('id-')) return 'id-ID'
  return 'en-US'
}

/** Headline price in the visitor's currency: "375 ر.س", "Rp 1.630.000", "$100". */
export function formatDisplay(amount: number, currency: DisplayCurrency, locale: string): string {
  const value = roundDisplay(amount, currency)
  const whole = Number.isInteger(value)
  return new Intl.NumberFormat(displayLocale(locale), {
    style: 'currency',
    currency,
    currencyDisplay: currency === 'USD' && !locale.startsWith('en') ? 'symbol' : 'narrowSymbol',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(value)
}

/** Stored amount → display string in `to` (SAR on the server, before detection). */
export function formatInCurrency(
  minor: number,
  from: string,
  to: DisplayCurrency,
  locale: string,
  rates: Partial<Record<string, number>> = FALLBACK_RATES,
): string {
  const amount = convertMinor(minor, from, to, rates)
  if (amount === null) return formatDisplay(minor / 10 ** storedExponent(from), 'SAR', locale)
  return formatDisplay(amount, to, locale)
}
