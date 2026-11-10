import { describe, expect, it } from 'vitest'

import { MAX_DEVICE_LIMIT } from '@/lib/security/config'

import { buildQuote, type CatalogSnapshot, type QuoteRequestItem } from './quote'
import {
  DEFAULT_MAX_DEVICES,
  clampPlanDevices,
  planDeviceRange,
  planDeviceSettingsError,
  planTotalMinor,
  sellsExtraDevices,
} from './plan-devices'

/** The owner's setup (Nov 2026): 1 device included, +50 SAR per extra. */
const PLAN = { priceMinor: 15_000, deviceLimit: 1, extraDevicePriceMinor: 5_000, maxDevices: 5 }

describe('plan device pricing', () => {
  it('n = 1 is the base price', () => {
    expect(planTotalMinor(PLAN, 1)).toEqual({ devices: 1, extraMinor: 0, totalMinor: 15_000 })
  })

  it('n = 3 adds two extra devices', () => {
    expect(planTotalMinor(PLAN, 3)).toEqual({ devices: 3, extraMinor: 10_000, totalMinor: 25_000 })
  })

  it('clamps above the max and below the included count', () => {
    expect(planTotalMinor(PLAN, 99).devices).toBe(5)
    expect(planTotalMinor(PLAN, 99).totalMinor).toBe(15_000 + 4 * 5_000)
    expect(clampPlanDevices(PLAN, 0)).toBe(1)
    expect(clampPlanDevices(PLAN, -3)).toBe(1)
    expect(clampPlanDevices(PLAN, '3')).toBe(3)
    expect(clampPlanDevices(PLAN, 'abc')).toBe(1)
    expect(clampPlanDevices(PLAN, 2.9)).toBe(2)
    expect(clampPlanDevices(PLAN, undefined)).toBe(1)
  })

  it('extra price 0/null: extras not sold, the count is the plan limit', () => {
    for (const extra of [0, null]) {
      const plan = { ...PLAN, deviceLimit: 2, extraDevicePriceMinor: extra }
      expect(sellsExtraDevices(plan)).toBe(false)
      expect(planDeviceRange(plan)).toEqual({ min: 2, max: 2 })
      expect(planTotalMinor(plan, 4)).toEqual({ devices: 2, extraMinor: 0, totalMinor: 15_000 })
    }
  })

  it('no max → the default cap, never above the absolute ceiling', () => {
    expect(planDeviceRange({ ...PLAN, maxDevices: null }).max).toBe(DEFAULT_MAX_DEVICES)
    expect(planDeviceRange({ ...PLAN, maxDevices: 10_000 }).max).toBe(MAX_DEVICE_LIMIT)
  })

  it('extras are counted above the included devices', () => {
    const plan = { ...PLAN, deviceLimit: 2 }
    expect(planTotalMinor(plan, 3).extraMinor).toBe(5_000)
  })
})

describe('buildQuote prices the device count on the server', () => {
  const catalog = (over: object = {}): CatalogSnapshot =>
    ({
      activities: new Map(),
      activityTiers: new Map(),
      itineraries: new Map(),
      packages: new Map(),
      vehicles: new Map(),
      plans: new Map([['p', { currency: 'SAR', ...PLAN, ...over }]]),
    }) as unknown as CatalogSnapshot
  const line = (devices?: number): QuoteRequestItem => ({
    id: 'l1',
    kind: 'plan',
    refId: 'p',
    quantity: 1,
    travelDate: null,
    travelTime: null,
    guests: null,
    endDate: null,
    parentItemId: null,
    options: devices === undefined ? null : { devices },
  })

  it('n = 3 → base + 2 × extra, and the line carries the count', () => {
    const q = buildQuote([line(3)], catalog())
    expect(q.ok).toBe(true)
    expect(q.totalMinor).toBe(25_000)
    expect(q.lines[0]?.devices).toEqual({ count: 3, extraMinor: 10_000 })
  })

  it('no count → the included devices at the base price', () => {
    const q = buildQuote([line()], catalog())
    expect(q.totalMinor).toBe(15_000)
    expect(q.lines[0]?.devices?.count).toBe(1)
  })

  it('a count above the max is clamped, never trusted', () => {
    expect(buildQuote([line(40)], catalog()).totalMinor).toBe(35_000)
  })

  it('extras not sold → the count is ignored', () => {
    const q = buildQuote([line(4)], catalog({ extraDevicePriceMinor: 0 }))
    expect(q.totalMinor).toBe(15_000)
    expect(q.lines[0]?.devices?.count).toBe(1)
  })
})

describe('Studio validation of the per-device fields', () => {
  const ok = { deviceLimit: 1, extraDevicePriceMinor: 5_000, maxDevices: 5 }
  it('accepts the owner setup and blanks', () => {
    expect(planDeviceSettingsError(ok)).toBeNull()
    expect(
      planDeviceSettingsError({ ...ok, extraDevicePriceMinor: null, maxDevices: null }),
    ).toBeNull()
    expect(planDeviceSettingsError({ ...ok, extraDevicePriceMinor: 0 })).toBeNull()
  })
  it('refuses a negative extra price', () => {
    expect(planDeviceSettingsError({ ...ok, extraDevicePriceMinor: -1 })).toBe('extra_price')
  })
  it('refuses a cap below the included devices or above the ceiling', () => {
    expect(planDeviceSettingsError({ ...ok, deviceLimit: 3, maxDevices: 2 })).toBe('max_devices')
    expect(planDeviceSettingsError({ ...ok, maxDevices: MAX_DEVICE_LIMIT + 1 })).toBe('max_devices')
  })
})
