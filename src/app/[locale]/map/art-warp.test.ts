import { describe, expect, it } from 'vitest'

import {
  ART_H,
  ART_W,
  CONTROL,
  artScaleForZoom,
  artToGeo,
  degPerArtPx,
  geoToArt,
  makeWarp,
  zoomFor,
} from './art-warp'
import { LANDMARKS, landmarkById } from './landmarks'

/**
 * The registration is the single source of where a site place lands on the
 * artwork and where the hand-off to the real map opens. A silent drift moves
 * every pin off its painted label while the page still renders perfectly.
 */
describe('art ↔ geo registration', () => {
  it('uses the landmarks’ verified coordinates for its control points', () => {
    for (const [, , id, lng, lat] of CONTROL) {
      expect(landmarkById(id)?.lng).toBe(lng)
      expect(landmarkById(id)?.lat).toBe(lat)
    }
  })

  it('lands every control point on its landmark (art → geo, 1e-6°)', () => {
    for (const [x, y, id] of CONTROL) {
      const l = landmarkById(id)
      expect(l).toBeDefined()
      const [lng, lat] = artToGeo(x, y)
      expect(Math.abs(lng - (l?.lng ?? 0))).toBeLessThan(1e-6)
      expect(Math.abs(lat - (l?.lat ?? 0))).toBeLessThan(1e-6)
    }
  })

  it('round-trips every control point (geo → art within 1 px)', () => {
    for (const [x, y, id] of CONTROL) {
      const l = landmarkById(id)
      const [ax, ay] = geoToArt(l?.lng ?? 0, l?.lat ?? 0)
      expect(Math.hypot(ax - x, ay - y)).toBeLessThan(1)
    }
  })

  it('round-trips points between the control points (art → geo → art)', () => {
    for (const [x, y] of [
      [700, 300],
      [1300, 700],
      [1600, 500],
      [1900, 1000],
      [1150, 1050],
    ] as const) {
      const [lng, lat] = artToGeo(x, y)
      const [bx, by] = geoToArt(lng, lat)
      expect(Math.hypot(bx - x, by - y)).toBeLessThan(1)
    }
  })

  it('keeps every landmark on the artwork', () => {
    for (const l of LANDMARKS) {
      const [x, y] = geoToArt(l.lng, l.lat)
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(ART_W)
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(ART_H)
    }
  })

  it('has north up and east to the right', () => {
    const a = artToGeo(1300, 300)
    const b = artToGeo(1300, 900)
    const c = artToGeo(2000, 600)
    const d = artToGeo(800, 600)
    expect(a[1]).toBeGreaterThan(b[1])
    expect(c[0]).toBeGreaterThan(d[0])
  })
})

describe('zoom matching', () => {
  it('artScaleForZoom inverts zoomFor', () => {
    for (const k of [0.4, 1, 1.6, 3]) {
      const z = zoomFor(1371, 641, k)
      expect(artScaleForZoom(1371, 641, z)).toBeCloseTo(k, 6)
    }
  })

  it('puts the whole-island view at a plausible MapLibre zoom', () => {
    // Fitting 2576 px into ~1000 screen px is a whole-island view (~zoom 8–9.5).
    const z = zoomFor(ART_W / 2, ART_H / 2, 1000 / ART_W)
    expect(z).toBeGreaterThan(7.5)
    expect(z).toBeLessThan(10)
    expect(degPerArtPx(1371, 641)).toBeGreaterThan(0)
  })
})

describe('makeWarp', () => {
  it('reproduces an exact affine map', () => {
    const src: [number, number][] = [
      [0, 0],
      [10, 0],
      [0, 10],
      [7, 3],
    ]
    const f = (x: number, y: number): [number, number] => [2 * x - y + 5, x + 3 * y - 1]
    const warp = makeWarp(
      src,
      src.map(([x, y]) => f(x, y)),
      50,
    )
    const [u, v] = warp(4, 6)
    expect(u).toBeCloseTo(f(4, 6)[0], 9)
    expect(v).toBeCloseTo(f(4, 6)[1], 9)
  })
})
