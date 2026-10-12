/**
 * Money.
 *
 * Every amount in this system is an integer count of minor units plus an
 * ISO 4217 code. There are no floats anywhere in the pricing path, and
 * there is no implied currency.
 */

/**
 * Minor-unit exponent by currency. Most are 2, but not all — assuming 100
 * silently multiplies a Kuwaiti dinar by 10 and divides a yen by 100.
 */
const ZERO_DECIMAL = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'])

export function minorUnitExponent(currency: string): number {
  const code = currency.toUpperCase()
  if (ZERO_DECIMAL.has(code)) return 0
  if (THREE_DECIMAL.has(code)) return 3
  return 2
}

/** Format for display, localized. Never hard-code a symbol. */
export function formatMoney(minor: number, currency: string, locale: string): string {
  const exponent = minorUnitExponent(currency)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(minor / 10 ** exponent)
}

/**
 * Sum line totals.
 *
 * Sums minor units directly. Never round per line and then add — that
 * accumulates error across a multi-item cart.
 */
export function sumMinor(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0)
}

export function lineTotalMinor(unitPriceMinor: number, quantity: number): number {
  if (!Number.isInteger(unitPriceMinor)) {
    throw new Error(`unitPriceMinor must be an integer, got ${unitPriceMinor}`)
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error(`quantity must be a non-negative integer, got ${quantity}`)
  }
  return unitPriceMinor * quantity
}

/**
 * Split an amount across n parts without losing or inventing minor units.
 * Used for proportional partial refunds.
 */
export function allocateMinor(totalMinor: number, weights: readonly number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0)
  if (weightSum === 0) return weights.map(() => 0)

  const raw = weights.map((w) => (totalMinor * w) / weightSum)
  const floored = raw.map(Math.floor)
  let remainder = totalMinor - floored.reduce((a, b) => a + b, 0)

  // Hand the leftover units to the largest fractional parts, so the
  // allocation always sums back to exactly totalMinor.
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac)

  const result = [...floored]
  for (const { index } of order) {
    if (remainder <= 0) break
    result[index] = (result[index] ?? 0) + 1
    remainder--
  }
  return result
}
