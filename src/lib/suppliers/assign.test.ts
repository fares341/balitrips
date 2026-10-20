import { describe, expect, it } from 'vitest'

import {
  confirmationPromise,
  lineCostMinor,
  pickOffer,
  type BookingFacts,
  type OfferFacts,
} from './assign'

const NOW = new Date('2026-08-01T00:00:00Z')

const offer = (over: Partial<OfferFacts>): OfferFacts => ({
  id: 'o1',
  supplierId: 's1',
  tierId: null,
  costMinor: 4000,
  currency: 'USD',
  timeSlots: [],
  confirmationMode: 'needs_supplier_confirmation',
  confirmWithinHours: 24,
  leadTimeHours: null,
  active: true,
  priority: 0,
  supplierActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
})

const booking: BookingFacts = {
  tierId: 'premium',
  travelDate: '2026-08-12',
  travelTime: '09:00:00',
}

describe('supplier auto-assignment', () => {
  it('no offers: nobody is assigned', () => {
    expect(pickOffer([], booking, NOW)).toBeNull()
  })

  it('skips inactive offers and paused suppliers', () => {
    const offers = [
      offer({ id: 'off', active: false, priority: 9 }),
      offer({ id: 'paused', supplierActive: false, priority: 9 }),
      offer({ id: 'ok' }),
    ]
    expect(pickOffer(offers, booking, NOW)?.id).toBe('ok')
  })

  it('an offer for another package does not fit; one for all packages does', () => {
    const offers = [offer({ id: 'basic', tierId: 'basic' }), offer({ id: 'all', tierId: null })]
    expect(pickOffer(offers, booking, NOW)?.id).toBe('all')
  })

  it('respects the departures and the notice the supplier needs', () => {
    const offers = [
      offer({ id: 'afternoon', timeSlots: ['14:00'] }),
      offer({ id: 'notice', leadTimeHours: 24 * 30 }),
      offer({ id: 'morning', timeSlots: ['09:00'] }),
    ]
    expect(pickOffer(offers, booking, NOW)?.id).toBe('morning')
  })

  it('highest priority, then package-specific, then cheaper, then oldest', () => {
    expect(
      pickOffer(
        [offer({ id: 'a', priority: 1, costMinor: 9000 }), offer({ id: 'b', costMinor: 1000 })],
        booking,
        NOW,
      )?.id,
    ).toBe('a')
    expect(
      pickOffer(
        [offer({ id: 'general' }), offer({ id: 'specific', tierId: 'premium', costMinor: 9000 })],
        booking,
        NOW,
      )?.id,
    ).toBe('specific')
    expect(
      pickOffer(
        [offer({ id: 'dear', costMinor: 5000 }), offer({ id: 'cheap', costMinor: 3000 })],
        booking,
        NOW,
      )?.id,
    ).toBe('cheap')
    expect(
      pickOffer(
        [
          offer({ id: 'new', createdAt: new Date('2026-05-01T00:00:00Z') }),
          offer({ id: 'old', createdAt: new Date('2026-02-01T00:00:00Z') }),
        ],
        booking,
        NOW,
      )?.id,
    ).toBe('old')
  })

  it('tells the customer instant or "within N hours", and nothing without offers', () => {
    expect(confirmationPromise([], booking, NOW)).toBeNull()
    expect(confirmationPromise([offer({ confirmationMode: 'instant' })], booking, NOW)).toEqual({
      instant: true,
    })
    expect(confirmationPromise([offer({ confirmWithinHours: 6 })], booking, NOW)).toEqual({
      instant: false,
      hours: 6,
    })
    // Offers exist but none fits this departure: the slowest promise.
    expect(
      confirmationPromise(
        [
          offer({ timeSlots: ['14:00'], confirmWithinHours: 12 }),
          offer({ timeSlots: ['16:00'], confirmWithinHours: 48 }),
        ],
        booking,
        NOW,
      ),
    ).toEqual({ instant: false, hours: 48 })
  })

  it('costs per person for per-person packages, per unit otherwise', () => {
    expect(lineCostMinor(offer({ costMinor: 4000 }), 'per_person', 3, 3)).toBe(12000)
    expect(lineCostMinor(offer({ costMinor: 15000 }), 'per_group', 5, 2)).toBe(30000)
    expect(lineCostMinor(offer({ costMinor: 9000 }), 'per_couple', 4, 2)).toBe(18000)
  })
})
