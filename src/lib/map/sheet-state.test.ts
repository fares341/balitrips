import { describe, expect, it } from 'vitest'

import {
  SHEET_CLOSED,
  scrollsInside,
  sheetReducer,
  snapAfterDrag,
  stopOffsets,
} from './sheet-state'

describe('sheet state machine', () => {
  it('opens at the requested stop', () => {
    expect(sheetReducer(SHEET_CLOSED, { type: 'open', id: 'a', stop: 'peek' })).toEqual({
      stop: 'peek',
      placeId: 'a',
    })
    expect(sheetReducer(SHEET_CLOSED, { type: 'open', id: 'a', stop: 'half' })).toEqual({
      stop: 'half',
      placeId: 'a',
    })
  })

  it('swaps content in place when already open', () => {
    const full = { stop: 'full' as const, placeId: 'a' }
    expect(sheetReducer(full, { type: 'open', id: 'b', stop: 'peek' })).toEqual({
      stop: 'full',
      placeId: 'b',
    })
    const peek = { stop: 'peek' as const, placeId: 'a' }
    expect(sheetReducer(peek, { type: 'open', id: 'b', stop: 'half' })).toEqual({
      stop: 'half',
      placeId: 'b',
    })
    expect(sheetReducer(peek, { type: 'open', id: 'a', stop: 'peek' })).toBe(peek)
  })

  it('snaps and closes', () => {
    const half = { stop: 'half' as const, placeId: 'a' }
    expect(sheetReducer(half, { type: 'snap', stop: 'full' })).toEqual({
      stop: 'full',
      placeId: 'a',
    })
    expect(sheetReducer(half, { type: 'snap', stop: 'closed' })).toEqual(SHEET_CLOSED)
    expect(sheetReducer(half, { type: 'close' })).toEqual(SHEET_CLOSED)
    expect(sheetReducer(SHEET_CLOSED, { type: 'snap', stop: 'full' })).toBe(SHEET_CLOSED)
    expect(sheetReducer(SHEET_CLOSED, { type: 'close' })).toBe(SHEET_CLOSED)
  })

  it('orders the stops top to bottom', () => {
    const o = stopOffsets(844)
    expect(o.full).toBe(0)
    expect(o.full).toBeLessThan(o.half)
    expect(o.half).toBeLessThan(o.peek)
    expect(o.peek).toBeLessThan(o.closed)
    // half leaves ~45% of the viewport for the map
    expect(o.closed - o.half).toBeCloseTo(844 * 0.55, -1)
  })

  it('flicks one stop in the drag direction, else snaps to the nearest', () => {
    const o = stopOffsets(800)
    expect(snapAfterDrag('half', o.half, -1.2, o)).toBe('full')
    expect(snapAfterDrag('half', o.half, 1.2, o)).toBe('peek')
    expect(snapAfterDrag('peek', o.peek, 2, o)).toBe('closed')
    expect(snapAfterDrag('full', 0, -3, o)).toBe('full')
    // A long fast pull from peek past half reaches full.
    expect(snapAfterDrag('peek', o.half - 40, -1.5, o)).toBe('full')
    // A short fast pull from peek stops at half.
    expect(snapAfterDrag('peek', o.peek - 30, -1.5, o)).toBe('half')
    expect(snapAfterDrag('peek', o.half + 10, 0.1, o)).toBe('half')
    expect(snapAfterDrag('half', o.closed - 5, 0, o)).toBe('closed')
  })

  it('scrolls inside only when full', () => {
    expect(scrollsInside('full')).toBe(true)
    expect(scrollsInside('half')).toBe(false)
    expect(scrollsInside('peek')).toBe(false)
  })
})
