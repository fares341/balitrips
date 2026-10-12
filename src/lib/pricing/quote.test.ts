import { describe, expect, it } from 'vitest'

import {
  buildQuote,
  quoteMatchesExpectation,
  type CatalogSnapshot,
  type QuoteRequestItem,
} from './quote'

const NOW = new Date('2026-08-01T00:00:00Z')

function catalog(): CatalogSnapshot {
  return {
    // Two levels of the Batur hike: a per-guest premium and a flat couples
    // rate capped at two, which is the pair of cases worth testing.
    activityTiers: new Map([
      [
        'batur-premium',
        {
          activityId: 'batur',
          priceMinor: 9900,
          currency: 'USD',
          pricingMode: 'per_guest' as const,
          maxGuests: null,
        },
      ],
      [
        'batur-couples',
        {
          activityId: 'batur',
          priceMinor: 17000,
          currency: 'USD',
          pricingMode: 'flat' as const,
          maxGuests: 2,
        },
      ],
    ]),
    activities: new Map([
      [
        'batur',
        {
          priceMinor: 5500,
          currency: 'USD',
          maxGuests: 20,
          leadTimeHours: 24,
          timeSlots: ['09:00', '11:30', '14:00', '16:30'],
        },
      ],
    ]),
    plans: new Map([['plan-1', { priceMinor: 1900, currency: 'USD' }]]),
    itineraries: new Map([['it7', { priceMinor: 7900, currency: 'USD', version: 3 }]]),
    packages: new Map([
      ['pk_honey', { priceMinor: 69000, currency: 'USD', maxGuests: 2, pricingMode: 'flat' }],
      ['pk_family', { priceMinor: 12000, currency: 'USD', maxGuests: 6, pricingMode: 'per_guest' }],
    ]),
    vehicles: new Map([
      ['sedan', { dayRateMinor: 4500, currency: 'USD', maxPassengers: 4 }],
      ['suv', { dayRateMinor: 7000, currency: 'USD', maxPassengers: 7 }],
      ['van', { dayRateMinor: 9500, currency: 'USD', maxPassengers: 20 }],
    ]),
  }
}

function item(over: Partial<QuoteRequestItem> = {}): QuoteRequestItem {
  return {
    id: 'i1',
    kind: 'activity',
    refId: 'batur',
    quantity: 2,
    travelDate: '2026-08-12',
    travelTime: '09:00',
    guests: null,
    endDate: null,
    parentItemId: null,
    ...over,
  }
}

describe('activity pricing', () => {
  it('prices from the catalog, not from anything the client sent', () => {
    const q = buildQuote([item()], catalog(), NOW)
    expect(q.ok).toBe(true)
    expect(q.lines[0]?.unitPriceMinor).toBe(5500)
    expect(q.lines[0]?.lineTotalMinor).toBe(11_000)
    expect(q.totalMinor).toBe(11_000)
  })

  it('rejects an unknown activity rather than falling back to the first one', () => {
    // The prototype did `findActivity(id) || ACTIVITIES[0]`, which would
    // have charged for a completely different product.
    const q = buildQuote([item({ refId: 'does-not-exist' })], catalog(), NOW)
    expect(q.ok).toBe(false)
    expect(q.issues[0]?.code).toBe('unknown_item')
    expect(q.lines).toHaveLength(0)
  })

  it('requires a date and a time', () => {
    expect(buildQuote([item({ travelDate: null })], catalog(), NOW).issues[0]?.code).toBe(
      'missing_date',
    )
    expect(buildQuote([item({ travelTime: null })], catalog(), NOW).issues[0]?.code).toBe(
      'missing_time',
    )
  })

  it('rejects a past date', () => {
    const q = buildQuote([item({ travelDate: '2026-07-01' })], catalog(), NOW)
    expect(q.issues[0]?.code).toBe('date_in_past')
  })

  it('rejects a time slot the activity does not offer', () => {
    const q = buildQuote([item({ travelTime: '03:00' })], catalog(), NOW)
    expect(q.issues[0]?.code).toBe('invalid_time_slot')
  })

  it('rejects a booking inside the lead time', () => {
    // 09:00 Bali on 12 Aug is 01:00Z; 22:00Z on the 11th is 3h before.
    const late = new Date('2026-08-11T22:00:00Z')
    const q = buildQuote([item()], catalog(), late)
    expect(q.issues[0]?.code).toBe('lead_time_passed')
  })

  it('caps guests at the activity maximum', () => {
    const q = buildQuote([item({ quantity: 50 })], catalog(), NOW)
    expect(q.issues[0]?.code).toBe('guests_exceed_max')
  })

  it('rejects a zero or negative quantity', () => {
    expect(buildQuote([item({ quantity: 0 })], catalog(), NOW).ok).toBe(false)
    expect(buildQuote([item({ quantity: -3 })], catalog(), NOW).ok).toBe(false)
  })
})

