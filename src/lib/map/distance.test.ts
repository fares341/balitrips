import { describe, expect, it } from 'vitest'

import { centroid, formatDistance, haversineMeters } from './distance'

describe('haversine', () => {
  it('is zero for the same point and symmetric', () => {
    const a = { lat: -8.72, lon: 115.17 }
    const b = { lat: -8.507, lon: 115.263 }
    expect(haversineMeters(a, a)).toBe(0)
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6)
  })

  it('matches known distances', () => {
    // Kuta → Ubud ≈ 25.8 km
    const d = haversineMeters({ lat: -8.718, lon: 115.1686 }, { lat: -8.5069, lon: 115.2625 })
    expect(d / 1000).toBeGreaterThan(25)
    expect(d / 1000).toBeLessThan(26.5)
    // One degree of latitude ≈ 111.2 km
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) / 1000).toBeCloseTo(111.2, 0)
  })
})

describe('formatDistance', () => {
  it('uses metres under 1 km, rounded to 10', () => {
    expect(formatDistance(847, 'en')).toBe('850 m')
    expect(formatDistance(3, 'en')).toBe('10 m')
  })
  it('uses one decimal under 10 km, whole km above', () => {
    expect(formatDistance(3240, 'en')).toBe('3.2 km')
    expect(formatDistance(24_400, 'en')).toBe('24 km')
    expect(formatDistance(996, 'en')).toBe('1 km')
  })
  it('formats per locale', () => {
    expect(formatDistance(3240, 'id')).toBe('3,2 km')
    const ar = formatDistance(3240, 'ar')
    expect(ar).toMatch(/^[\d٠-٩][\d٠-٩.,٫]* /)
    expect(ar).toContain('كم')
    expect(formatDistance(500, 'ar')).toContain('م')
  })
  it('never prints a number for invalid input', () => {
    expect(formatDistance(Number.NaN, 'en')).toBe('')
    expect(formatDistance(-1, 'en')).toBe('')
  })
})

describe('centroid', () => {
  it('averages points, null for none', () => {
    expect(centroid([])).toBeNull()
    expect(
      centroid([
        { lat: 0, lon: 0 },
        { lat: 2, lon: 4 },
      ]),
    ).toEqual({ lat: 1, lon: 2 })
  })
})
