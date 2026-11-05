/**
 * The place sheet on the map (owner, Nov 2026): a pure state machine, so the
 * component only renders it. Stops, top to bottom: `full`, `half` (≈55% of
 * the viewport, the map still visible), `peek` (the card), `closed`.
 */

export type SheetStop = 'closed' | 'peek' | 'half' | 'full'

export interface SheetState {
  stop: SheetStop
  placeId: string | null
}

export type SheetAction =
  /** Pin / card / nearby tap. On a closed sheet it opens at `stop`. */
  | { type: 'open'; id: string; stop: 'peek' | 'half' }
  | { type: 'snap'; stop: SheetStop }
  | { type: 'close' }

export const SHEET_CLOSED: SheetState = { stop: 'closed', placeId: null }

const ORDER: readonly SheetStop[] = ['full', 'half', 'peek', 'closed']

export function sheetReducer(state: SheetState, action: SheetAction): SheetState {
  switch (action.type) {
    case 'open': {
      if (state.stop === 'closed') return { stop: action.stop, placeId: action.id }
      // Already open: swap the content; only ever grow peek → half.
      const stop = state.stop === 'peek' && action.stop === 'half' ? 'half' : state.stop
      if (stop === state.stop && action.id === state.placeId) return state
      return { stop, placeId: action.id }
    }
    case 'snap':
      if (action.stop === 'closed') return SHEET_CLOSED
      if (state.placeId === null) return state
      return action.stop === state.stop ? state : { ...state, stop: action.stop }
    case 'close':
      return state.stop === 'closed' ? state : SHEET_CLOSED
  }
}

/** Peek height: the card row. */
export const PEEK_PX = 148

/** The sheet's translateY (px, from its top at full) for each stop. */
export function stopOffsets(viewport: number): Record<SheetStop, number> {
  const height = Math.round(viewport * 0.92)
  return {
    full: 0,
    half: Math.round(height - viewport * 0.55),
    peek: height - PEEK_PX,
    closed: height,
  }
}

/** Velocity (px/ms) above which a flick moves one stop in its direction. */
export const FLICK = 0.5

/**
 * Where a drag ends. A flick goes to the next stop past the release point in
 * its direction (so a long fast pull from peek can reach full); a slow
 * release goes to the nearest stop. `from` is where the drag began.
 */
export function snapAfterDrag(
  from: SheetStop,
  y: number,
  velocity: number,
  offsets: Record<SheetStop, number>,
): SheetStop {
  if (Math.abs(velocity) > FLICK) {
    if (velocity < 0) {
      // Up: the closest stop above the release point (or full).
      let best: SheetStop = 'full'
      for (const stop of ORDER) if (offsets[stop] < y && offsets[stop] > offsets[best]) best = stop
      return best === from && from !== 'full' ? ORDER[Math.max(0, ORDER.indexOf(from) - 1)]! : best
    }
    // Down: the closest stop below the release point (or closed).
    let best: SheetStop = 'closed'
    for (const stop of ORDER) if (offsets[stop] > y && offsets[stop] < offsets[best]) best = stop
    return best
  }
  let best: SheetStop = 'full'
  for (const stop of ORDER) {
    if (Math.abs(offsets[stop] - y) < Math.abs(offsets[best] - y)) best = stop
  }
  return best
}

/** Only the full sheet scrolls its content; the others drag. */
export const scrollsInside = (stop: SheetStop) => stop === 'full'
