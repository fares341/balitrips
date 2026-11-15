import { describe, expect, it } from 'vitest'

import {
  CONTEXT_PINS,
  MAX_MS,
  MIN_MS,
  PIN_HEAD_PX,
  areaOfKey,
  moveDuration,
  openArea,
  pinVisible,
  planGlide,
  planPinMove,
  sheetCover,
  planFilterView,
} from './camera'
import { PEEK_PX } from './sheet-state'

// iPhone 13 in Safari: the map box under the map header, above the tab bar.
const view = { width: 390, height: 470 }
const peek = { top: 24, bottom: 148, left: 16, right: 16 }

describe('openArea', () => {
  it('is the box minus the chrome', () => {
    expect(openArea(view, peek)).toEqual({ left: 16, top: 24, right: 374, bottom: 322 })
  })
  it('never inverts when the chrome is larger than the box', () => {
    const a = openArea({ width: 100, height: 100 }, { top: 80, bottom: 80, left: 0, right: 0 })
    expect(a.bottom).toBeGreaterThanOrEqual(a.top)
  })
})

describe('pinVisible', () => {
  it('a pin in the middle is visible', () => {
    expect(pinVisible({ x: 195, y: 200 }, view, peek)).toBe(true)
  })
  it('a pin under the sheet is hidden', () => {
    expect(pinVisible({ x: 195, y: 400 }, view, peek)).toBe(false)
  })
  it('a pin whose head is under the header is hidden', () => {
    expect(pinVisible({ x: 195, y: 24 + PIN_HEAD_PX - 1 }, view, peek)).toBe(false)
  })
  it('a pin at the side edge is hidden', () => {
    expect(pinVisible({ x: 5, y: 200 }, view, peek)).toBe(false)
  })
})

describe('planPinMove', () => {
  const base = { view, insets: peek, reducedMotion: false }

  it('leaves the camera alone for a visible pin, at any zoom', () => {
    expect(planPinMove({ ...base, point: { x: 200, y: 200 }, zoom: 12 })).toBeNull()
    // Owner video: a tap from the whole island used to zoom in by 2.
    expect(planPinMove({ ...base, point: { x: 200, y: 200 }, zoom: 7.96 })).toBeNull()
  })

  it('pans without zooming when the pin is under the sheet', () => {
    const move = planPinMove({ ...base, point: { x: 200, y: 420 }, zoom: 13.4 })
    expect(move).not.toBeNull()
    expect(move!.zoom).toBe(13.4)
  })

  it('never changes the zoom', () => {
    for (const zoom of [5, 8, 9.5, 12, 16]) {
      for (const y of [10, 200, 460]) {
        const move = planPinMove({ ...base, point: { x: 200, y }, zoom })
        if (move) expect(move.zoom).toBe(zoom)
      }
    }
  })

  it('is instant with reduced motion', () => {
    const move = planPinMove({ ...base, reducedMotion: true, point: { x: 0, y: 460 }, zoom: 12 })
    expect(move!.duration).toBe(0)
  })

  it('keeps animations short', () => {
    const near = planPinMove({ ...base, point: { x: 200, y: 330 }, zoom: 12 })
    const far = planPinMove({ ...base, point: { x: -4000, y: 3000 }, zoom: 8 })
    expect(near!.duration).toBeGreaterThanOrEqual(MIN_MS)
    expect(far!.duration).toBeLessThanOrEqual(MAX_MS)
  })
})

