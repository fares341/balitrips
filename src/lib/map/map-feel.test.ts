import { describe, expect, it } from 'vitest'

import {
  CLUSTER_MAX_ZOOM,
  CLUSTER_MIN_POINTS,
  CLUSTER_RADIUS,
  FIT_MS,
  PIN_SIZE_BY_ZOOM,
  PIN_W,
  PIN_W_ON,
  SYMBOL_FADE_MS,
} from './map-feel'

/** Evaluates the ['interpolate', ['linear'], ['zoom'], z0, v0, z1, v1] stop list. */
function sizeAt(zoom: number): number {
  const stops = PIN_SIZE_BY_ZOOM.slice(3) as number[]
  const pairs: [number, number][] = []
  for (let i = 0; i < stops.length; i += 2) pairs.push([stops[i]!, stops[i + 1]!])
  if (zoom <= pairs[0]![0]) return pairs[0]![1]
  const last = pairs[pairs.length - 1]!
  if (zoom >= last[0]) return last[1]
  for (let i = 1; i < pairs.length; i += 1) {
    const [z0, v0] = pairs[i - 1]!
    const [z1, v1] = pairs[i]!
    if (zoom <= z1) return v0 + ((zoom - z0) / (z1 - z0)) * (v1 - v0)
  }
  return last[1]
}

describe('map feel (Tiqets reference)', () => {
  it('pins are ~20–24px wide at whole-island zoom, our full size when zoomed in', () => {
    const island = PIN_W * sizeAt(8.5)
    expect(island).toBeGreaterThanOrEqual(19)
    expect(island).toBeLessThanOrEqual(24)
    expect(PIN_W * sizeAt(14)).toBe(PIN_W)
    // Grows monotonically between the stops.
    expect(sizeAt(10)).toBeGreaterThan(sizeAt(9))
    expect(sizeAt(11)).toBeGreaterThan(sizeAt(10))
  })

  it('the selected pin stays about 1.3–1.4× larger', () => {
    const ratio = PIN_W_ON / PIN_W
    expect(ratio).toBeGreaterThanOrEqual(1.3)
    expect(ratio).toBeLessThanOrEqual(1.4)
  })

  it('clusters only merge true overlaps, and stop before street zoom', () => {
    expect(CLUSTER_RADIUS).toBeGreaterThanOrEqual(12)
    expect(CLUSTER_RADIUS).toBeLessThanOrEqual(18)
    expect(CLUSTER_MAX_ZOOM).toBeLessThanOrEqual(12)
    expect(CLUSTER_MIN_POINTS).toBeGreaterThanOrEqual(2)
  })

  it('motion stays short', () => {
    expect(FIT_MS).toBeGreaterThanOrEqual(400)
    expect(FIT_MS).toBeLessThanOrEqual(800)
    expect(SYMBOL_FADE_MS).toBeLessThan(300)
  })
})
