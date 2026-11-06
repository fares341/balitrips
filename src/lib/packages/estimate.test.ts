import { describe, expect, it } from 'vitest'

import { estimatePackage, packageDayPlan } from './estimate'
import { VEHICLES_DEFAULT, isLuxury, vehiclesFor, zoneFor, zoneSarMinor } from './vehicles'

const standard = VEHICLES_DEFAULT.vehicles.find((v) => v.key === 'standard')!
const hiace = VEHICLES_DEFAULT.vehicles.find((v) => v.key === 'hiace')!
const ubud = { key: 'ubud', label: { en: 'Ubud', ar: 'أوبود', id: 'Ubud' } }
const kintamani = { key: 'kintamani', label: { en: 'Kintamani', ar: 'كينتاماني', id: 'Kintamani' } }

describe('vehicle zones', () => {
  it('uses the sheet SAR, and converts a USD-only zone at the Studio rate', () => {
    expect(zoneSarMinor(standard.zones[0]!, 3.75)).toBe(14000) // 140 SAR
    expect(zoneSarMinor({ zone: 9, areas: '', sar: null, idr: null, usd: 24 }, 3.75)).toBe(9000)
    expect(zoneSarMinor({ zone: 9, areas: '', sar: null, idr: null, usd: null }, 3.75)).toBeNull()
    expect(hiace.zones.length).toBeGreaterThan(0)
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
        { id: 'a', priceMinor: 5000, currency: 'SAR', region: kintamani },
        { id: 'b', priceMinor: 2000, currency: 'SAR', region: ubud },
      ],
      activityDays: {},
      fallbackRegion: ubud,
    })
    const result = estimatePackage({ days, travellers: 2, vehicle: standard, sarPerUsd: 3.75 })
    expect(result.activitiesMinor).toBe(14000)
    expect(result.days.map((d) => d.zone)).toEqual([3, 1, 1])
    expect(result.driverMinor).toBe(16500 + 14000 + 14000)
    expect(result.totalMinor).toBe(14000 + 44500)
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
