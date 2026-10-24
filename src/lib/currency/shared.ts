/**
 * Display currencies — client-safe helpers.
 *
 * Purely informational: every charge stays in the order's own currency
 * (USD, Stripe, manual capture). Nothing here touches the pricing path.
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

/** ISO 3166-1 alpha-2 → display currency; USD for anything unmapped. */
export function currencyForCountry(country: string | null | undefined): DisplayCurrency {
  if (!country) return 'USD'
  return COUNTRY_CURRENCY[country.trim().toUpperCase()] ?? 'USD'
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
