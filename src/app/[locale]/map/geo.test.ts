import { describe, expect, it } from 'vitest'

import { circleRing, declutter, inBounds } from './geo'

describe('circleRing', () => {
  it('is closed and roughly the requested radius', () => {
    const ring = circleRing({ lat: -8.5, lon: 115.26 }, 6, 32)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    const east = ring[0]
    expect(east).toBeDefined()
    // 6 km east of 115.26 at 8.5°S ≈ +0.0546°
    expect((east?.[0] ?? 0) - 115.26).toBeCloseTo(0.0546, 3)
  })
})

describe('declutter', () => {
  it('separates overlapping bubbles', () => {
    const boxes = [
      { x: 100, y: 100, w: 120, h: 40 },
      { x: 110, y: 105, w: 120, h: 40 },
    ]
    const out = declutter(boxes)
    const a = { x: 100 + (out[0]?.ox ?? 0), y: 100 + (out[0]?.oy ?? 0) }
    const b = { x: 110 + (out[1]?.ox ?? 0), y: 105 + (out[1]?.oy ?? 0) }
    const overlapX = 120 - Math.abs(a.x - b.x)
    const overlapY = 40 - Math.abs(a.y - b.y)
    expect(overlapX <= 0 || overlapY <= 0).toBe(true)
  })

  it('leaves separate bubbles where they are', () => {
    const out = declutter([
      { x: 0, y: 0, w: 50, h: 20 },
      { x: 300, y: 300, w: 50, h: 20 },
    ])
    expect(out).toEqual([
      { ox: 0, oy: 0 },
      { ox: 0, oy: 0 },
    ])
  })
})

describe('inBounds', () => {
  it('accepts a point inside and rejects one outside', () => {
    const b = { west: 115, east: 115.5, north: -8.3, south: -8.8 }
    expect(inBounds(b, -8.5, 115.26)).toBe(true)
    expect(inBounds(b, -8.2, 115.26)).toBe(false)
  })
})
