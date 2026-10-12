import { describe, expect, it } from 'vitest'

import { DEFAULT_PIN_COLOR, MAP_BBOX, pinColor, projectLat, projectLon } from './projection'

/**
 * The projection is the map's single source of position. A silent drift here
 * moves every pin off its landmark while the page still renders perfectly, so
 * it is pinned down by the only thing that catches that: arithmetic.
 */
describe('projectLon / projectLat', () => {
  it('maps the bounding box corners to the unit square', () => {
    expect(projectLon(MAP_BBOX.w)).toBe(0)
    expect(projectLon(MAP_BBOX.e)).toBe(1)
    expect(projectLat(MAP_BBOX.n)).toBe(0)
    expect(projectLat(MAP_BBOX.s)).toBe(1)
  })

  it('places a known coordinate where it belongs', () => {
    // Ubud, from the handoff's own dataset.
    expect(projectLon(115.263)).toBeCloseTo(0.5917, 4)
    expect(projectLat(-8.507)).toBeCloseTo(0.5407, 4)
  })

  it('grows eastward and southward', () => {
    expect(projectLon(115.5)).toBeGreaterThan(projectLon(115.0))
    // Latitude decreases going south, but the fraction down the frame must
    // increase — an inverted sign here would mirror the island north/south.
    expect(projectLat(-9.0)).toBeGreaterThan(projectLat(-8.0))
  })

  it('reports out-of-box coordinates as out of range rather than clamping', () => {
    // Culling handles these. Clamping would stack stray rows on the frame edge
    // and imply a location the data does not support.
    expect(projectLon(117)).toBeGreaterThan(1)
    expect(projectLat(-7)).toBeLessThan(0)
  })

  it('matches the aspect ratio the frame is cut to', () => {
    const boxRatio = (MAP_BBOX.e - MAP_BBOX.w) / (MAP_BBOX.n - MAP_BBOX.s)
    // .bt-mapframe: aspect-ratio: 2048 / 1399.
    expect(boxRatio).toBeCloseTo(2048 / 1399, 3)
  })
})

describe('pinColor', () => {
  it('honours the handoff precedence when a place carries several tags', () => {
    expect(pinColor(['Temples', 'Beaches'])).toBe(pinColor(['Beaches']))
    expect(pinColor(['Hiking', 'Temples'])).toBe(pinColor(['Temples']))
  })

  it('falls back for untagged and unrecognised places', () => {
    expect(pinColor(null)).toBe(DEFAULT_PIN_COLOR)
    expect(pinColor([])).toBe(DEFAULT_PIN_COLOR)
    expect(pinColor(['Nightlife'])).toBe(DEFAULT_PIN_COLOR)
  })
})
