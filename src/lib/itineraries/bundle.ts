/**
 * «احجز كل الفعاليات» in the cart (itineraries phase 3, corrected spec §2.4 / §6) — pure.
 *
 * Activity lines added from the buyer-only «فعاليات جدولي» page carry the
 * bought itinerary's id in `options.itineraryBundle`. That tag is a hint, not
 * a price: the discount below is granted only when
 *
 *  - the rule is `eligible` — the server checked the cart's owner bought the
 *    itinerary and still has uses left (`./bundle-server`), and
 *  - every bookable activity linked to the itinerary is in the cart under
 *    that tag (a partial selection is at the normal price).
 *
 * The base is the tagged lines' own server-priced totals (and their linked
 * driver lines when the settings say the discount covers the driver).
 */

import { percentOffMinor } from './savings'

export interface BundleCartLine {
  itemId: string
  kind: string
  /** The activity the line books (a package line maps to its activity). Null otherwise. */
  activityId: string | null
  parentItemId: string | null
  /** `options.itineraryBundle` of the line, or null. */
  bundleItineraryId: string | null
  /** Server-priced line total. Null = could not be priced (no discount on it). */
  lineTotalMinor: number | null
}

export interface BundleRule {
  itineraryId: string
  /** Bookable activities linked to the itinerary (Studio days). */
  linkedActivityIds: readonly string[]
  pct: number
  includesDriver: boolean
  /** Owner of a settled purchase with uses left. */
  eligible: boolean
}

export interface BundleDiscount {
  itineraryId: string
  baseMinor: number
  amountMinor: number
}

export function cartBundleDiscounts(
  lines: readonly BundleCartLine[],
  rules: readonly BundleRule[],
): BundleDiscount[] {
  const out: BundleDiscount[] = []
  for (const rule of rules) {
    if (!rule.eligible || rule.linkedActivityIds.length === 0 || rule.pct <= 0) continue
    const tagged = lines.filter(
      (line) =>
        line.bundleItineraryId === rule.itineraryId &&
        line.parentItemId === null &&
        line.activityId !== null &&
        rule.linkedActivityIds.includes(line.activityId),
    )
    const chosen = new Set(tagged.map((line) => line.activityId))
    if (!rule.linkedActivityIds.every((id) => chosen.has(id))) continue
    // Any unpriced tagged line: no discount until the cart can be priced.
    if (tagged.some((line) => line.lineTotalMinor === null)) continue
    const taggedIds = new Set(tagged.map((line) => line.itemId))
    let baseMinor = tagged.reduce((sum, line) => sum + (line.lineTotalMinor ?? 0), 0)
    if (rule.includesDriver) {
      for (const line of lines) {
        if (
          line.kind === 'driver' &&
          line.parentItemId !== null &&
          taggedIds.has(line.parentItemId)
        )
          baseMinor += line.lineTotalMinor ?? 0
      }
    }
    const amountMinor = percentOffMinor(baseMinor, rule.pct)
    if (amountMinor > 0) out.push({ itineraryId: rule.itineraryId, baseMinor, amountMinor })
  }
  return out
}

/** The percent in force: the itinerary's own, else the global setting. */
export function bundlePct(own: number | null | undefined, global: number): number {
  const raw = own === null || own === undefined ? global : own
  return Math.min(90, Math.max(0, Math.round(raw)))
}

/** Day N of a trip that starts on `arrival` (YYYY-MM-DD), as a plain date. */
export function dayDate(arrival: string, dayNumber: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrival)) return null
  const base = new Date(`${arrival}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) return null
  base.setUTCDate(base.getUTCDate() + Math.max(0, dayNumber - 1))
  return base.toISOString().slice(0, 10)
}

export type BuyerAccess = 'ok' | 'sign-in' | 'not-owner'

/**
 * Who may open «فعاليات جدولي»: a signed-in owner of a settled purchase, or
 * staff (preview). A visitor signs in first; anyone else goes to the public page.
 */
export function buyerAccess(viewer: {
  signedIn: boolean
  owns: boolean
  staff: boolean
}): BuyerAccess {
  if (!viewer.signedIn) return 'sign-in'
  return viewer.owns || viewer.staff ? 'ok' : 'not-owner'
}
