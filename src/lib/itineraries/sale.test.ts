import { describe, expect, it } from 'vitest'

import {
  dateOfTripDay,
  legacyFlagsFor,
  mapAccessOf,
  normaliseVisitTime,
  sellsPlanDirectly,
  visibleSaleModes,
  type SaleFlags,
} from './sale'

const flags = (over: Partial<SaleFlags> = {}): SaleFlags => ({
  saleDigital: true,
  saleWithActivities: false,
  saleWithPackages: false,
  saleCustomRequest: false,
  ...over,
})

describe('sale mode visibility', () => {
  it('shows only the modes switched on in Studio', () => {
    expect(visibleSaleModes(flags(), { bookableActivities: 3, livePackages: 2 })).toEqual([
      'digital',
    ])
    expect(
      visibleSaleModes(
        flags({ saleWithActivities: true, saleWithPackages: true, saleCustomRequest: true }),
        { bookableActivities: 3, livePackages: 2 },
      ),
    ).toEqual(['digital', 'activities', 'packages', 'custom'])
  })

  it('hides a mode with nothing behind it', () => {
    expect(
      visibleSaleModes(flags({ saleWithActivities: true, saleWithPackages: true }), {
        bookableActivities: 0,
        livePackages: 0,
      }),
    ).toEqual(['digital'])
  })

  it('packages only: no direct buy button', () => {
    const modes = visibleSaleModes(flags({ saleDigital: false, saleWithPackages: true }), {
      bookableActivities: 0,
      livePackages: 1,
    })
    expect(modes).toEqual(['packages'])
    expect(sellsPlanDirectly(modes)).toBe(false)
  })

  it('never leaves an itinerary with no way to buy it', () => {
    expect(
      visibleSaleModes(flags({ saleDigital: false, saleCustomRequest: true }), {
        bookableActivities: 0,
        livePackages: 0,
      }),
    ).toEqual(['digital', 'custom'])
  })
})

describe('map access', () => {
  it('keeps the old "includes the map" itineraries as VIP included', () => {
    expect(mapAccessOf({ mapAccess: 'vip_included', includesMap: true })).toBe('vip_included')
    // A bad stored value falls back to the legacy flag, never to VIP by default.
    expect(mapAccessOf({ mapAccess: 'bogus', includesMap: false })).toBe('free_only')
    expect(mapAccessOf({ mapAccess: null, includesMap: true })).toBe('vip_included')
  })

  it('only "VIP included" turns the legacy grant on', () => {
    expect(legacyFlagsFor('vip_included')).toEqual({ includesMap: true, isVip: true })
    expect(legacyFlagsFor('vip_addon')).toEqual({ includesMap: false, isVip: false })
    expect(legacyFlagsFor('vip_later')).toEqual({ includesMap: false, isVip: false })
    expect(legacyFlagsFor('free_only')).toEqual({ includesMap: false, isVip: false })
  })
})

describe('dates and times', () => {
  it('counts trip days from the start date', () => {
    expect(dateOfTripDay('2026-09-29', 1)).toBe('2026-09-29')
    expect(dateOfTripDay('2026-09-29', 3)).toBe('2026-10-01')
    expect(dateOfTripDay('2026-02-31', 1)).toBeNull()
    expect(dateOfTripDay('2026-09-29', 0)).toBeNull()
  })

  it('normalises visit times', () => {
    expect(normaliseVisitTime('9:05')).toBe('09:05')
    expect(normaliseVisitTime('24:00')).toBeNull()
    expect(normaliseVisitTime('noon')).toBeNull()
  })
})
