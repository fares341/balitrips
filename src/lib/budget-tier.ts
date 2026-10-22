/**
 * Budget categories — اقتصادية / متوسطة / فاخرة (Economy / Mid-range / Luxury).
 *
 * The traveller no longer picks a number: the custom-trip form, the activity
 * filters and the package / itinerary filters all speak in these three tiers.
 * The value stored and passed in URLs is the key ('economy' | 'mid' |
 * 'luxury'); labels come from messages (`ct_budget_eco|mid|lux`).
 *
 * A catalogue item has no tier column, so its tier is derived from its real
 * price with the thresholds below — the single place to tune them. Nothing
 * is invented: an item whose currency has no thresholds gets no tier (it is
 * shown unfiltered and never placed in a category it might not belong to).
 */

export const BUDGET_TIERS = ['economy', 'mid', 'luxury'] as const

export type BudgetTier = (typeof BUDGET_TIERS)[number]

export function isBudgetTier(value: unknown): value is BudgetTier {
  return typeof value === 'string' && (BUDGET_TIERS as readonly string[]).includes(value)
}

/** Message key of each tier's label (ar/en/id). */
export const BUDGET_TIER_LABEL: Record<BudgetTier, string> = {
  economy: 'ct_budget_eco',
  mid: 'ct_budget_mid',
  luxury: 'ct_budget_lux',
}

/** What is being priced: each kind has its own price scale. */
export type TierKind = 'activity' | 'package' | 'itinerary'

/**
 * THE thresholds, in whole USD.
 *
 * `[a, b]`: price < a → economy, a ≤ price < b → mid, price ≥ b → luxury.
 *
 *  - activity:  the "from" price per person of one experience;
 *  - package:   the package price for the whole group (a per-guest package is
 *               compared per person, against half these figures);
 *  - itinerary: the price of the digital day-by-day plan.
 */
export const BUDGET_TIER_THRESHOLDS: Record<TierKind, readonly [number, number]> = {
  activity: [40, 90],
  package: [800, 1600],
  itinerary: [60, 90],
}

/** Currencies the thresholds are written in. Others are not classified. */
const THRESHOLD_CURRENCY = 'USD'

/** Minor units → whole units of USD (2 decimals). */
const USD_MINOR = 100

/**
 * The tier of one real price, or null when it cannot be classified honestly
 * (another currency, or no price at all).
 */
export function tierForPrice(
  priceMinor: number,
  currency: string,
  kind: TierKind,
  options: { perGuest?: boolean } = {},
): BudgetTier | null {
  if (!Number.isFinite(priceMinor) || priceMinor <= 0) return null
  if (currency.toUpperCase() !== THRESHOLD_CURRENCY) return null

  const [low, high] = BUDGET_TIER_THRESHOLDS[kind]
  const scale = kind === 'package' && options.perGuest === true ? 0.5 : 1
  const whole = priceMinor / USD_MINOR

  if (whole < low * scale) return 'economy'
  if (whole < high * scale) return 'mid'
  return 'luxury'
}

/** Read a tier from a query-string value; anything else means "no filter". */
export function parseBudgetTier(value: string | string[] | undefined | null): BudgetTier | null {
  const first = Array.isArray(value) ? value[0] : value
  return isBudgetTier(first) ? first : null
}

/**
 * The tier a legacy custom-trip request implies, from the per-person trip
 * budget it stored before the categories existed (slider: 200–3000 USD).
 */
export const LEGACY_BUDGET_THRESHOLDS: readonly [number, number] = [700, 1600]

export function tierForLegacyBudget(
  budgetPerPersonMinor: number | null,
  currency: string | null,
): BudgetTier | null {
  if (budgetPerPersonMinor === null || currency === null) return null
  if (currency.toUpperCase() !== THRESHOLD_CURRENCY) return null
  const whole = budgetPerPersonMinor / USD_MINOR
  const [low, high] = LEGACY_BUDGET_THRESHOLDS
  if (whole < low) return 'economy'
  if (whole < high) return 'mid'
  return 'luxury'
}

/**
 * Tiers relative to the catalogue being listed: the cheapest third is
 * economy, the middle third mid-range, the dearest third luxury.
 *
 * The fixed thresholds above put every package of a small catalogue in one
 * band (six packages at $420–$690 were all "economy", and "luxury (0)" was
 * offered as a filter). A listing filter has to split what is actually on
 * sale, so the bands are computed from the real prices. Prices are compared
 * within one currency only; an item without a usable price gets no tier.
 * Equal prices always share a tier; a catalogue whose prices are all equal is
 * all mid-range.
 */
export function tiersFromPrices<T>(
  items: readonly T[],
  priceOf: (item: T) => { minor: number; currency: string } | null,
): (BudgetTier | null)[] {
  const prices = items.map(priceOf)
  const byCurrency = new Map<string, number[]>()
  for (const price of prices) {
    if (price === null || !Number.isFinite(price.minor) || price.minor <= 0) continue
    const key = price.currency.toUpperCase()
    byCurrency.set(key, [...(byCurrency.get(key) ?? []), price.minor])
  }
  return prices.map((price) => {
    if (price === null || !Number.isFinite(price.minor) || price.minor <= 0) return null
    const all = byCurrency.get(price.currency.toUpperCase()) ?? []
    const lowest = Math.min(...all)
    const highest = Math.max(...all)
    if (lowest === highest) return 'mid'
    const cheaper = all.filter((value) => value < price.minor).length
    return BUDGET_TIERS[Math.min(2, Math.floor((3 * cheaper) / all.length))] ?? null
  })
}
