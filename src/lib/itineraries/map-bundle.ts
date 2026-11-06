/**
 * «الجدول + الخريطة» — which map product the bundle sells, and at what price
 * (itineraries phase 2, corrected spec §6 / §6.1). Pure.
 *
 * The full price is the existing map product's: the plan picked in Studio
 * (`itinerarySales.mapPlanId`) when it is published, else the cheapest
 * published map / VIP plan. The bundle price (`mapBundlePriceMinor`) is typed
 * in the settings currency, so it applies only to a plan sold in that same
 * currency — never through an exchange rate, because it decides a charge.
 * A bundle price of 0 means «not set»: the option is then sold at full price.
 *
 * Shared by the public pages (what the box shows) and the cart / checkout
 * (`@/lib/pricing/coverage-facts`, what is charged), so the two cannot drift.
 */

import { mapBundleSaving } from './savings'
import type { ItinerarySalesSettings } from './sales-settings'

export interface MapPlanCandidate {
  id: string
  priceMinor: number
  currency: string
  /** `map_access` | `vip` | … — other kinds are never the map. */
  kind: string
  published: boolean
}

export interface MapBundleOffer {
  planId: string
  currency: string
  /** The map on its own. */
  fullMinor: number
  /** The map with an itinerary (= full when no bundle price applies). */
  bundleMinor: number
  savingMinor: number
}

const MAP_KINDS = new Set(['map_access', 'vip'])

/** The map product the bundle sells, or null when none is on sale. */
export function resolveMapPlan(
  settings: Pick<ItinerarySalesSettings, 'mapPlanId' | 'currency'>,
  candidates: readonly MapPlanCandidate[],
): MapPlanCandidate | null {
  const live = candidates.filter((plan) => plan.published && MAP_KINDS.has(plan.kind))
  if (settings.mapPlanId !== '') {
    const picked = live.find((plan) => plan.id === settings.mapPlanId)
    if (picked) return picked
  }
  const cheapest = (list: readonly MapPlanCandidate[]) =>
    [...list].sort((a, b) => a.priceMinor - b.priceMinor)[0] ?? null
  return (
    cheapest(live.filter((plan) => plan.currency === settings.currency && plan.priceMinor > 0)) ??
    cheapest(live.filter((plan) => plan.priceMinor > 0))
  )
}

/** The «الجدول + الخريطة» offer, or null when no map product is on sale. */
export function mapBundleOffer(
  settings: Pick<ItinerarySalesSettings, 'mapPlanId' | 'currency' | 'mapBundlePriceMinor'>,
  candidates: readonly MapPlanCandidate[],
): MapBundleOffer | null {
  const plan = resolveMapPlan(settings, candidates)
  if (plan === null) return null
  const applies = settings.mapBundlePriceMinor > 0 && plan.currency === settings.currency
  const saving = mapBundleSaving(
    plan.priceMinor,
    applies ? settings.mapBundlePriceMinor : plan.priceMinor,
  )
  return {
    planId: plan.id,
    currency: plan.currency,
    fullMinor: saving.fullMinor,
    bundleMinor: saving.bundleMinor,
    savingMinor: saving.savingMinor,
  }
}
