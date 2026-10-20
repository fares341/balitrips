import { describe, expect, it } from 'vitest'

import type { OfferFacts } from '@/lib/suppliers/assign'

import { packageCost } from './cost'

const NOW = new Date('2026-10-20T00:00:00Z')

function offer(over: Partial<OfferFacts> & { id: string }): OfferFacts {
  return {
    supplierId: 's1',
    tierId: null,
    costMinor: 1000,
    currency: 'USD',
    timeSlots: [],
    confirmationMode: 'instant',
    confirmWithinHours: 24,
    leadTimeHours: null,
    active: true,
    priority: 0,
    supplierActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }
}

describe('package cost and margin', () => {
  it('sums the per-person cost of the supplier each booking would get', () => {
    const offers = new Map<string, OfferFacts[]>([
      ['a', [offer({ id: 'a1', costMinor: 2000 }), offer({ id: 'a2', costMinor: 1500 })]],
      ['b', [offer({ id: 'b1', costMinor: 3000 })]],
    ])
    const cost = packageCost({
      activityIds: ['a', 'b'],
      offersByActivity: offers,
      guests: 2,
      currency: 'USD',
      priceMinor: 20000,
      pricingMode: 'flat',
      now: NOW,
    })
    // Cheapest at equal priority: 1500 × 2 + 3000 × 2.
    expect(cost.totalMinor).toBe(9000)
    expect(cost.marginMinor).toBe(11000)
    expect(cost.marginBps).toBe(5500)
  })

  it('per-guest packages compare against the price for the party', () => {
    const offers = new Map([['a', [offer({ id: 'a1', costMinor: 1000 })]]])
    const cost = packageCost({
      activityIds: ['a'],
      offersByActivity: offers,
      guests: 2,
      currency: 'USD',
      priceMinor: 5000,
      pricingMode: 'per_guest',
      now: NOW,
    })
    expect(cost.priceMinor).toBe(10000)
    expect(cost.marginMinor).toBe(8000)
  })

  it('reports an incomplete cost instead of a wrong margin', () => {
    const cost = packageCost({
      activityIds: ['a', 'missing'],
      offersByActivity: new Map([['a', [offer({ id: 'a1' })]]]),
      guests: 1,
      currency: 'USD',
      priceMinor: 5000,
      pricingMode: 'flat',
      now: NOW,
    })
    expect(cost.missing).toBe(1)
    expect(cost.totalMinor).toBeNull()
    expect(cost.marginMinor).toBeNull()
  })

  it('ignores package-specific offers (package bookings have no service level)', () => {
    const cost = packageCost({
      activityIds: ['a'],
      offersByActivity: new Map([['a', [offer({ id: 'a1', tierId: 'tier-x' })]]]),
      guests: 1,
      currency: 'USD',
      priceMinor: 5000,
      pricingMode: 'flat',
      now: NOW,
    })
    expect(cost.missing).toBe(1)
  })
})
