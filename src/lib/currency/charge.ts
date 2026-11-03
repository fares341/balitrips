/**
 * Charge currency — what the card is actually debited in.
 *
 * The payment gateway settles in Saudi riyals only. Catalog prices keep their
 * own currency (mostly USD cents), and the visitor still SEES an approximate
 * price in their country's currency; only the charge is converted, once, at
 * checkout, with the Studio rate (Studio → Packages → Vehicles → "SAR per
 * USD", default 3.75 — the official peg).
 *
 * Rounding: half-up to the nearest halala (SAR has 2 decimals for Stripe), so
 * the charge never differs from the exact product by more than 0.005 SAR.
 * The result is frozen on the order (settlement_* + exchange_rate) so later
 * refunds use the same rate even if Studio changes it.
 */

export const CHARGE_CURRENCY = 'SAR' as const
export const DEFAULT_SAR_PER_USD = 3.75

export class ChargeCurrencyError extends Error {
  constructor(currency: string) {
    super(`Cannot convert ${currency} to ${CHARGE_CURRENCY} for charging`)
    this.name = 'ChargeCurrencyError'
  }
}

export type Charge = {
  currency: typeof CHARGE_CURRENCY
  amountMinor: number
  /** SAR per one unit of the source currency, as stored on the order. */
  rate: string
}

/** Validated SAR-per-USD rate; falls back to the peg on anything unusable. */
export function sarRate(sarPerUsd: number | null | undefined): number {
  return typeof sarPerUsd === 'number' && Number.isFinite(sarPerUsd) && sarPerUsd > 0
    ? sarPerUsd
    : DEFAULT_SAR_PER_USD
}

/**
 * Converts an amount in minor units of `currency` to SAR halalas.
 * USD and SAR are the only catalog currencies; anything else is refused
 * rather than charged at a guessed rate.
 */
export function toChargeMinor(amountMinor: number, currency: string, sarPerUsd: number): Charge {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError(`amountMinor must be a non-negative integer (got ${amountMinor})`)
  }
  const code = currency.toUpperCase()
  if (code === CHARGE_CURRENCY) return { currency: CHARGE_CURRENCY, amountMinor, rate: '1' }
  if (code === 'USD') {
    const rate = sarRate(sarPerUsd)
    // Both currencies have 2 decimals, so cents × rate = halalas. Round via
    // an integer-scaled product to dodge float noise (3.75 × 1999 etc.).
    const scaled = Math.round(rate * 1_000_000)
    const halalas = Math.floor((amountMinor * scaled + 500_000) / 1_000_000)
    return { currency: CHARGE_CURRENCY, amountMinor: halalas, rate: String(rate) }
  }
  throw new ChargeCurrencyError(code)
}

/**
 * The charge-currency share of a refund given in the order's own currency.
 *
 * Computed as the difference of cumulative conversions, so refunding an order
 * in several parts returns exactly what was charged — never a halala more or
 * less in total — whatever the split.
 */
export function refundChargeMinor(input: {
  alreadyRefundedMinor: number
  amountMinor: number
  orderTotalMinor: number
  chargedTotalMinor: number
}): number {
  const { alreadyRefundedMinor, amountMinor, orderTotalMinor, chargedTotalMinor } = input
  if (orderTotalMinor <= 0) return 0
  const share = (refunded: number) =>
    refunded >= orderTotalMinor
      ? chargedTotalMinor
      : Math.round((refunded * chargedTotalMinor) / orderTotalMinor)
  return share(alreadyRefundedMinor + amountMinor) - share(alreadyRefundedMinor)
}

/**
 * What an order was (or will be) charged: the frozen SAR settlement, or — for
 * orders placed before the SAR switch — its own total and currency.
 */
export function chargedOf(order: {
  totalMinor: number
  presentmentCurrency: string
  settlementTotalMinor: number | null
  settlementCurrency: string | null
}): { amountMinor: number; currency: string } {
  return order.settlementTotalMinor !== null && order.settlementCurrency
    ? { amountMinor: order.settlementTotalMinor, currency: order.settlementCurrency }
    : { amountMinor: order.totalMinor, currency: order.presentmentCurrency }
}
