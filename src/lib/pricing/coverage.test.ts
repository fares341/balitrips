import { describe, expect, it } from 'vitest'

import { buildQuote, type CatalogSnapshot, type QuoteRequestItem } from './quote'

/**
 * Phase 3: the same thing is never charged twice. A package that includes an
 * itinerary, VIP that comes with a package or a VIP itinerary, a plan added
 * twice, and an earlier itinerary purchase deducted on upgrade.
 */

const NOW = new Date('2026-08-01T00:00:00Z')

function catalog(over: Partial<CatalogSnapshot> = {}): CatalogSnapshot {
  return {
    activityTiers: new Map(),
    activities: new Map(),
    plans: new Map([
      ['vip-30', { priceMinor: 3900, currency: 'USD', kind: 'vip' }],
      ['map-30', { priceMinor: 1900, currency: 'USD', kind: 'map_access' }],
    ]),
    itineraries: new Map([
      ['it7', { priceMinor: 7900, currency: 'USD', version: 3 }],
      ['it-vip', { priceMinor: 9900, currency: 'USD', version: 1, grantsVip: true }],
    ]),
    packages: new Map([
      [
        'pk-incl',
        {
          priceMinor: 69000,
          currency: 'USD',
          maxGuests: 4,
          pricingMode: 'flat' as const,
          coversItineraries: ['it7'],
          includesVip: true,
        },
      ],
      [
        'pk-upgrade',
        {
          priceMinor: 50000,
          currency: 'USD',
          maxGuests: 4,
          pricingMode: 'flat' as const,
          coversItineraries: ['it7'],
          creditItineraries: ['it7'],
        },
      ],
      [
        'pk-plain',
        { priceMinor: 30000, currency: 'USD', maxGuests: 4, pricingMode: 'flat' as const },
      ],
    ]),
    vehicles: new Map(),
    ...over,
  }
}

function line(over: Partial<QuoteRequestItem>): QuoteRequestItem {
  return {
    id: 'x',
    kind: 'itinerary',
    refId: 'it7',
    quantity: 1,
    travelDate: null,
    travelTime: null,
    guests: null,
    endDate: null,
    parentItemId: null,
    ...over,
  }
}

const pkg = (refId: string, id = 'p1') =>
  line({ id, kind: 'package', refId, travelDate: '2026-09-01', guests: 2 })

describe('no double counting', () => {
  it('charges an itinerary once when a package in the cart includes it', () => {
    const quote = buildQuote([line({ id: 'i1' }), pkg('pk-incl')], catalog(), NOW)
    expect(quote.ok).toBe(true)
    const itinerary = quote.lines.find((l) => l.itemId === 'i1')
    expect(itinerary).toMatchObject({ lineTotalMinor: 0, coveredBy: 'p1', refVersion: 3 })
    expect(quote.totalMinor).toBe(69000)
  })

  it('does not depend on the order of the lines', () => {
    const a = buildQuote([line({ id: 'i1' }), pkg('pk-incl')], catalog(), NOW)
    const b = buildQuote([pkg('pk-incl'), line({ id: 'i1' })], catalog(), NOW)
    expect(a.totalMinor).toBe(b.totalMinor)
  })

  it('still charges an itinerary the package does not include', () => {
    const quote = buildQuote([line({ id: 'i1' }), pkg('pk-plain')], catalog(), NOW)
    expect(quote.totalMinor).toBe(7900 + 30000)
    expect(quote.lines.find((l) => l.itemId === 'i1')?.coveredBy).toBeUndefined()
  })

  it('does not charge a VIP plan when the package includes VIP', () => {
    const quote = buildQuote(
      [pkg('pk-incl'), line({ id: 'v1', kind: 'plan', refId: 'vip-30' })],
      catalog(),
      NOW,
    )
    expect(quote.lines.find((l) => l.itemId === 'v1')).toMatchObject({
      lineTotalMinor: 0,
      coveredBy: 'p1',
    })
    expect(quote.totalMinor).toBe(69000)
  })

  it('does not charge a VIP plan when a VIP itinerary is in the cart', () => {
    const quote = buildQuote(
      [line({ id: 'i1', refId: 'it-vip' }), line({ id: 'v1', kind: 'plan', refId: 'vip-30' })],
      catalog(),
      NOW,
    )
    expect(quote.totalMinor).toBe(9900)
    expect(quote.lines.find((l) => l.itemId === 'v1')?.coveredBy).toBe('i1')
  })

  it('charges the VIP add-on of a plain itinerary as its own line', () => {
    const quote = buildQuote(
      [line({ id: 'i1' }), line({ id: 'v1', kind: 'plan', refId: 'vip-30' })],
      catalog(),
      NOW,
    )
    expect(quote.totalMinor).toBe(7900 + 3900)
    expect(quote.lines.find((l) => l.itemId === 'v1')).toMatchObject({
      kind: 'plan',
      lineTotalMinor: 3900,
    })
  })

  it('a map plan (not VIP) is never covered by VIP', () => {
    const quote = buildQuote(
      [pkg('pk-incl'), line({ id: 'm1', kind: 'plan', refId: 'map-30' })],
      catalog(),
      NOW,
    )
    expect(quote.totalMinor).toBe(69000 + 1900)
  })

  it('the same plan twice is charged once', () => {
    const quote = buildQuote(
      [
        line({ id: 'v1', kind: 'plan', refId: 'vip-30' }),
        line({ id: 'v2', kind: 'plan', refId: 'vip-30' }),
      ],
      catalog(),
      NOW,
    )
    expect(quote.totalMinor).toBe(3900)
    expect(quote.lines.find((l) => l.itemId === 'v2')?.coveredBy).toBe('v1')
  })
})

describe('deducted on upgrade', () => {
  const owned = new Map([['it7', { paidMinor: 7900, currency: 'USD' }]])

  it('deducts what the buyer already paid for the itinerary', () => {
    const quote = buildQuote([pkg('pk-upgrade')], catalog({ ownedItineraries: owned }), NOW)
    expect(quote.totalMinor).toBe(50000 - 7900)
    expect(quote.lines[0]?.credit).toEqual({ itineraryId: 'it7', amountMinor: 7900 })
  })

  it('deducts nothing for a buyer who does not own it', () => {
    expect(buildQuote([pkg('pk-upgrade')], catalog(), NOW).totalMinor).toBe(50000)
  })

  it('does not deduct twice when the itinerary is also in the cart', () => {
    const quote = buildQuote(
      [pkg('pk-upgrade'), line({ id: 'i1' })],
      catalog({ ownedItineraries: owned }),
      NOW,
    )
    // The itinerary line is covered (0) and the package is not reduced again.
    expect(quote.totalMinor).toBe(50000)
  })

  it('never goes below zero, and never mixes currencies', () => {
    const big = new Map([['it7', { paidMinor: 999999, currency: 'USD' }]])
    expect(
      buildQuote([pkg('pk-upgrade')], catalog({ ownedItineraries: big }), NOW).totalMinor,
    ).toBe(0)
    const idr = new Map([['it7', { paidMinor: 7900, currency: 'IDR' }]])
    expect(
      buildQuote([pkg('pk-upgrade')], catalog({ ownedItineraries: idr }), NOW).totalMinor,
    ).toBe(50000)
  })

  it('does not credit a package without the rule', () => {
    expect(buildQuote([pkg('pk-incl')], catalog({ ownedItineraries: owned }), NOW).totalMinor).toBe(
      69000,
    )
  })
})
