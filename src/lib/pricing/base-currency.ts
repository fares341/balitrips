/**
 * Put a catalog snapshot in the base currency (SAR) before it is priced.
 *
 * After migration 0043 every catalog price is already SAR and this changes
 * nothing. It exists so a row that slipped through (an import, a restore,
 * an old sheet) is still sold in SAR at the Studio rate rather than
 * blocking the cart with `currency_mismatch` — the cart's currency no longer
 * comes from its first item. A price with no rate stays as it is, and the
 * quote then refuses it (Studio → «صحة العملة» lists it).
 *
 * Pure: the rate table comes in.
 */

import { BASE_CURRENCY, toSarMinor } from '@/lib/currency/fx'

import type { CatalogSnapshot } from './quote'

type Priced = { priceMinor: number; currency: string }

function convert(value: number, currency: string, rates: Readonly<Record<string, number>>) {
  return toSarMinor(value, currency, rates)
}

/** Converts `entry` in place; returns false when there is no rate. */
function rebase<T extends Priced>(
  entry: T,
  rates: Readonly<Record<string, number>>,
  extra?: (to: (minor: number) => number) => void,
): boolean {
  const from = entry.currency.toUpperCase()
  if (from === BASE_CURRENCY) return true
  const price = convert(entry.priceMinor, from, rates)
  if (price === null) return false
  const to = (minor: number) => convert(minor, from, rates) ?? minor
  extra?.(to)
  entry.priceMinor = price
  entry.currency = BASE_CURRENCY
  return true
}

export function toBaseCatalog(
  snapshot: CatalogSnapshot,
  rates: Readonly<Record<string, number>>,
): CatalogSnapshot {
  for (const entry of snapshot.activities.values()) rebase(entry, rates)
  for (const entry of snapshot.activityTiers.values()) {
    rebase(entry, rates, (to) => {
      if (typeof entry.childPriceMinor === 'number')
        entry.childPriceMinor = to(entry.childPriceMinor)
      for (const season of entry.seasons ?? []) {
        season.priceMinor = to(season.priceMinor)
        if (season.childPriceMinor !== null) season.childPriceMinor = to(season.childPriceMinor)
      }
    })
  }
  for (const list of snapshot.activityAddons?.values() ?? []) {
    for (const rule of list) {
      rebase(rule, rates, (to) => {
        if (rule.priceTiers) {
          ;(rule as { priceTiers: unknown }).priceTiers = rule.priceTiers.map((tier) => ({
            ...tier,
            priceMinor: to(tier.priceMinor),
          }))
        }
      })
    }
  }
  for (const entry of snapshot.itineraries.values()) {
    rebase(entry, rates, (to) => {
      if (entry.tierPrices) {
        entry.tierPrices = Object.fromEntries(
          Object.entries(entry.tierPrices).map(([key, value]) => [
            key,
            typeof value === 'number' ? to(value) : value,
          ]),
        )
      }
    })
  }
  for (const entry of snapshot.plans.values()) {
    rebase(entry, rates, (to) => {
      if (typeof entry.withItineraryMinor === 'number') {
        entry.withItineraryMinor = to(entry.withItineraryMinor)
      }
    })
  }
  for (const entry of snapshot.customRequests?.values() ?? []) rebase(entry, rates)
  for (const entry of snapshot.packages.values()) rebase(entry, rates)
  for (const entry of snapshot.ownedItineraries?.values() ?? []) {
    const from = entry.currency.toUpperCase()
    if (from === BASE_CURRENCY) continue
    const paid = convert(entry.paidMinor, from, rates)
    if (paid !== null) {
      entry.paidMinor = paid
      entry.currency = BASE_CURRENCY
    }
  }
  for (const entry of snapshot.vehicles.values()) {
    const from = entry.currency.toUpperCase()
    if (from === BASE_CURRENCY) continue
    const day = convert(entry.dayRateMinor, from, rates)
    if (day !== null) {
      entry.dayRateMinor = day
      entry.currency = BASE_CURRENCY
    }
  }
  return snapshot
}