describe('activity tier pricing', () => {
  const tier = (over: Partial<QuoteRequestItem> = {}): QuoteRequestItem =>
    item({ kind: 'activity_tier', refId: 'batur-premium', guests: 2, ...over })

  it('prices from the tier, not from the parent activity', () => {
    const q = buildQuote([tier()], catalog(), NOW)
    expect(q.ok).toBe(true)
    // 9900 is the tier's price. 5500 would mean it fell back to the activity,
    // which is the whole failure this feature must not have.
    expect(q.lines[0]?.unitPriceMinor).toBe(9900)
    expect(q.lines[0]?.lineTotalMinor).toBe(19_800)
  })

  it('multiplies a per-guest tier by the party size', () => {
    const q = buildQuote([tier({ guests: 4 })], catalog(), NOW)
    expect(q.lines[0]?.lineTotalMinor).toBe(39_600)
  })

  it('does NOT multiply a flat tier', () => {
    // A couples rate is for the couple. Charging it twice is the prototype's
    // bug in reverse and is the reason pricingMode exists at all.
    const q = buildQuote([tier({ refId: 'batur-couples', guests: 2 })], catalog(), NOW)
    expect(q.lines[0]?.quantity).toBe(1)
    expect(q.lines[0]?.lineTotalMinor).toBe(17_000)
  })

  it("honours the tier's own guest cap, which is tighter than the activity's", () => {
    // The activity seats 20; the couples tier seats 2.
    const q = buildQuote([tier({ refId: 'batur-couples', guests: 3 })], catalog(), NOW)
    expect(q.ok).toBe(false)
    expect(q.issues[0]?.code).toBe('guests_exceed_max')
    expect(q.issues[0]?.detail).toBe('2')
  })

  it("still enforces the parent activity's departure times", () => {
    // A tier is a price, not a different tour. It cannot be booked at a time
    // the activity does not run.
    const q = buildQuote([tier({ travelTime: '03:00' })], catalog(), NOW)
    expect(q.ok).toBe(false)
    expect(q.issues[0]?.code).toBe('invalid_time_slot')
  })

  it('rejects a tier whose parent activity is unpublished or gone', () => {
    const snapshot = catalog()
    snapshot.activities.delete('batur')
    const q = buildQuote([tier()], snapshot, NOW)
    expect(q.ok).toBe(false)
    expect(q.issues[0]?.code).toBe('unknown_item')
    expect(q.lines).toHaveLength(0)
  })
})

describe('unknown cart kinds', () => {
  it('refuses rather than silently dropping the line', () => {
    // Before the default clause this produced no line, no issue and no
    // contribution to the total: the customer saw an item in the cart and was
    // charged a price that excluded it, with nothing logged anywhere.
    const q = buildQuote(
      [item({ kind: 'subscription' as unknown as QuoteRequestItem['kind'] })],
      catalog(),
      NOW,
    )
    expect(q.ok).toBe(false)
    expect(q.issues[0]?.code).toBe('unsupported_kind')
    expect(q.lines).toHaveLength(0)
    expect(q.totalMinor).toBe(0)
  })
})

