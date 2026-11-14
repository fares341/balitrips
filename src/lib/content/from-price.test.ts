import { describe, expect, it } from 'vitest'

import { fromPrice, isRestrictedAudience, type FromPriceTier } from './from-price'

const tier = (over: Partial<FromPriceTier> & { key: string }): FromPriceTier => ({
  nameEn: null,
  priceMinor: 10000,
  currency: 'SAR',
  pricing: 'per_person',
  groupMax: null,
  available: true,
  isPopular: false,
  sortOrder: 0,
  ...over,
})
const activity = { priceMinor: 1000, currency: 'SAR' }

describe('fromPrice', () => {
  it('uses the base price, per person, when there are no packages', () => {
    expect(fromPrice(activity, [])).toMatchObject({ priceMinor: 1000, pricing: 'per_person' })
    expect(fromPrice({ priceMinor: 0, currency: 'SAR' }, [])).toBeNull()
  })

  it('has no price when no package can be bought', () => {
    expect(
      fromPrice(activity, [
        tier({ key: 'a', priceMinor: 0, available: false }),
        tier({ key: 'b', priceMinor: 0 }),
        tier({ key: 'c', available: false }),
        tier({ key: 'd', currency: 'USD' }),
      ]),
    ).toBeNull()
  })

  it('carries the unit of the package the price comes from', () => {
    expect(
      fromPrice(activity, [
        tier({ key: 'private', priceMinor: 42500, pricing: 'per_couple', groupMax: 2 }),
        tier({ key: 'shared', priceMinor: 32500, pricing: 'per_couple', groupMax: 2 }),
      ]),
    ).toMatchObject({ priceMinor: 32500, pricing: 'per_couple', tierKey: 'shared' })
  })

  it('skips a resident ticket and a companion pass', () => {
    expect(
      fromPrice(activity, [
        tier({ key: 'foreign-ticket', priceMinor: 2500, isPopular: true }),
        tier({ key: 'indonesian-ticket', priceMinor: 1000, sortOrder: 1 }),
      ]),
    ).toMatchObject({ priceMinor: 2500, tierKey: 'foreign-ticket' })
    expect(
      fromPrice(activity, [
        tier({ key: 'international-2-hours', priceMinor: 7500 }),
        tier({ key: 'toddler-2-hours', priceMinor: 4000, sortOrder: 2 }),
        tier({ key: 'p5', nameEn: 'Lounge Pass', priceMinor: 1000, sortOrder: 4 }),
      ]),
    ).toMatchObject({ priceMinor: 4000, tierKey: 'toddler-2-hours' })
  })

  it('still prices an activity that only sells restricted packages', () => {
    expect(fromPrice(activity, [tier({ key: 'local-ticket', priceMinor: 900 })])).toMatchObject({
      priceMinor: 900,
    })
  })

  it('breaks a price tie by «popular», then the owner order', () => {
    expect(
      fromPrice(activity, [
        tier({ key: 'group', pricing: 'per_group', groupMax: 2, priceMinor: 25000, sortOrder: 0 }),
        tier({ key: 'solo', priceMinor: 25000, sortOrder: 2, isPopular: true }),
      ]),
    ).toMatchObject({ tierKey: 'solo' })
  })
})

describe('isRestrictedAudience', () => {
  it('matches whole words only', () => {
    expect(isRestrictedAudience({ key: 'indonesian-ticket' })).toBe(true)
    expect(isRestrictedAudience({ key: 'x', nameEn: 'KITAS holder' })).toBe(true)
    expect(isRestrictedAudience({ key: 'lounge-pass' })).toBe(true)
    expect(isRestrictedAudience({ key: 'international-2-hours' })).toBe(false)
    expect(isRestrictedAudience({ key: 'locavore-dinner' })).toBe(false)
    expect(isRestrictedAudience({ key: 'glocal' })).toBe(false)
  })
})
