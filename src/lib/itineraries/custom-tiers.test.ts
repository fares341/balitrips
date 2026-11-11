import { describe, expect, it } from 'vitest'

import { DEFAULT_CUSTOM_TRIP_TIERS, sortedTiers, tierForDays, tripLength } from './custom-tiers'
import { parseItinerarySales } from './sales-settings'

describe('custom itinerary price tiers', () => {
  it('defaults to 300 / 400 / 500 SAR for up to 10 / 15 / 20 days', () => {
    expect(parseItinerarySales({}).customTripTiers).toEqual([
      { maxDays: 10, priceMinor: 30_000 },
      { maxDays: 15, priceMinor: 40_000 },
      { maxDays: 20, priceMinor: 50_000 },
    ])
  })
  it('keeps an older settings row valid', () => {
    expect(parseItinerarySales({ allActivitiesDiscountPct: 15 }).customTripTiers).toHaveLength(3)
  })
  it('picks the shortest tier that covers the trip', () => {
    expect(tierForDays(DEFAULT_CUSTOM_TRIP_TIERS, 1)?.priceMinor).toBe(30_000)
    expect(tierForDays(DEFAULT_CUSTOM_TRIP_TIERS, 10)?.priceMinor).toBe(30_000)
    expect(tierForDays(DEFAULT_CUSTOM_TRIP_TIERS, 11)?.priceMinor).toBe(40_000)
    expect(tierForDays(DEFAULT_CUSTOM_TRIP_TIERS, 20)?.priceMinor).toBe(50_000)
    expect(tierForDays(DEFAULT_CUSTOM_TRIP_TIERS, 21)).toBeNull()
    expect(tierForDays(DEFAULT_CUSTOM_TRIP_TIERS, 0)).toBeNull()
  })
  it('sorts and drops invalid rows', () => {
    expect(
      sortedTiers([
        { maxDays: 15, priceMinor: 40_000 },
        { maxDays: 10, priceMinor: 0 },
        { maxDays: 5, priceMinor: 20_000 },
      ]).map((t) => t.maxDays),
    ).toEqual([5, 15])
  })
  it('counts both travel days', () => {
    expect(tripLength('2026-12-01', '2026-12-10')).toBe(10)
    expect(tripLength('2026-12-01', '2026-12-01')).toBe(1)
    expect(tripLength('2026-12-05', '2026-12-01')).toBeNull()
    expect(tripLength('', '2026-12-01')).toBeNull()
  })
})
