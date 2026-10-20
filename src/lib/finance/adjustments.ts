import type { Localized, OrderAdjustmentLine } from '@/db/schema'

/**
 * Between subtotal and total: discount, fees, tax.
 *
 * Pure and server-only in effect — the cart, checkout and the order all take
 * their numbers from `computeTotals`, so the amount shown, the amount charged
 * and the amount on the invoice cannot disagree.
 *
 * Order of operations (each step on whole minor units, percentages rounded
 * half up):
 *
 *   base       = subtotal − discount
 *   service    = base × serviceFee%
 *   booking    = flat booking fee (only when the order is in the fee currency)
 *   tax        = (base + service + booking) × tax%
 *   surcharge  = (base + service + booking + tax) × payment surcharge%
 *   total      = base + service + booking + tax + surcharge
 *
 * Fees and tax are OFF unless the owner switches them on in Studio →
 * Configuration (`enabled`, `taxEnabled`), so a fresh install and every
 * install that never touched them charge exactly the subtotal, as before.
 */

export interface FeeSchedule {
  /** Master switch for the three fees. Default off. */
  enabled: boolean
  serviceFeeBps: number
  bookingFeeMinor: number
  paymentSurchargeBps: number
  feeCurrency: string
  /** Tax switch. Default off. */
  taxEnabled: boolean
  taxRateBps: number
  taxLabel: Partial<Localized> | null
}

export const FEES_OFF: FeeSchedule = {
  enabled: false,
  serviceFeeBps: 0,
  bookingFeeMinor: 0,
  paymentSurchargeBps: 0,
  feeCurrency: 'USD',
  taxEnabled: false,
  taxRateBps: 0,
  taxLabel: null,
}

export interface PricedTotals {
  subtotalMinor: number
  discountMinor: number
  feesMinor: number
  taxMinor: number
  totalMinor: number
  /** Only the lines that are not zero, in the order above. */
  lines: OrderAdjustmentLine[]
}

/** `amount × bps / 10 000`, rounded half up, exact for any safe integer amount. */
export function percentOf(amountMinor: number, bps: number): number {
  if (amountMinor <= 0 || bps <= 0) return 0
  const scaled = BigInt(Math.trunc(amountMinor)) * BigInt(Math.trunc(bps)) + 5_000n
  return Number(scaled / 10_000n)
}

export function computeTotals(
  subtotalMinor: number,
  currency: string,
  discount: { amountMinor: number; code: string } | null,
  schedule: FeeSchedule = FEES_OFF,
): PricedTotals {
  const lines: OrderAdjustmentLine[] = []
  const discountMinor =
    discount === null ? 0 : Math.max(0, Math.min(Math.trunc(discount.amountMinor), subtotalMinor))
  if (discount !== null && discountMinor > 0) {
    lines.push({ kind: 'discount', amountMinor: discountMinor, code: discount.code })
  }
  const base = subtotalMinor - discountMinor

  let feesMinor = 0
  let taxMinor = 0
  // Nothing to charge for (a free cart, a 100% code): no fees, no tax.
  if (base > 0) {
    if (schedule.enabled) {
      const service = percentOf(base, schedule.serviceFeeBps)
      if (service > 0) {
        lines.push({ kind: 'service_fee', amountMinor: service, bps: schedule.serviceFeeBps })
      }
      // A flat fee is money in one currency; it is not converted.
      const booking =
        schedule.feeCurrency === currency ? Math.max(0, Math.trunc(schedule.bookingFeeMinor)) : 0
      if (booking > 0) lines.push({ kind: 'booking_fee', amountMinor: booking })
      feesMinor = service + booking
    }
    if (schedule.taxEnabled) {
      taxMinor = percentOf(base + feesMinor, schedule.taxRateBps)
      if (taxMinor > 0) {
        lines.push({
          kind: 'tax',
          amountMinor: taxMinor,
          bps: schedule.taxRateBps,
          label: schedule.taxLabel,
        })
      }
    }
    if (schedule.enabled) {
      const surcharge = percentOf(base + feesMinor + taxMinor, schedule.paymentSurchargeBps)
      if (surcharge > 0) {
        lines.push({ kind: 'surcharge', amountMinor: surcharge, bps: schedule.paymentSurchargeBps })
        feesMinor += surcharge
      }
    }
  }

  return {
    subtotalMinor,
    discountMinor,
    feesMinor,
    taxMinor,
    totalMinor: base + feesMinor + taxMinor,
    lines,
  }
}

/**
 * How much of what was charged belongs to each order line, for refunds.
 *
 * A line's refundable amount is its share of the order total — after the
 * discount and with its part of fees and tax — so refunding every line in
 * full gives back exactly the total, never more and never less. With no
 * discount, fee or tax the share is the line total itself, as before.
 */
export function lineRefundCaps(
  lineTotals: readonly number[],
  subtotalMinor: number,
  totalMinor: number,
  allocate: (total: number, weights: readonly number[]) => number[],
): number[] {
  if (totalMinor === subtotalMinor) return [...lineTotals]
  return allocate(totalMinor, lineTotals)
}

/**
 * `lineRefundCaps` keyed by order line id, independent of the order the lines
 * were read in (they are allocated in id order), so the order page and the
 * refund action always agree to the last minor unit.
 */
export function refundCapsById(
  lines: readonly { id: string; lineTotalMinor: number }[],
  subtotalMinor: number,
  totalMinor: number,
  allocate: (total: number, weights: readonly number[]) => number[],
): Map<string, number> {
  const sorted = [...lines].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const caps = lineRefundCaps(
    sorted.map((line) => line.lineTotalMinor),
    subtotalMinor,
    totalMinor,
    allocate,
  )
  return new Map(sorted.map((line, index) => [line.id, caps[index] ?? line.lineTotalMinor]))
}
