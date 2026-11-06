import { describe, expect, it } from 'vitest'

import { toBaseCatalog } from './base-currency'
import { buildQuote, type CatalogSnapshot, type QuoteRequestItem } from './quote'

const rates = { SAR: 1, USD: 1 / 3.75 }

function catalog(): CatalogSnapshot {
  return {
    activities: new Map(),
    activityTiers: new Map(),
    itineraries: new Map([['it', { priceMinor: 22_100, currency: 'SAR', version: 1 }]]),
    // A map plan left in USD (the live bug): priced in SAR at the rate.
    plans: new Map([['map', { priceMinor: 2_000, currency: 'USD', kind: 'map_access' }]]),
    packages: new Map(),
    vehicles: new Map(),
  }
}

const item = (id: string, kind: QuoteRequestItem['kind'], refId: string): QuoteRequestItem => ({
  id,
  kind,
  refId,
  quantity: 1,
  travelDate: null,
  travelTime: null,
  guests: null,
  endDate: null,
  parentItemId: null,
})

describe('cart with mixed-currency items', () => {
  it('without the base step a USD line blocks the SAR cart', () => {
    const quote = buildQuote([item('a', 'itinerary', 'it'), item('b', 'plan', 'map')], catalog())
    expect(quote.ok).toBe(false)
    expect(quote.issues.map((i) => i.code)).toContain('currency_mismatch')
    expect(quote.currency).toBe('SAR')
  })

  it('prices every line in SAR, whatever the first item is', () => {
    for (const order of [
      [item('b', 'plan', 'map'), item('a', 'itinerary', 'it')],
      [item('a', 'itinerary', 'it'), item('b', 'plan', 'map')],
    ]) {
      const quote = buildQuote(order, toBaseCatalog(catalog(), rates))
      expect(quote.ok).toBe(true)
      expect(quote.currency).toBe('SAR')
      expect(quote.lines.every((l) => l.currency === 'SAR')).toBe(true)
      expect(quote.totalMinor).toBe(22_100 + 7_500)
    }
  })

  it('leaves a price with no rate alone, and the quote refuses it', () => {
    const snap = catalog()
    snap.plans.set('odd', { priceMinor: 100, currency: 'XYZ' })
    const quote = buildQuote([item('c', 'plan', 'odd')], toBaseCatalog(snap, rates))
    expect(quote.issues.map((i) => i.code)).toContain('currency_mismatch')
  })

  it('converts nested prices: itinerary levels and the map bundle price', () => {
    const snap = catalog()
    snap.itineraries.set('usdIt', {
      priceMinor: 5_900,
      currency: 'USD',
      version: 1,
      tierPrices: { economy: 5_900, luxury: 9_900 },
    })
    snap.plans.set('map', {
      priceMinor: 2_000,
      currency: 'USD',
      kind: 'map_access',
      withItineraryMinor: 1_200,
    })
    toBaseCatalog(snap, rates)
    expect(snap.itineraries.get('usdIt')).toMatchObject({
      priceMinor: 22_125,
      currency: 'SAR',
      tierPrices: { economy: 22_125, luxury: 37_125 },
    })
    expect(snap.plans.get('map')).toMatchObject({ priceMinor: 7_500, withItineraryMinor: 4_500 })
  })
})
