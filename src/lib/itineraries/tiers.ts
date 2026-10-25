/**
 * Itinerary levels — اقتصادية / متوسطة / فاخرة (client, Oct 2026).
 *
 * One itinerary can be sold at up to three levels, each with its own price
 * (`itineraries.tier_prices`, migration 0035; minor units, the itinerary's
 * currency). Prices are set by the owner in Studio and never invented: a level
 * without a price is shown as "coming soon" and cannot be bought. With no
 * level priced at all, the itinerary sells at its single price as before.
 */

import { BUDGET_TIERS, type BudgetTier } from '@/lib/budget-tier'

export const ITINERARY_TIERS = BUDGET_TIERS

export type ItineraryTier = BudgetTier

/** Stored shape: only priced levels are present. */
export type TierPrices = Partial<Record<ItineraryTier, number>>

export function isItineraryTier(value: unknown): value is ItineraryTier {
  return typeof value === 'string' && (ITINERARY_TIERS as readonly string[]).includes(value)
}

/** Keeps positive whole prices for known levels; drops anything else. */
export function normaliseTierPrices(raw: unknown): TierPrices {
  const out: TierPrices = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  const record = raw as Record<string, unknown>
  for (const key of ITINERARY_TIERS) {
    const value = record[key]
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) out[key] = value
  }
  return out
}

/** The priced levels, in order (economy → luxury). */
export function pricedTiers(prices: TierPrices): { key: ItineraryTier; priceMinor: number }[] {
  return ITINERARY_TIERS.flatMap((key) => {
    const priceMinor = prices[key]
    return priceMinor === undefined ? [] : [{ key, priceMinor }]
  })
}

/** The price of one level, or null when that level is not on sale. */
export function tierPrice(prices: TierPrices, tier: unknown): number | null {
  return isItineraryTier(tier) ? (prices[tier] ?? null) : null
}

/** The lowest price the itinerary is sold at (its "from" price). */
export function fromPrice(basePriceMinor: number, prices: TierPrices): number {
  const priced = pricedTiers(prices).map((one) => one.priceMinor)
  return priced.length === 0 ? basePriceMinor : Math.min(...priced)
}
