/**
 * What a package costs us — pure, for Studio (phase 3).
 *
 * A paid package becomes one booking per activity (`./children`), each given
 * to its supplier by the phase 2 rules with no service level (`tierId` null)
 * and priced per person. This module runs the same choice (`pickOffer`) ahead
 * of time, so the owner sees the cost and the margin of a package before
 * selling it. It is an estimate: the real cost is frozen on each booking when
 * it is paid, and staff may change the supplier afterwards.
 */

import { lineCostMinor, pickOffer, type OfferFacts } from '@/lib/suppliers/assign'

export interface PackageCostLine {
  activityId: string
  /** Null when no active supplier offer can run it. */
  offerId: string | null
  supplierId: string | null
  costMinor: number | null
  currency: string | null
}

export interface PackageCost {
  lines: PackageCostLine[]
  /** Sum of the lines in the package's currency; null when any is missing or in another currency. */
  totalMinor: number | null
  missing: number
  /** Price charged for this party, in the package currency. */
  priceMinor: number
  /** price − cost, null when the cost is incomplete. */
  marginMinor: number | null
  /** Margin as basis points of the price (10000 = 100 %). */
  marginBps: number | null
}

export function packageCost(input: {
  activityIds: readonly string[]
  offersByActivity: ReadonlyMap<string, readonly OfferFacts[]>
  guests: number
  currency: string
  priceMinor: number
  pricingMode: 'flat' | 'per_guest'
  now: Date
}): PackageCost {
  const guests = Math.max(1, Math.trunc(input.guests))
  const lines: PackageCostLine[] = input.activityIds.map((activityId) => {
    const offer = pickOffer(
      input.offersByActivity.get(activityId) ?? [],
      { tierId: null, travelDate: null, travelTime: null },
      input.now,
    )
    if (offer === null) {
      return { activityId, offerId: null, supplierId: null, costMinor: null, currency: null }
    }
    return {
      activityId,
      offerId: offer.id,
      supplierId: offer.supplierId,
      costMinor: lineCostMinor(offer, 'per_person', guests, guests),
      currency: offer.currency,
    }
  })
  const missing = lines.filter((line) => line.costMinor === null).length
  const comparable = lines.every(
    (line) => line.costMinor !== null && line.currency === input.currency,
  )
  const totalMinor = comparable ? lines.reduce((sum, line) => sum + (line.costMinor ?? 0), 0) : null
  const priceMinor =
    input.pricingMode === 'per_guest' ? input.priceMinor * guests : input.priceMinor
  const marginMinor = totalMinor === null ? null : priceMinor - totalMinor
  return {
    lines,
    totalMinor,
    missing,
    priceMinor,
    marginMinor,
    marginBps:
      marginMinor === null || priceMinor <= 0
        ? null
        : Math.round((marginMinor / priceMinor) * 10_000),
  }
}
