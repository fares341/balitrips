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

describe('suggestRoute', async () => {
  const { routeLengthKm, suggestRoute } = await import('./index')
  const ULUWATU = { lat: -8.8291, lon: 115.0849 }
  const SANUR = { lat: -8.6905, lon: 115.2626 }

  it('keeps the first stop and visits every place once', () => {
    const input = [KUTA, UBUD, SEMINYAK, ULUWATU, SANUR]
    const route = suggestRoute(input)
    expect(route[0]).toBe(KUTA)
    expect(new Set(route)).toEqual(new Set(input))
  })

  it('is never longer than the order the user typed', () => {
    const input = [KUTA, UBUD, ULUWATU, SEMINYAK, SANUR]
    expect(routeLengthKm(suggestRoute(input))).toBeLessThanOrEqual(routeLengthKm(input))
  })

  it('goes to the nearest place next (Kuta → Seminyak, not Ubud)', () => {
    expect(suggestRoute([KUTA, UBUD, SEMINYAK])[1]).toBe(SEMINYAK)
  })

  it('handles empty and tiny inputs', () => {
    expect(suggestRoute([])).toEqual([])
    expect(suggestRoute([KUTA])).toEqual([KUTA])
  })
})
