import { describe, expect, it } from 'vitest'

import { estimatePackage, packageDayPlan } from './estimate'
import { VEHICLES_DEFAULT, isLuxury, vehiclesFor, zoneFor, zoneUsdMinor } from './vehicles'

const standard = VEHICLES_DEFAULT.vehicles.find((v) => v.key === 'standard')!
const hiace = VEHICLES_DEFAULT.vehicles.find((v) => v.key === 'hiace')!
const ubud = { key: 'ubud', label: { en: 'Ubud', ar: 'أوبود', id: 'Ubud' } }
const kintamani = { key: 'kintamani', label: { en: 'Kintamani', ar: 'كينتاماني', id: 'Kintamani' } }

describe('vehicle zones', () => {
  it('converts SAR at the Studio rate and prefers a sheet USD', () => {
    expect(zoneUsdMinor(standard.zones[0]!, 3.75)).toBe(3733) // 140 / 3.75
    expect(zoneUsdMinor(hiace.zones[0]!, 3.75)).toBe(9000)
  })

  it('finds the zone by region name, Studio choice first, else zone 1', () => {
    expect(zoneFor(standard, kintamani)?.zone).toBe(3)
    expect(zoneFor(standard, ubud)?.zone).toBe(1)
    expect(zoneFor(standard, null)?.zone).toBe(1)
    expect(zoneFor({ ...standard, regionZones: { ubud: 2 } }, ubud)?.zone).toBe(2)
  })

  it('filters by capacity and marks luxury', () => {
    expect(vehiclesFor(VEHICLES_DEFAULT, 10).map((v) => v.key)).toEqual(['hiace'])
    expect(VEHICLES_DEFAULT.vehicles.filter(isLuxury)).toHaveLength(2)
  })
})

describe('estimatePackage', () => {
  it('sums activities per traveller and one driver day per day', () => {
    const days = packageDayPlan({
      days: 3,
      activities: [
        { id: 'a', priceMinor: 5000, currency: 'USD', region: kintamani },
        { id: 'b', priceMinor: 2000, currency: 'USD', region: ubud },
      ],
      activityDays: {},
      fallbackRegion: ubud,
    })
    const result = estimatePackage({ days, travellers: 2, vehicle: standard, sarPerUsd: 3.75 })
    expect(result.activitiesMinor).toBe(14000)
    expect(result.days.map((d) => d.zone)).toEqual([3, 1, 1])
    expect(result.driverMinor).toBe(4400 + 3733 + 3733)
    expect(result.totalMinor).toBe(14000 + 11866)
    expect(result.incomplete).toBe(false)
  })

  it('flags an activity in another currency instead of adding it', () => {
    const result = estimatePackage({
      days: [{ activities: [{ priceMinor: 100, currency: 'IDR' }], region: null }],
      travellers: 1,
      vehicle: standard,
      sarPerUsd: 3.75,
    })
    expect(result.activitiesMinor).toBe(0)
    expect(result.incomplete).toBe(true)
  })
})
