import { describe, expect, it } from 'vitest'

import { buildQuote, type CatalogSnapshot, type QuoteRequestItem } from '@/lib/pricing/quote'

import { includedOrderItems } from './included-items'

const NOW = new Date('2026-08-01T00:00:00Z')

function catalog(): CatalogSnapshot {
  const activity = (timeSlots: string[]) => ({
    priceMinor: 3000,
    currency: 'USD',
    maxGuests: 10,
    leadTimeHours: 24,
    timeSlots,
  })
  return {
    activities: new Map([
      ['ubud', activity(['09:00'])],
      ['swing', activity([])],
      ['terraces', activity(['08:00', '15:00'])],
    ]),
    activityTiers: new Map([
      [
        'ubud-full',
        {
          activityId: 'ubud',
          priceMinor: 9000,
          currency: 'USD',
          pricingMode: 'per_person',
          maxGuests: null,
          includedActivities: [
            { activityId: 'swing', timing: 'same_slot' as const },
            { activityId: 'terraces', timing: 'own_slot' as const },
          ],
        },
      ],
    ]),
    itineraries: new Map(),
    plans: new Map(),
    packages: new Map(),
    vehicles: new Map(),
  }
}

const booking: QuoteRequestItem = {
  id: 'cart-1',
  kind: 'activity_tier',
  refId: 'ubud-full',
  quantity: 3,
  travelDate: '2026-08-20',
  travelTime: '09:00',
  guests: 3,
  endDate: null,
  parentItemId: null,
  options: { included: [{ activityId: 'terraces', time: '15:00' }] },
}

describe('included activities at checkout', () => {
  it('become their own zero-priced order items under the package line', () => {
    const quote = buildQuote([booking], catalog(), NOW)
    expect(quote.ok).toBe(true)
    expect(quote.totalMinor).toBe(27000)

    const names = new Map([
      ['part:swing', { en: 'Ubud swing', ar: 'أرجوحة أوبود', id: 'Ayunan Ubud' }],
      ['part:terraces', { en: 'Rice terraces', ar: 'مدرجات الأرز', id: 'Sawah' }],
    ])
    const items = includedOrderItems(
      quote,
      [booking],
      new Map([['cart-1', 'order-item-1']]),
      'order-1',
      names,
    )
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      orderId: 'order-1',
      kind: 'activity',
      refId: 'swing',
      unitPriceMinor: 0,
      lineTotalMinor: 0,
      quantity: 3,
      guests: 3,
      travelDate: '2026-08-20',
      // Same slot: the package's own time.
      travelTime: '09:00',
      parentItemId: 'order-item-1',
      options: { includedInTier: 'ubud-full' },
      nameSnapshot: { en: 'Ubud swing' },
    })
    // Own slot: the time the traveller picked.
    expect(items[1]).toMatchObject({ refId: 'terraces', travelTime: '15:00' })
    // Nothing is added to what is charged.
    expect(items.reduce((sum, item) => sum + (item.lineTotalMinor ?? 0), 0)).toBe(0)
  })

  it('a package without included activities adds no items', () => {
    const c = catalog()
    const tier = c.activityTiers.get('ubud-full')
    if (tier) c.activityTiers.set('ubud-full', { ...tier, includedActivities: [] })
    const quote = buildQuote([{ ...booking, options: null }], c, NOW)
    expect(quote.ok).toBe(true)
    expect(
      includedOrderItems(quote, [booking], new Map([['cart-1', 'x']]), 'o', new Map()),
    ).toEqual([])
  })

  it('an included activity that is no longer sold is left out, not charged', () => {
    const c = catalog()
    c.activities.delete('swing')
    const quote = buildQuote([booking], c, NOW)
    expect(quote.ok).toBe(true)
    const items = includedOrderItems(quote, [booking], new Map([['cart-1', 'x']]), 'o', new Map())
    expect(items.map((item) => item.refId)).toEqual(['terraces'])
  })
})
