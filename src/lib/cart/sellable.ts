/**
 * Can this be put in a trip to be paid for?
 *
 * A product whose price is zero has nothing to charge: in the cart it showed
 * "no cost", and checkout then said there was nothing to pay (audit H2 — two
 * published activities without a price). It is refused when added, on the
 * server, whatever the page offered.
 *
 * Not everything in a trip is sold: a saved place is a free line by design,
 * a driver is priced by its dates, and a custom quote has its own checks.
 * A line that another line pays for (an itinerary inside a package) becomes
 * zero later, in the quote — it is not added at zero.
 */

const SOLD_KINDS: readonly string[] = ['activity', 'activity_tier', 'itinerary', 'package', 'plan']

export function isSellable(kind: string, priceMinor: number): boolean {
  if (!SOLD_KINDS.includes(kind)) return true
  return Number.isInteger(priceMinor) && priceMinor > 0
}
