import { describe, expect, it } from 'vitest'

import {
  FAR_OUT_ZOOM,
  MAX_MS,
  MIN_MS,
  PIN_HEAD_PX,
  TAP_ZOOM_CAP,
  areaOfKey,
  moveDuration,
  openArea,
  pinVisible,
  planPinMove,
  sheetCover,
  shouldFrameResults,
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
  const base = { maxZoom: 18, view, insets: peek, reducedMotion: false }

  it('leaves the camera alone for a visible pin at a normal zoom', () => {
    expect(planPinMove({ ...base, point: { x: 200, y: 200 }, zoom: 12 })).toBeNull()
  })

  it('pans without zooming when the pin is under the sheet', () => {
    const move = planPinMove({ ...base, point: { x: 200, y: 420 }, zoom: 13.4 })
    expect(move).not.toBeNull()
    expect(move!.zoom).toBe(13.4)
  })

  it('zooms in moderately from far out, never past the cap', () => {
    const move = planPinMove({ ...base, point: { x: 200, y: 200 }, zoom: 7.96 })
    expect(move!.zoom).toBeCloseTo(9.96)
    const close = planPinMove({ ...base, point: { x: 200, y: 200 }, zoom: 9.2 })
    expect(close!.zoom).toBe(TAP_ZOOM_CAP)
  })

  it('a second tap after zooming in from the island does not zoom again', () => {
    const first = planPinMove({ ...base, point: { x: 200, y: 200 }, zoom: 7.96 })
    expect(first!.zoom).toBeGreaterThanOrEqual(FAR_OUT_ZOOM)
    expect(planPinMove({ ...base, point: { x: 220, y: 230 }, zoom: first!.zoom })).toBeNull()
  })

  it('never zooms out', () => {
    for (const zoom of [5, 8, FAR_OUT_ZOOM - 0.01, FAR_OUT_ZOOM, 12, 16]) {
      for (const y of [10, 200, 460]) {
        const move = planPinMove({ ...base, point: { x: 200, y }, zoom })
        if (move) expect(move.zoom).toBeGreaterThanOrEqual(zoom)
      }
    }
  })

  it('respects the max zoom', () => {
    const move = planPinMove({ ...base, maxZoom: 9, point: { x: 200, y: 200 }, zoom: 8 })
    expect(move!.zoom).toBe(9)
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

describe('moveDuration', () => {
  it('stays within 300–500 ms', () => {
    expect(moveDuration(0, 0, false)).toBe(MIN_MS)
    expect(moveDuration(100000, 6, false)).toBe(MAX_MS)
    expect(moveDuration(300, 0, true)).toBe(0)
  })
})

describe('shouldFrameResults', () => {
  const insets = { top: 24, bottom: 180, left: 16, right: 16 }
  it('keeps the view while a result is on screen', () => {
    const points = [
      { x: 200, y: 150 },
      { x: 3000, y: 150 },
    ]
    expect(shouldFrameResults({ points, view, insets, areaChanged: false })).toBe(false)
  })
  it('frames when every result is off screen', () => {
    const points = [
      { x: -50, y: 150 },
      { x: 200, y: 460 },
    ]
    expect(shouldFrameResults({ points, view, insets, areaChanged: false })).toBe(true)
  })
  it('always frames a new area', () => {
    expect(
      shouldFrameResults({ points: [{ x: 200, y: 150 }], view, insets, areaChanged: true }),
    ).toBe(true)
  })
  it('does nothing without results', () => {
    expect(shouldFrameResults({ points: [], view, insets, areaChanged: true })).toBe(false)
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
