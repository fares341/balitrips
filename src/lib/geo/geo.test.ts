import { describe, expect, it } from 'vitest'

import { boundingBox, haversineKm, isInBali, parseLatLon } from './index'

const KUTA = { lat: -8.7186, lon: 115.1686 }
const SEMINYAK = { lat: -8.6913, lon: 115.1682 }
const UBUD = { lat: -8.5069, lon: 115.2625 }

describe('geo', () => {
  it('measures Kuta → Seminyak (~3 km) and Kuta → Ubud (~25 km)', () => {
    expect(haversineKm(KUTA, SEMINYAK)).toBeGreaterThan(2.7)
    expect(haversineKm(KUTA, SEMINYAK)).toBeLessThan(3.4)
    expect(haversineKm(KUTA, UBUD)).toBeGreaterThan(24)
    expect(haversineKm(KUTA, UBUD)).toBeLessThan(27)
  })
  it('builds a box that contains the circle', () => {
    const box = boundingBox(KUTA, 5)
    expect(SEMINYAK.lat).toBeGreaterThan(box.minLat)
    expect(SEMINYAK.lat).toBeLessThan(box.maxLat)
    expect(UBUD.lat).toBeGreaterThan(box.maxLat)
  })
  it('recognises Bali and rejects elsewhere', () => {
    expect(isInBali(UBUD)).toBe(true)
    expect(isInBali({ lat: 24.71, lon: 46.67 })).toBe(false) // Riyadh
  })
  it('parses and validates coordinates', () => {
    expect(parseLatLon('-8.7', '115.1')).toEqual({ lat: -8.7, lon: 115.1 })
    expect(parseLatLon('abc', '1')).toBeNull()
    expect(parseLatLon('95', '1')).toBeNull()
  })
})
