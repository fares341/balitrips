/**
 * The «from» price of an activity: which package heads its cards, the booking
 * box and the structured data (pure, no I/O).
 *
 * One rule, used everywhere a «from» price is printed:
 *
 *  1. only packages a visitor can buy count: available, priced above zero and
 *     in the activity's currency;
 *  2. packages sold to a restricted audience (a resident / domestic ticket, a
 *     companion or lounge pass for people who do not take part) never set the
 *     headline while another package exists — a tourist cannot buy them, so
 *     «from 10» would be bait pricing;
 *  3. the cheapest of the rest wins; on a tie the package flagged «popular»,
 *     then the owner's order.
 *
 * The price always travels with its unit (per person, per couple, per group,
 * per booking), so a card can never print «/ person» beside a couples price.
 *
 * An activity with packages but none to sell has no «from» price at all
 * (`null`): pages show «price on request», never a zero.
 */

import type { PackagePricing } from '@/lib/booking/price'

export interface FromPriceTier {
  /** Stable key of the package (`foreign-ticket`, `lounge-pass`…). */
  key: string
  /** English name, when there is one: read with the key for the audience. */
  nameEn?: string | null
  priceMinor: number
  currency: string
  pricing: PackagePricing
  groupMax: number | null
  available: boolean
  isPopular: boolean
  sortOrder: number
}

export interface FromPrice {
  priceMinor: number
  currency: string
  pricing: PackagePricing
  /** People one group price covers (per-group packages); null = not set. */
  groupMax: number | null
  /** Key of the package the price comes from; null = the activity's own price. */
  tierKey: string | null
}

/**
 * Words that mark a package as sold to a restricted audience. Matched on
 * whole words of the package key and its English name (`indonesian-ticket`,
 * «Entrance Ticket – Indonesian», `lounge-pass`).
 */
const RESTRICTED_WORDS = [
  // Residents / citizens: an ID or a residence permit is asked for at the gate.
  'indonesian',
  'indonesia',
  'domestic',
  'domestik',
  'resident',
  'residents',
  'local',
  'locals',
  'lokal',
  'kitas',
  'kitap',
  'wni',
  'ktp',
  // People who come along without taking part.
  'lounge',
  'companion',
  'companions',
  'spectator',
  'spectators',
  'observer',
  'observers',
  'chaperone',
  'pendamping',
]

const RESTRICTED = new RegExp(`(^|[^a-z])(${RESTRICTED_WORDS.join('|')})([^a-z]|$)`)

/** A package a normal visitor cannot buy for themselves (resident, companion pass). */
export function isRestrictedAudience(tier: Pick<FromPriceTier, 'key' | 'nameEn'>): boolean {
  const text = `${tier.key} ${tier.nameEn ?? ''}`.toLowerCase()
  // «Non-participant» reads as two words after the split on the hyphen.
  return RESTRICTED.test(text) || /non[\s-]?participant/.test(text)
}

/** A package that can be bought: on sale, priced, in the activity's currency. */
export function isSellable(
  tier: Pick<FromPriceTier, 'available' | 'priceMinor' | 'currency'>,
  currency: string,
): boolean {
  return tier.available && tier.priceMinor > 0 && tier.currency === currency
}

/**
 * The package (or base price) behind the «from» line; null when the activity
 * has nothing to sell. `tiers` are the published packages of the activity.
 */
export function fromPrice(
  activity: { priceMinor: number; currency: string },
  tiers: readonly FromPriceTier[],
): FromPrice | null {
  if (tiers.length === 0) {
    return activity.priceMinor > 0
      ? {
          priceMinor: activity.priceMinor,
          currency: activity.currency,
          pricing: 'per_person',
          groupMax: null,
          tierKey: null,
        }
      : null
  }
  const sellable = tiers.filter((tier) => isSellable(tier, activity.currency))
  if (sellable.length === 0) return null
  const open = sellable.filter((tier) => !isRestrictedAudience(tier))
  const pool = open.length > 0 ? open : sellable
  const best = [...pool].sort(
    (a, b) =>
      a.priceMinor - b.priceMinor ||
      Number(b.isPopular) - Number(a.isPopular) ||
      a.sortOrder - b.sortOrder,
  )[0]
  if (!best) return null
  return {
    priceMinor: best.priceMinor,
    currency: best.currency,
    pricing: best.pricing,
    groupMax: best.groupMax,
    tierKey: best.key,
  }
}
