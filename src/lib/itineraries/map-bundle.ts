/**
 * «الجدول + الخريطة» — which map product the bundle sells, and at what price
 * (itineraries phase 2, corrected spec §6 / §6.1). Pure.
 *
 * The full price is the existing map product's: the plan picked in Studio
 * (`itinerarySales.mapPlanId`) when it is published, else the cheapest
 * published map / VIP plan. Everything is SAR (the base currency, Nov 2026):
 * the bundle price is typed in SAR, and a plan still stored in another
 * currency is read in SAR at the Studio rate (the same conversion the cart
 * makes), so a stray USD plan no longer hides the bundle.
 * A bundle price of 0 means «not set»: the option is then sold at full price.
 *
 * Shared by the public pages (what the box shows) and the cart / checkout
 * (`@/lib/pricing/coverage-facts`, what is charged), so the two cannot drift.
 */

import { BASE_CURRENCY, DEFAULT_FX, toSarMinor } from '@/lib/currency/fx'

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

/** A candidate's price in SAR, or null when it has no rate. */
function inBase(
  plan: MapPlanCandidate,
  rates: Readonly<Record<string, number>>,
): MapPlanCandidate | null {
  const priceMinor = toSarMinor(plan.priceMinor, plan.currency, rates)
  return priceMinor === null ? null : { ...plan, priceMinor, currency: BASE_CURRENCY }
}

/** The map product the bundle sells, or null when none is on sale. */
export function resolveMapPlan(
  settings: Pick<ItinerarySalesSettings, 'mapPlanId'>,
  candidates: readonly MapPlanCandidate[],
  rates: Readonly<Record<string, number>> = DEFAULT_FX.rates,
): MapPlanCandidate | null {
  const live = candidates
    .filter((plan) => plan.published && MAP_KINDS.has(plan.kind))
    .map((plan) => inBase(plan, rates))
    .filter((plan): plan is MapPlanCandidate => plan !== null)
  if (settings.mapPlanId !== '') {
    const picked = live.find((plan) => plan.id === settings.mapPlanId)
    if (picked) return picked
  }
  return (
    [...live.filter((plan) => plan.priceMinor > 0)].sort(
      (a, b) => a.priceMinor - b.priceMinor,
    )[0] ?? null
  )
}

/** The «الجدول + الخريطة» offer (in SAR), or null when no map product is on sale. */
export function mapBundleOffer(
  settings: Pick<ItinerarySalesSettings, 'mapPlanId' | 'mapBundlePriceMinor'>,
  candidates: readonly MapPlanCandidate[],
  rates: Readonly<Record<string, number>> = DEFAULT_FX.rates,
): MapBundleOffer | null {
  const plan = resolveMapPlan(settings, candidates, rates)
  if (plan === null) return null
  const applies = settings.mapBundlePriceMinor > 0
  const saving = mapBundleSaving(
    plan.priceMinor,
    applies ? settings.mapBundlePriceMinor : plan.priceMinor,
  )
  return {
    planId: plan.id,
    currency: BASE_CURRENCY,
    fullMinor: saving.fullMinor,
    bundleMinor: saving.bundleMinor,
    savingMinor: saving.savingMinor,
  }
}
