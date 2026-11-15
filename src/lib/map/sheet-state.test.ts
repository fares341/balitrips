import { describe, expect, it } from 'vitest'

import {
  DRAG_SLOP,
  PHONE_STOPS,
  SHEET_CLOSED,
  dragIntent,
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

describe('phone sheet: one surface at a time (no peek)', () => {
  const offsets = stopOffsets(800)
  it('a pull down from half closes it (the cards come back), never stops at peek', () => {
    // Released just above the old peek stop, slowly.
    expect(snapAfterDrag('half', offsets.peek - 10, 0, offsets, PHONE_STOPS)).toBe('closed')
    expect(snapAfterDrag('half', offsets.peek, 0.9, offsets, PHONE_STOPS)).toBe('closed')
  })
  it('a pull up from half goes full; a short pull stays at half', () => {
    expect(snapAfterDrag('half', offsets.half - 40, -0.9, offsets, PHONE_STOPS)).toBe('full')
    expect(snapAfterDrag('half', offsets.half - 20, 0, offsets, PHONE_STOPS)).toBe('half')
  })
  it('a flick down from full lands on half', () => {
    expect(snapAfterDrag('full', 40, 0.9, offsets, PHONE_STOPS)).toBe('half')
  })
  it('never returns a stop it was not given', () => {
    for (const y of [0, 100, 300, 500, 700, 900]) {
      for (const v of [-2, -0.6, 0, 0.6, 2]) {
        expect(PHONE_STOPS).toContain(snapAfterDrag('half', y, v, offsets, PHONE_STOPS))
      }
    }
  })
})

describe('dragIntent', () => {
  it('waits inside the slop', () => {
    expect(dragIntent({ from: 'half', inBody: true, dx: 2, dy: 3 })).toBe('pending')
  })
  it('a vertical move on a peek / half sheet drags it, wherever it began', () => {
    expect(dragIntent({ from: 'peek', inBody: true, dx: 1, dy: 30 })).toBe('drag')
    expect(dragIntent({ from: 'half', inBody: true, dx: 2, dy: -30 })).toBe('drag')
    expect(dragIntent({ from: 'half', inBody: false, dx: 0, dy: DRAG_SLOP })).toBe('drag')
  })
  it('a sideways move belongs to the photo / nearby rows', () => {
    expect(dragIntent({ from: 'half', inBody: true, dx: 20, dy: 4 })).toBe('release')
  })
  it('up inside the full sheet scrolls its content at once', () => {
    expect(dragIntent({ from: 'full', inBody: true, dx: 0, dy: -1 })).toBe('release')
  })
  it('down at the top of the full sheet pulls the sheet (not the page)', () => {
    expect(dragIntent({ from: 'full', inBody: true, dx: 1, dy: 12 })).toBe('drag')
  })
  it('the full sheet handle drags both ways', () => {
    expect(dragIntent({ from: 'full', inBody: false, dx: 0, dy: -12 })).toBe('drag')
  })
})
