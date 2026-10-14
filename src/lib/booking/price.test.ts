import { describe, expect, it } from 'vitest'

import {
  addonCostMinor,
  addonState,
  driverDays,
  packageCostMinor,
  priceBooking,
  resolveAddons,
  tierPricing,
  vehicleFor,
  type AddonRule,
  type PackageRule,
  type VehicleRate,
} from './price'

// The handoff's worked example: Nusa Dua water sports (USD, minor units).
const basic: PackageRule = {
  id: 'basic',
  priceMinor: 4500,
  currency: 'USD',
  pricing: 'per_person',
  groupMax: null,
  includesAddons: [],
}
const plus: PackageRule = { ...basic, id: 'plus', priceMinor: 7900, includesAddons: ['banana'] }
const family: PackageRule = {
  id: 'family',
  priceMinor: 16000,
  currency: 'USD',
  pricing: 'per_group',
  groupMax: 4,
  includesAddons: ['banana'],
}

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

const banana = addon({ id: 'banana', priceMinor: 1500, pricing: 'per_person' })
const photo = addon({ id: 'photo', priceMinor: 2500 })
const extraRide = addon({
  id: 'extra-ride',
  priceMinor: 2000,
  pricing: 'per_qty',
  maxQty: 3,
  onlyPackages: ['basic', 'plus'],
})
const video = addon({ id: 'video', priceMinor: 1800, requiresAddonId: 'photo' })
const edit = addon({ id: 'edit', priceMinor: 900, requiresAddonId: 'video' })
const ADDONS = [banana, photo, extraRide, video, edit]

const VEHICLES: VehicleRate[] = [
  { vehicleClass: 'sedan', dayRateMinor: 5500, currency: 'USD' },
  { vehicleClass: 'suv', dayRateMinor: 7000, currency: 'USD' },
  { vehicleClass: 'van', dayRateMinor: 9500, currency: 'USD' },
]

describe('package cost', () => {
  it('per_person multiplies by people', () => {
    expect(packageCostMinor(basic, 3)).toBe(13500)
  })
  it('per_group charges ceil(people / group_max) groups', () => {
    expect(packageCostMinor(family, 1)).toBe(16000)
    expect(packageCostMinor(family, 4)).toBe(16000)
    expect(packageCostMinor(family, 5)).toBe(32000)
    expect(packageCostMinor(family, 9)).toBe(48000)
  })
  it('per_group without a group size is one unit for the party', () => {
    expect(packageCostMinor({ ...family, groupMax: null }, 7)).toBe(16000)
  })
  it('reads the pre-0013 spelling', () => {
    expect(tierPricing('per_guest')).toBe('per_person')
    expect(tierPricing('flat')).toBe('per_group')
    expect(tierPricing('per_group')).toBe('per_group')
    expect(tierPricing(undefined)).toBe('per_person')
  })
})

describe('add-on cost', () => {
  it('per_person × people', () => {
    expect(addonCostMinor(banana, 3, 1)).toBe(4500)
  })
  it('per_booking once', () => {
    expect(addonCostMinor(photo, 6, 1)).toBe(2500)
  })
  it('per_qty × min(qty, max_qty)', () => {
    expect(addonCostMinor(extraRide, 2, 2)).toBe(4000)
    expect(addonCostMinor(extraRide, 2, 9)).toBe(6000)
  })
})

describe('add-on rules', () => {
  it('included in the package → included state', () => {
    expect(addonState(banana, plus, new Set()).kind).toBe('included')
  })
  it('only_packages excluding the package → not_for_package', () => {
    expect(addonState(extraRide, family, new Set()).kind).toBe('not_for_package')
    expect(addonState(extraRide, basic, new Set()).kind).toBe('selectable')
  })
  it('requires another add-on → requires until it is selected', () => {
    expect(addonState(video, basic, new Set())).toEqual({
      kind: 'requires',
      requiresAddonId: 'photo',
    })
    expect(addonState(video, basic, new Set(['photo'])).kind).toBe('selectable')
  })
  it('unavailable add-on', () => {
    expect(addonState({ ...photo, available: false }, basic, new Set()).kind).toBe('unavailable')
  })
  it('a requirement included in the package is satisfied', () => {
    const needsBanana = addon({ id: 'tube', requiresAddonId: 'banana' })
    expect(addonState(needsBanana, plus, new Set()).kind).toBe('selectable')
  })
})

