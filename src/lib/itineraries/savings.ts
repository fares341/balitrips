/**
 * Savings maths for itineraries (corrected spec §6 / §6.1) — pure.
 *
 * Every «وفّر X» on the site comes from here, on the server, from the Studio
 * settings; the browser only displays the result. All amounts are integer
 * minor units in ONE currency — the caller converts before calling.
 */

/** «الجدول + الخريطة»: what the map costs with the itinerary, and what it saves. */
export function mapBundleSaving(
  mapFullMinor: number,
  mapBundleMinor: number,
): {
  fullMinor: number
  bundleMinor: number
  savingMinor: number
} {
  const full = Math.max(0, Math.round(mapFullMinor))
  // A bundle price above the full price is a typo, never a surcharge.
  const bundle = Math.min(full, Math.max(0, Math.round(mapBundleMinor)))
  return { fullMinor: full, bundleMinor: bundle, savingMinor: full - bundle }
}

/** Percent off, rounded half-up to the minor unit; 0–90 % accepted. */
export function percentOffMinor(totalMinor: number, pct: number): number {
  if (!Number.isFinite(totalMinor) || totalMinor <= 0) return 0
  const safePct = Math.min(90, Math.max(0, Math.round(pct)))
  return Math.floor((Math.round(totalMinor) * safePct + 50) / 100)
}

export interface ActivityLine {
  /** Linked activity id. */
  activityId: string
  adultPriceMinor: number
  /** The package's own child price (spec §0 — no fixed child percentage). */
  childPriceMinor: number
  adults: number
  children: number
}

/** One activity line: adult price × adults + the package's child price × children. */
export function activityLineMinor(line: ActivityLine): number {
  const adults = Math.max(0, Math.floor(line.adults))
  const children = Math.max(0, Math.floor(line.children))
  return line.adultPriceMinor * adults + line.childPriceMinor * children
}

export interface BundleInput {
  /** Every activity linked to the itinerary (ids). */
  linkedActivityIds: readonly string[]
  /** What the buyer chose. */
  lines: readonly ActivityLine[]
  /** The bundle discount percent from settings. */
  discountPct: number
  /** Only a buyer who owns the itinerary (and has uses left) gets the discount. */
  isOwner: boolean
  /** Driver total, and whether the discount covers it. */
  driverMinor?: number
  discountIncludesDriver?: boolean
}

export interface BundleResult {
  subtotalMinor: number
  /** True when every linked activity is chosen. */
  complete: boolean
  discountMinor: number
  totalMinor: number
  /** How many linked activities are not chosen yet («أضف الباقي ووفّر X»). */
  missing: number
  /** What adding the rest would save on the current lines' discount base. */
  potentialDiscountMinor: number
}

/**
 * «احجز كل الفعاليات»: the discount applies only to the owner, and only when
 * every linked activity is in the selection. A partial selection is at the
 * normal price.
 */
export function bundleTotal(input: BundleInput): BundleResult {
  const chosen = new Set(input.lines.map((line) => line.activityId))
  const linked = new Set(input.linkedActivityIds)
  const missing = [...linked].filter((id) => !chosen.has(id)).length
  const activitiesMinor = input.lines.reduce((sum, line) => sum + activityLineMinor(line), 0)
  const driverMinor = Math.max(0, Math.round(input.driverMinor ?? 0))
  const subtotalMinor = activitiesMinor + driverMinor
  const base = activitiesMinor + (input.discountIncludesDriver ? driverMinor : 0)
  const complete = linked.size > 0 && missing === 0
  const discountMinor = input.isOwner && complete ? percentOffMinor(base, input.discountPct) : 0
  return {
    subtotalMinor,
    complete,
    discountMinor,
    totalMinor: subtotalMinor - discountMinor,
    missing,
    potentialDiscountMinor:
      input.isOwner && !complete && linked.size > 0 ? percentOffMinor(base, input.discountPct) : 0,
  }
}

/** «إجمالي توفيرك» = the map saving (when the map is in the order) + the bundle discount. */
export function totalSavingMinor(parts: {
  mapSavingMinor?: number
  bundleDiscountMinor?: number
}): number {
  return Math.max(0, parts.mapSavingMinor ?? 0) + Math.max(0, parts.bundleDiscountMinor ?? 0)
}