describe('driver pricing', () => {
  const driver = (over: Partial<QuoteRequestItem> = {}) =>
    item({ id: 'd1', kind: 'driver', refId: null, quantity: 1, travelTime: null, ...over })

  it('derives the vehicle and day count rather than trusting the client', () => {
    const q = buildQuote(
      [driver({ travelDate: '2026-08-12', endDate: '2026-08-14', guests: 6 })],
      catalog(),
      NOW,
    )
    expect(q.ok).toBe(true)
    // 6 passengers -> SUV at $70/day, 12th-14th inclusive = 3 days.
    expect(q.lines[0]?.vehicleClass).toBe('suv')
    expect(q.lines[0]?.quantity).toBe(3)
    expect(q.lines[0]?.lineTotalMinor).toBe(21_000)
  })

  it('treats a single-day booking as one day, not zero', () => {
    const q = buildQuote(
      [driver({ travelDate: '2026-08-12', endDate: '2026-08-12', guests: 2 })],
      catalog(),
      NOW,
    )
    expect(q.lines[0]?.quantity).toBe(1)
    expect(q.lines[0]?.lineTotalMinor).toBe(4500)
  })

  it('defaults a missing end date to the start date', () => {
    const q = buildQuote([driver({ travelDate: '2026-08-12', guests: 2 })], catalog(), NOW)
    expect(q.ok).toBe(true)
    expect(q.lines[0]?.quantity).toBe(1)
  })

  it('rejects a reversed date range instead of silently clamping it', () => {
    const q = buildQuote(
      [driver({ travelDate: '2026-08-14', endDate: '2026-08-12', guests: 2 })],
      catalog(),
      NOW,
    )
    expect(q.issues[0]?.code).toBe('invalid_date_range')
  })

  it('escalates the vehicle class at each boundary', () => {
    const forPax = (guests: number) =>
      buildQuote([driver({ travelDate: '2026-08-12', guests })], catalog(), NOW).lines[0]
        ?.vehicleClass
    expect(forPax(4)).toBe('sedan')
    expect(forPax(5)).toBe('suv')
    expect(forPax(7)).toBe('suv')
    expect(forPax(8)).toBe('van')
  })
})

describe('package pricing', () => {
  it('charges flat when pricingMode is flat, regardless of guests', () => {
    const q = buildQuote(
      [
        item({
          id: 'p1',
          kind: 'package',
          refId: 'pk_honey',
          quantity: 1,
          guests: 2,
          travelTime: null,
        }),
      ],
      catalog(),
      NOW,
    )
    expect(q.lines[0]?.lineTotalMinor).toBe(69_000)
  })

  it('multiplies by guests when pricingMode is per_guest', () => {
    const q = buildQuote(
      [
        item({
          id: 'p2',
          kind: 'package',
          refId: 'pk_family',
          quantity: 1,
          guests: 4,
          travelTime: null,
        }),
      ],
      catalog(),
      NOW,
    )
    // This is the contradiction the prototype never resolved: it collected
    // guests, displayed "from", then charged flat.
    expect(q.lines[0]?.lineTotalMinor).toBe(48_000)
  })

  it('enforces the package guest cap', () => {
    const q = buildQuote(
      [
        item({
          id: 'p3',
          kind: 'package',
          refId: 'pk_honey',
          quantity: 1,
          guests: 6,
          travelTime: null,
        }),
      ],
      catalog(),
      NOW,
    )
    expect(q.issues[0]?.code).toBe('guests_exceed_max')
  })
})

describe('itinerary pricing', () => {
  it('pins the version so a later edit cannot change what was bought', () => {
    const q = buildQuote(
      [
        item({
          id: 't1',
          kind: 'itinerary',
          refId: 'it7',
          quantity: 1,
          travelDate: null,
          travelTime: null,
        }),
      ],
      catalog(),
      NOW,
    )
    expect(q.ok).toBe(true)
    expect(q.lines[0]?.refVersion).toBe(3)
    expect(q.lines[0]?.lineTotalMinor).toBe(7900)
  })

  it('ignores quantity — a plan is bought once', () => {
    const q = buildQuote(
      [
        item({
          id: 't1',
          kind: 'itinerary',
          refId: 'it7',
          quantity: 5,
          travelDate: null,
          travelTime: null,
        }),
      ],
      catalog(),
      NOW,
    )
    expect(q.lines[0]?.quantity).toBe(1)
    expect(q.lines[0]?.lineTotalMinor).toBe(7900)
  })
})

