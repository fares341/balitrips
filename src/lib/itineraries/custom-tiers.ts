/**
 * Custom itinerary («جدول مخصص / الرحلة المخصصة») price tiers (owner, Nov
 * 2026): «يبدأ من 300 ر.س لجدول حتى 10 أيام · حتى 15 يوم 400 ر.س · حتى 20
 * يوم 500 ر.س». Display only — the custom request flow and its payment are
 * unchanged. Stored in the `itinerarySales` setting (`customTripTiers`),
 * editable in Studio → الجداول → الأسعار. Pure.
 */

export interface CustomTripTier {
  /** The tier covers plans of up to this many days. */
  maxDays: number
  /** SAR, minor units. */
  priceMinor: number
}

export const DEFAULT_CUSTOM_TRIP_TIERS: readonly CustomTripTier[] = [
  { maxDays: 10, priceMinor: 30_000 },
  { maxDays: 15, priceMinor: 40_000 },
  { maxDays: 20, priceMinor: 50_000 },
]

/** Valid rows, sorted by length, one per length. */
export function sortedTiers(tiers: readonly CustomTripTier[]): CustomTripTier[] {
  const byDays = new Map<number, CustomTripTier>()
  for (const tier of tiers) {
    if (!Number.isInteger(tier.maxDays) || tier.maxDays < 1) continue
    if (!Number.isInteger(tier.priceMinor) || tier.priceMinor <= 0) continue
    if (!byDays.has(tier.maxDays)) byDays.set(tier.maxDays, tier)
  }
  return [...byDays.values()].sort((a, b) => a.maxDays - b.maxDays)
}

/** The tier for a trip of `days`: the shortest one that covers it; null past the last. */
export function tierForDays(tiers: readonly CustomTripTier[], days: number): CustomTripTier | null {
  if (!Number.isFinite(days) || days < 1) return null
  return sortedTiers(tiers).find((tier) => days <= tier.maxDays) ?? null
}

/** Days of a trip from two ISO dates, both counted (10–12 Jan = 3); null when incomplete. */
export function tripLength(start: string, end: string): number | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/
  if (!iso.test(start) || !iso.test(end)) return null
  const diff = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000
  return Number.isInteger(diff) && diff >= 0 ? diff + 1 : null
}
