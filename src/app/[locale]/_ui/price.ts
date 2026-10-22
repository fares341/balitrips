/**
 * Price helpers for headline prices ("From $29").
 *
 * `formatMoney` always prints the minor digits, which is right on an invoice
 * and noisy in a headline: "$29.00" reads as more expensive than "$29". These
 * drop them only when they are zero, so "$29.50" still shows its cents.
 */

import { minorUnitExponent, moneyLocale } from '@/lib/money'

/** Arabic is the only right-to-left locale; mirrors the private check in money.ts. */
function isRtlLocale(locale: string): boolean {
  return locale === 'ar' || locale.startsWith('ar-')
}

export interface PricePoint {
  priceMinor: number
  currency: string
}

export function formatPrice(minor: number, currency: string, locale: string): string {
  const exponent = minorUnitExponent(currency)
  const whole = minor % 10 ** exponent === 0
  const text = new Intl.NumberFormat(moneyLocale(locale, currency), {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : exponent,
    maximumFractionDigits: whole ? 0 : exponent,
  }).format(minor / 10 ** exponent)
  // Same bidi isolation as formatMoney: keeps "US$ 29" in one piece in Arabic.
  return isRtlLocale(locale) ? `⁦${text}⁩` : text
}

/**
 * The cheapest paid price in a list, or null.
 *
 * Prices in different currencies cannot be compared without a rate, so only
 * items in the first item's currency compete; a zero price (free) is not a
 * "from" price.
 */
export function cheapest(items: readonly PricePoint[]): PricePoint | null {
  const paid = items.filter((item) => item.priceMinor > 0)
  const currency = paid[0]?.currency
  if (currency === undefined) return null
  let best: PricePoint | null = null
  for (const item of paid) {
    if (item.currency !== currency) continue
    if (best === null || item.priceMinor < best.priceMinor) best = item
  }
  return best
}