describe('resolveAddons', () => {
  it('drops dependents of a rejected add-on, transitively', () => {
    const r = resolveAddons(ADDONS, basic, [
      { id: 'video', qty: 1 },
      { id: 'edit', qty: 1 },
    ])
    expect(r.accepted).toEqual([])
    expect(r.rejected.map((x) => x.id)).toEqual(['video', 'edit'])
  })
  it('keeps a chain whose root is selected', () => {
    const r = resolveAddons(ADDONS, basic, [
      { id: 'photo', qty: 1 },
      { id: 'video', qty: 1 },
      { id: 'edit', qty: 1 },
    ])
    expect(r.accepted.map((x) => x.id)).toEqual(['photo', 'video', 'edit'])
  })
  it('rejects only_packages violations, unknown, duplicate and bad qty', () => {
    const r = resolveAddons(ADDONS, family, [
      { id: 'extra-ride', qty: 1 },
      { id: 'nope', qty: 1 },
      { id: 'photo', qty: 1 },
      { id: 'photo', qty: 1 },
      { id: 'video', qty: 0 },
    ])
    expect(r.accepted).toEqual([{ id: 'photo', qty: 1 }])
    // Shape errors first (in request order), then rule violations.
    expect(r.rejected).toEqual([
      { id: 'nope', reason: 'unknown' },
      { id: 'photo', reason: 'duplicate' },
      { id: 'video', reason: 'invalid_qty' },
      { id: 'extra-ride', reason: 'not_for_package' },
    ])
  })
  it('never charges an included add-on, picked or not', () => {
    const r = resolveAddons(ADDONS, plus, [{ id: 'banana', qty: 1 }])
    expect(r.accepted).toEqual([])
    expect(r.included).toEqual(['banana'])
    expect(r.rejected).toEqual([])
  })
  it('clamps per_qty quantities and normalises the rest to 1', () => {
    const r = resolveAddons(ADDONS, basic, [
      { id: 'extra-ride', qty: 7 },
      { id: 'photo', qty: 4 },
    ])
    expect(r.accepted).toEqual([
      { id: 'extra-ride', qty: 3 },
      { id: 'photo', qty: 1 },
    ])
  })
  it('rejects an add-on in another currency', () => {
    const r = resolveAddons([{ ...photo, currency: 'IDR' }], basic, [{ id: 'photo', qty: 1 }])
    expect(r.rejected).toEqual([{ id: 'photo', reason: 'currency' }])
  })
})

describe('driver', () => {
  it('vehicleFor: 1-4 sedan, 5-7 suv, 8+ van', () => {
    expect(vehicleFor(4)).toBe('sedan')
    expect(vehicleFor(5)).toBe('suv')
    expect(vehicleFor(8)).toBe('van')
  })
  it('days = 1 for a single-day activity, the range for a multi-day one', () => {
    expect(driverDays(false, '2026-10-20', '2026-10-23')).toBe(1)
    expect(driverDays(true, '2026-10-20', '2026-10-23')).toBe(4)
    expect(driverDays(true, '2026-10-20', null)).toBe(1)
  })
})

describe('priceBooking — total = package + Σ add-ons + driver', () => {
  it('the screen example: basic × 2, no extras = 90', () => {
    const p = priceBooking({ pkg: basic, addons: ADDONS, picks: [], people: 2 })
    expect(p.totalMinor).toBe(9000)
    expect(p.lines).toEqual([
      { kind: 'package', refId: 'basic', unitMinor: 4500, quantity: 2, totalMinor: 9000 },
    ])
  })
  it('adds every kind of add-on and a one-day driver', () => {
    const p = priceBooking({
      pkg: basic,
      addons: ADDONS,
      picks: [
        { id: 'banana', qty: 1 },
        { id: 'photo', qty: 1 },
        { id: 'extra-ride', qty: 2 },
      ],
      people: 3,
      driver: { vehicles: VEHICLES, days: 1 },
    })
    // 3×45 + 3×15 + 25 + 2×20 + 55
    expect(p.packageMinor).toBe(13500)
    expect(p.addonsMinor).toBe(4500 + 2500 + 4000)
    expect(p.driverMinor).toBe(5500)
    expect(p.totalMinor).toBe(13500 + 11000 + 5500)
    expect(p.vehicleClass).toBe('sedan')
  })
  it('family package: groups, included banana at zero, suv driver over 3 days', () => {
    const p = priceBooking({
      pkg: family,
      addons: ADDONS,
      picks: [{ id: 'banana', qty: 1 }],
      people: 6,
      driver: { vehicles: VEHICLES, days: 3 },
    })
    expect(p.packageMinor).toBe(32000)
    expect(p.addonsMinor).toBe(0)
    expect(p.driverMinor).toBe(21000)
    expect(p.totalMinor).toBe(53000)
    expect(p.lines[1]).toEqual({
      kind: 'addon',
      refId: 'banana',
      unitMinor: 0,
      quantity: 1,
      totalMinor: 0,
      included: true,
    })
  })
  it('a driver with no rate in the package currency is flagged, not priced', () => {
    const p = priceBooking({
      pkg: basic,
      addons: [],
      picks: [],
      people: 2,
      driver: { vehicles: [{ vehicleClass: 'sedan', dayRateMinor: 1, currency: 'IDR' }], days: 1 },
    })
    expect(p.driverUnavailable).toBe(true)
    expect(p.totalMinor).toBe(9000)
  })
})