describe('saved places', () => {
  it('produces a zero line rather than being dropped', () => {
    const q = buildQuote(
      [
        item({
          id: 'pl1',
          kind: 'place',
          refId: 'uluwatu',
          quantity: 1,
          travelDate: null,
          travelTime: null,
        }),
      ],
      catalog(),
      NOW,
    )
    expect(q.ok).toBe(true)
    expect(q.lines).toHaveLength(1)
    expect(q.lines[0]?.lineTotalMinor).toBe(0)
    expect(q.totalMinor).toBe(0)
  })
})

describe('whole-cart behaviour', () => {
  it('sums a mixed cart correctly', () => {
    const q = buildQuote(
      [
        item(),
        item({
          id: 'd1',
          kind: 'driver',
          refId: null,
          guests: 2,
          endDate: '2026-08-13',
          travelTime: null,
        }),
        item({ id: 't1', kind: 'itinerary', refId: 'it7', travelDate: null, travelTime: null }),
        item({ id: 'pl1', kind: 'place', refId: 'x', travelDate: null, travelTime: null }),
      ],
      catalog(),
      NOW,
    )
    expect(q.ok).toBe(true)
    // 11000 activity + 9000 driver (2 days x $45) + 7900 itinerary + 0
    expect(q.totalMinor).toBe(27_900)
  })

  it('an empty cart totals zero and is valid', () => {
    const q = buildQuote([], catalog(), NOW)
    expect(q.ok).toBe(true)
    expect(q.totalMinor).toBe(0)
  })

  it('collects issues from every bad line, not just the first', () => {
    const q = buildQuote(
      [item({ id: 'a', travelDate: null }), item({ id: 'b', refId: 'nope' })],
      catalog(),
      NOW,
    )
    expect(q.issues).toHaveLength(2)
    expect(q.ok).toBe(false)
  })
})

describe('quoteMatchesExpectation', () => {
  it('accepts a total that matches what the browser displayed', () => {
    const q = buildQuote([item()], catalog(), NOW)
    expect(quoteMatchesExpectation(q, 11_000)).toBe(true)
  })

  it('rejects a tampered or stale total', () => {
    const q = buildQuote([item()], catalog(), NOW)
    expect(quoteMatchesExpectation(q, 100)).toBe(false)
    expect(quoteMatchesExpectation(q, 10_999)).toBe(false)
  })

  it('never approves a quote that has issues, even if the total matches', () => {
    const q = buildQuote([item({ travelDate: null })], catalog(), NOW)
    expect(quoteMatchesExpectation(q, q.totalMinor)).toBe(false)
  })
})

describe('time-slot format tolerance', () => {
  // Regression: activities.time_slots is authored as HH:mm, but
  // cart_items.travel_time is a Postgres `time` column and reads back as
  // HH:mm:ss. Comparing raw strings never matched, which made every activity
  // with fixed departures unbookable with nothing the traveller could change.
  it('accepts HH:mm:ss from the database against HH:mm slots', () => {
    const q = buildQuote([item({ travelTime: '09:00:00' })], catalog(), NOW)
    expect(q.issues).toEqual([])
    expect(q.ok).toBe(true)
  })

  it('accepts HH:mm from a form against HH:mm slots', () => {
    expect(buildQuote([item({ travelTime: '09:00' })], catalog(), NOW).ok).toBe(true)
  })

  it('still rejects a time the activity does not offer', () => {
    expect(buildQuote([item({ travelTime: '03:00:00' })], catalog(), NOW).issues[0]?.code).toBe(
      'invalid_time_slot',
    )
  })
})