describe('planGlide (card swipe)', () => {
  // The open area of `view` with `peek`: x 16–374, y 24–322 (358 × 298).
  const base = { view, insets: peek, reducedMotion: false, minZoom: 8 }
  /** A few pins around (dx, dy) from `p`, so the landing view has company. */
  const around = (p: { x: number; y: number }) => [
    { x: p.x + 40, y: p.y + 10 },
    { x: p.x - 50, y: p.y - 20 },
    { x: p.x + 10, y: p.y + 60 },
  ]

  it('does not move the map while the next pin is in view', () => {
    const point = { x: 120, y: 200 }
    expect(planGlide({ ...base, point, zoom: 10, others: around(point) })).toBeNull()
  })

  it('a near pin off screen: one short pan, same zoom', () => {
    const point = { x: 520, y: 180 }
    const move = planGlide({ ...base, point, zoom: 11, others: around(point) })
    expect(move).not.toBeNull()
    expect(move!.zoom).toBe(11)
    expect(move!.duration).toBeGreaterThanOrEqual(MIN_MS)
    expect(move!.duration).toBeLessThanOrEqual(MAX_MS)
  })

  it('a far pin (owner video: Canggu → Gilimanuk at street zoom): zooms out, no long flight', () => {
    // ~6 screens away at zoom 12.
    const point = { x: 195 - 2400, y: 173 - 600 }
    const move = planGlide({ ...base, point, zoom: 12, others: around(point) })
    expect(move!.zoom).toBeLessThan(12)
    // Seen from the new zoom, the pin is at most ~1.2 screens from the centre.
    const k = 2 ** (move!.zoom - 12)
    expect(Math.hypot(2400, 600) * k).toBeLessThanOrEqual(1.2 * 358 + 1)
    expect(move!.duration).toBeLessThanOrEqual(MAX_MS)
  })

  it('never lands on an empty view: zooms out until other pins show', () => {
    const point = { x: 520, y: 180 }
    // The only other pins are ~500px away at zoom 12 (one lone pin in the sea).
    const others = [
      { x: 520 + 500, y: 180 },
      { x: 520 - 520, y: 180 + 40 },
    ]
    const move = planGlide({ ...base, point, zoom: 12, others })
    expect(move!.zoom).toBeLessThan(12)
    const k = 2 ** (move!.zoom - 12)
    const seen = others.filter((o) => Math.abs((o.x - point.x) * k) <= 358 / 2)
    expect(seen.length).toBeGreaterThanOrEqual(Math.min(CONTEXT_PINS, others.length))
  })

  it('never zooms in, and never out past the whole island', () => {
    for (const zoom of [8, 9, 11, 14]) {
      for (const x of [-9000, -600, 500, 9000]) {
        const point = { x, y: 170 }
        const move = planGlide({ ...base, point, zoom, others: [] })
        if (move) {
          expect(move.zoom).toBeLessThanOrEqual(zoom)
          expect(move.zoom).toBeGreaterThanOrEqual(Math.min(8, zoom))
        }
      }
    }
  })

  it('is instant with reduced motion', () => {
    const move = planGlide({
      ...base,
      reducedMotion: true,
      point: { x: 900, y: 170 },
      zoom: 11,
      others: [],
    })
    expect(move!.duration).toBe(0)
  })
})

describe('moveDuration', () => {
  it('stays within 300–450 ms', () => {
    expect(moveDuration(0, 0, false)).toBe(MIN_MS)
    expect(moveDuration(100000, 6, false)).toBe(MAX_MS)
    expect(moveDuration(300, 0, true)).toBe(0)
  })
})

describe('planFilterView', () => {
  const insets = { top: 24, bottom: 180, left: 16, right: 16 }
  const at = (id: string, x: number, y: number) => ({ id, point: { x, y } })

  it('keeps the view and the card while the selected place is on screen', () => {
    const items = [at('a', 3000, 150), at('b', 200, 150)]
    expect(planFilterView({ items, selectedId: 'b', view, insets, areaChanged: false })).toEqual({
      frame: false,
      selectId: 'b',
    })
  })

  it('moves the card (not the camera) to the visible pin nearest the middle', () => {
    // The owner's video: «Markets» picked while the card showed a place
    // whose pin was off screen.
    const items = [at('sel', 200, 900), at('edge', 30, 40), at('mid', 210, 150)]
    expect(planFilterView({ items, selectedId: 'sel', view, insets, areaChanged: false })).toEqual({
      frame: false,
      selectId: 'mid',
    })
  })

  it('picks a visible pin when the selected place left the results', () => {
    const items = [at('x', 200, 150)]
    expect(planFilterView({ items, selectedId: 'gone', view, insets, areaChanged: false })).toEqual(
      { frame: false, selectId: 'x' },
    )
  })

  it('frames when every result is off screen, keeping the selected place', () => {
    const items = [at('a', -50, 150), at('b', 200, 460)]
    expect(planFilterView({ items, selectedId: 'b', view, insets, areaChanged: false })).toEqual({
      frame: true,
      selectId: 'b',
    })
    expect(planFilterView({ items, selectedId: 'gone', view, insets, areaChanged: false })).toEqual(
      { frame: true, selectId: 'a' },
    )
  })

  it('always frames a new area', () => {
    const items = [at('a', 200, 150)]
    expect(planFilterView({ items, selectedId: 'a', view, insets, areaChanged: true })).toEqual({
      frame: true,
      selectId: 'a',
    })
  })

  it('does nothing without results', () => {
    expect(planFilterView({ items: [], selectedId: 'a', view, insets, areaChanged: true })).toEqual(
      { frame: false, selectId: null },
    )
  })
})

describe('sheetCover', () => {
  // Viewport 664, map box ends at 600 (the tab bar is the last 64 px).
  it('peek covers its height minus the tab bar under it', () => {
    expect(sheetCover('peek', 664, 600)).toBe(PEEK_PX - 64)
  })
  it('half covers 55% of the viewport minus the tab bar', () => {
    expect(sheetCover('half', 664, 600)).toBe(Math.round(664 * 0.55) - 64)
  })
  it('full hides the map: no move', () => {
    expect(sheetCover('full', 664, 600)).toBeNull()
  })
  it('closed covers nothing', () => {
    expect(sheetCover('closed', 664, 600)).toBe(0)
  })
})

describe('areaOfKey', () => {
  it('reads the area from the results key', () => {
    expect(areaOfKey('ubud|restaurants||')).toBe('ubud')
    expect(areaOfKey('')).toBe('')
  })
})
