import { describe, expect, it } from 'vitest'

import { IMAGE_BOUNDS, IMAGE_SIZE, circleRing, declutter, geoToImagePx, imageCorners } from './geo'

/**
 * The georeference is the map's single source of position: a silent drift
 * moves every pin off its landmark while the page still renders perfectly.
 */
describe('image georeference', () => {
  it('solves the package formula to the documented corners', () => {
    expect(IMAGE_BOUNDS.west).toBeCloseTo(114.0382, 4)
    expect(IMAGE_BOUNDS.east).toBeCloseTo(116.1001, 4)
    expect(IMAGE_BOUNDS.north).toBeCloseTo(-7.7504, 4)
    expect(IMAGE_BOUNDS.south).toBeCloseTo(-9.1589, 4)
  })

  it('maps the corners to the raster edges', () => {
    const tl = geoToImagePx(IMAGE_BOUNDS.north, IMAGE_BOUNDS.west)
    const br = geoToImagePx(IMAGE_BOUNDS.south, IMAGE_BOUNDS.east)
    expect(tl.x).toBeCloseTo(0, 6)
    expect(tl.y).toBeCloseTo(0, 6)
    expect(br.x).toBeCloseTo(IMAGE_SIZE.w, 6)
    expect(br.y).toBeCloseTo(IMAGE_SIZE.h, 6)
  })

  it('orders the MapLibre corners TL, TR, BR, BL', () => {
    const [tl, tr, br, bl] = imageCorners()
    expect(tl[0]).toBeLessThan(tr[0])
    expect(tl[1]).toBeGreaterThan(bl[1])
    expect(br[0]).toBe(tr[0])
    expect(br[1]).toBe(bl[1])
  })
})

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
