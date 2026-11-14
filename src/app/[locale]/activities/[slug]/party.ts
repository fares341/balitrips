/**
 * How many people one booking of an activity holds (pure, no I/O).
 *
 * One source for every place the page states a party size: the «group size»
 * fact beside the title, the information card, the selected-package facts and
 * the steppers of the booking box. They used to read different columns (the
 * activity's own cap in the header, the package's in the box), so a couples
 * tour said «2–20 people» above and «2–2» below.
 */

import type { PackagePricing } from '@/lib/booking/price'

export type PartyPackage = {
  pricing: PackagePricing
  maxGuests: number | null
  minGuests: number | null
}

export type PartyActivity = { maxGuests: number; minGuests: number }

/** A package can be bought only when it carries a price above zero. */
export function isPriced(pkg: { priceMinor: number }): boolean {
  return pkg.priceMinor > 0
}

/** Largest party for a package (the activity's own cap when it has none). */
export function capFor(pkg: PartyPackage | null, activity: PartyActivity): number {
  const cap = Math.max(1, Math.min(pkg?.maxGuests ?? activity.maxGuests, activity.maxGuests))
  // A couples package sells whole couples.
  return pkg?.pricing === 'per_couple' ? Math.max(2, cap - (cap % 2)) : cap
}

/** Smallest party for a package. */
export function minFor(pkg: PartyPackage | null, activity: PartyActivity): number {
  const min = Math.max(1, pkg?.minGuests ?? activity.minGuests)
  return pkg?.pricing === 'per_couple' ? Math.max(2, min + (min % 2)) : min
}

/**
 * The party one booking can hold across the packages on sale (the activity's
 * own bounds when it has no package to sell).
 */
export function partyRange(
  activity: PartyActivity,
  packages: readonly (PartyPackage & { available: boolean; priceMinor: number })[],
): { min: number; max: number } {
  const onSale = packages.filter((p) => p.available && isPriced(p))
  if (onSale.length === 0) {
    const max = capFor(null, activity)
    return { min: Math.min(minFor(null, activity), max), max }
  }
  const caps = onSale.map((p) => capFor(p, activity))
  const mins = onSale.map((p, i) => Math.min(minFor(p, activity), caps[i] ?? 1))
  return { min: Math.min(...mins), max: Math.max(...caps) }
}
