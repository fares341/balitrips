import { describe, expect, it } from 'vitest'

import {
  addonCostMinor,
  addonState,
  addonUnitPriceMinor,
  packageCostMinor,
  priceBooking,
  resolveAddons,
  tierPricing,
  type AddonRule,
  type PackageRule,
} from './price'

// Activity page v2: the client spec's worked example and the new rules.
const pkg = (over: Partial<PackageRule> = {}): PackageRule => ({
  id: 'basic',
  priceMinor: 12000,
  currency: 'USD',
  pricing: 'per_person',
  groupMax: null,
  includesAddons: [],
  ...over,
})

const addon = (over: Partial<AddonRule> & Pick<AddonRule, 'id'>): AddonRule => ({
  priceMinor: 1000,
  currency: 'USD',
  pricing: 'per_booking',
  maxQty: null,
  onlyPackages: [],
  requiresAddonId: null,
  available: true,
  ...over,
})

describe('client spec example', () => {
  it('Basic $120 × 2 + drone $40 per booking + lunch $15 × 2 = $310', () => {
    const drone = addon({ id: 'drone', priceMinor: 4000, pricing: 'per_booking' })
    const lunch = addon({ id: 'lunch', priceMinor: 1500, pricing: 'per_person' })
    const price = priceBooking({
      pkg: pkg(),
      addons: [drone, lunch],
      picks: [
        { id: 'drone', qty: 1 },
        { id: 'lunch', qty: 1 },
      ],
      people: 2,
    })
    expect(price.packageMinor).toBe(24000)
    expect(price.addonsMinor).toBe(7000)
    expect(price.totalMinor).toBe(31000)
    const lunchLine = price.lines.find((line) => line.refId === 'lunch')
    expect(lunchLine).toMatchObject({ unitMinor: 1500, quantity: 2, totalMinor: 3000 })
  })

  it('a couples package at $180 for two is never doubled', () => {
    const couples = pkg({ id: 'couples', priceMinor: 18000, pricing: 'per_couple' })
    expect(packageCostMinor(couples, 2)).toBe(18000)
  })
})

describe('fixed package price', () => {
  it('one price whatever the party', () => {
    const fixed = pkg({ pricing: 'fixed', priceMinor: 50000 })
    expect(packageCostMinor(fixed, 1)).toBe(50000)
    expect(packageCostMinor(fixed, 9)).toBe(50000)
    expect(tierPricing('fixed')).toBe('fixed')
    expect(tierPricing('flat')).toBe('per_group')
  })
})

describe('per hour and tiered add-ons', () => {
  it('per hour charges hours up to the cap', () => {
    const guide = addon({ id: 'guide', priceMinor: 2000, pricing: 'per_hour', maxQty: 4 })
    expect(addonCostMinor(guide, 2, 3)).toBe(6000)
    expect(addonCostMinor(guide, 2, 9)).toBe(8000)
  })

  it('tiered uses the step reached by the quantity', () => {
    const kayak = addon({
      id: 'kayak',
      priceMinor: 3000,
      pricing: 'tiered',
      priceTiers: [
        { minQty: 3, priceMinor: 2500 },
        { minQty: 6, priceMinor: 2000 },
      ],
    })
    expect(addonUnitPriceMinor(kayak, 1)).toBe(3000)
    expect(addonCostMinor(kayak, 1, 2)).toBe(6000)
    expect(addonCostMinor(kayak, 1, 4)).toBe(10000)
    expect(addonCostMinor(kayak, 1, 6)).toBe(12000)
    const price = priceBooking({
      pkg: pkg(),
      addons: [kayak],
      picks: [{ id: 'kayak', qty: 4 }],
      people: 1,
    })
    expect(price.lines.find((line) => line.refId === 'kayak')).toMatchObject({
      unitMinor: 2500,
      quantity: 4,
      totalMinor: 10000,
    })
  })
})

describe('incompatible add-ons', () => {
  const transfer = addon({ id: 'transfer', priceMinor: 3500, incompatibleWith: ['self'] })
  const self = addon({ id: 'self', priceMinor: 0 })

  it('the second of a clashing pair is rejected, checked both ways', () => {
    const one = resolveAddons([transfer, self], pkg(), [
      { id: 'self', qty: 1 },
      { id: 'transfer', qty: 1 },
    ])
    expect(one.accepted.map((a) => a.id)).toEqual(['self'])
    expect(one.rejected).toEqual([{ id: 'transfer', reason: 'incompatible' }])
  })

  it('the page shows the clash', () => {
    expect(addonState(transfer, pkg(), new Set(['self']))).toEqual({
      kind: 'incompatible',
      withAddonId: 'self',
    })
  })
})
