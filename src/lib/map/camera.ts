/**
 * Camera decisions for the public map, as pure functions (the component only
 * measures the screen and calls MapLibre). Owner, Nov 2026 (iPhone video:
 * every card swipe flew across the whole island and zoomed into empty sea):
 *
 *   - the camera never zooms in on its own (only a cluster tap, the visitor's
 *     own pinch, and a `?place=` deep link do);
 *   - a pin tap or a card swipe only moves when that pin is hidden under the
 *     chrome (header, cards, the place sheet), and then by a short pan;
 *   - a swipe to a far pin zooms out just enough to keep the way there in
 *     view, and never lands on an empty view (`planGlide`);
 *   - a filter change only re-frames when none of the new results is on
 *     screen (an area pick always frames its area);
 *   - every move is short (300–450 ms) and instant with reduced motion.
 */

import type { SheetStop } from './sheet-state'
import { PEEK_PX } from './sheet-state'

export interface Insets {
  top: number
  bottom: number
  left: number
  right: number
}

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** The drawn pin's height above its tip (the selected one is the largest). */
export const PIN_HEAD_PX = 40
/** Breathing room between a pin and the edge of the open area. */
export const EDGE_PX = 16
export const MIN_MS = 300
export const MAX_MS = 450
/** Side room on phones (the island fills the width). */
export const SIDE_PX = 16

/** The part of the map box a pin can be seen in (box coordinates). */
export function openArea(view: Size, insets: Insets) {
  return {
    left: insets.left,
    top: insets.top,
    right: Math.max(insets.left, view.width - insets.right),
    bottom: Math.max(insets.top, view.height - insets.bottom),
  }
}

/** The whole pin (tip at `point`, head above it) sits inside the open area. */
export function pinVisible(point: Point, view: Size, insets: Insets): boolean {
  const area = openArea(view, insets)
  return (
    point.x >= area.left + EDGE_PX &&
    point.x <= area.right - EDGE_PX &&
    point.y - PIN_HEAD_PX >= area.top &&
    point.y <= area.bottom - EDGE_PX / 2
  )
}

/** Short and calm: 300 ms for a nudge, up to 450 ms for the longest move. */
export function moveDuration(
  distancePx: number,
  zoomDelta: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 0
  const ms = MIN_MS + Math.abs(distancePx) * 0.35 + Math.abs(zoomDelta) * 60
  return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, ms)))
}

export interface PinMove {
  /** Put the pin in the middle of the open area (pass `insets` as padding). */
  zoom: number
  duration: number
}

/**
 * A pin was selected for the sheet (card tap, sheet stop change, back /
 * forward). Null means «leave the camera alone». It never changes the zoom:
 * a pin the visitor can already see stays where it is, a hidden one is panned
 * into the middle of the open area.
 */
export function planPinMove(input: {
  point: Point
  zoom: number
  view: Size
  insets: Insets
  reducedMotion: boolean
}): PinMove | null {
  const { point, zoom, view, insets, reducedMotion } = input
  if (pinVisible(point, view, insets)) return null
  const area = openArea(view, insets)
  const cx = (area.left + area.right) / 2
  const cy = (area.top + area.bottom) / 2
  return { zoom, duration: moveDuration(Math.hypot(point.x - cx, point.y - cy), 0, reducedMotion) }
}

/** A swipe pans at most this many open-area sizes before it zooms out. */
export const GLIDE_PAN_SCREENS = 1.2
/** Other pins that must stay in view around the one a swipe lands on. */
export const CONTEXT_PINS = 2

/**
 * A card swipe (or a pin tap) selected the pin at `point`. Null: the pin is
 * in view, so only the highlight changes and the map stays still.
 *
 * Otherwise the camera pans to it. A far pin (more than ~1 screen away) is
 * reached with a zoom-out of just the extra distance, so the move stays one
 * short ease instead of a long flight at street zoom; and the view it lands
 * on keeps at least `CONTEXT_PINS` other pins around the selected one (never
 * one lone pin in the sea). The zoom only ever goes down, never under
 * `minZoom` (the whole island).
 *
 * `others`: the other places' pins, in map-box pixels at the current zoom.
 */
export function planGlide(input: {
  point: Point
  zoom: number
  minZoom: number
  view: Size
  insets: Insets
  others: readonly Point[]
  reducedMotion: boolean
}): PinMove | null {
  const { point, zoom, view, insets, others, reducedMotion } = input
  const minZoom = Math.min(input.minZoom, zoom)
  if (pinVisible(point, view, insets)) return null
  const area = openArea(view, insets)
  const w = Math.max(1, area.right - area.left)
  const h = Math.max(1, area.bottom - area.top)
  const cx = (area.left + area.right) / 2
  const cy = (area.top + area.bottom) / 2
  const distance = Math.hypot(point.x - cx, point.y - cy)
  let target = zoom
  const reach = GLIDE_PAN_SCREENS * Math.max(w, h)
  if (distance > reach) target = zoom - Math.log2(distance / reach)
  // Context: enough other pins inside the open area once the pin is centred.
  const inView = (z: number) => {
    const k = 2 ** (z - zoom)
    let n = 0
    for (const other of others) {
      const dx = (other.x - point.x) * k
      const dy = (other.y - point.y) * k
      if (Math.abs(dx) <= w / 2 - EDGE_PX && dy <= h / 2 && -dy <= h / 2 - PIN_HEAD_PX) n += 1
    }
    return n
  }
  const wanted = Math.min(CONTEXT_PINS, others.length)
  while (target > minZoom && inView(target) < wanted) target -= 0.5
  target = Math.max(minZoom, Math.min(zoom, target))
  target = Math.round(target * 100) / 100
  return { zoom: target, duration: moveDuration(distance, zoom - target, reducedMotion) }
}

/**
 * How much of the map box's bottom the phone sheet covers at `stop`, or null
 * at `full` (the map is out of sight: don't move it). The sheet is fixed to
 * the viewport bottom and also covers the tab bar under the map box.
 */
export function sheetCover(stop: SheetStop, viewportH: number, mapBottom: number): number | null {
  if (stop === 'full') return null
  const height = stop === 'peek' ? PEEK_PX : stop === 'half' ? Math.round(viewportH * 0.55) : 0
  if (height === 0) return 0
  const below = Math.max(0, viewportH - mapBottom)
  return Math.max(0, height - below)
}

/** The area key of a results key (`area|cats|travelers|durations`). */
export function areaOfKey(resultKey: string): string {
  return resultKey.split('|')[0] ?? ''
}

export interface FilterItem {
  id: string
  /** The pin's tip in map-box pixels (`map.project`). */
  point: Point
}

export interface FilterPlan {
  /** Fit the camera to all the new results. */
  frame: boolean
  /** The place the cards (and the selected pin) should show; null: no results. */
  selectId: string | null
}

/**
 * New results from a filter, and which card goes with them (owner video, Nov
 * 2026: after picking a category the cards still showed a place whose pin was
 * off screen). The camera stays put whenever it can; the card always names a
 * pin the visitor can see:
 *
 *   - an area pick frames its area (keeping the selected place if it is there);
 *   - nothing on screen: frame the results (same rule for the card);
 *   - the selected place is still a result and on screen: nothing changes;
 *   - otherwise the card moves to the visible result nearest the middle of
 *     the open area, and the camera does not move at all.
 */
export function planFilterView(input: {
  items: readonly FilterItem[]
  selectedId: string | null
  view: Size
  insets: Insets
  areaChanged: boolean
}): FilterPlan {
  const { items, selectedId, view, insets, areaChanged } = input
  if (items.length === 0) return { frame: false, selectId: null }
  const kept = selectedId !== null && items.some((one) => one.id === selectedId)
  const fallback = kept ? selectedId : items[0]!.id
  if (areaChanged) return { frame: true, selectId: fallback }
  const area = openArea(view, insets)
  const inside = items.filter(
    (one) =>
      one.point.x >= area.left &&
      one.point.x <= area.right &&
      one.point.y >= area.top &&
      one.point.y <= area.bottom,
  )
  if (inside.length === 0) return { frame: true, selectId: fallback }
  if (kept && inside.some((one) => one.id === selectedId)) {
    return { frame: false, selectId: selectedId }
  }
  const cx = (area.left + area.right) / 2
  const cy = (area.top + area.bottom) / 2
  let best = inside[0]!
  let bestD = Infinity
  for (const one of inside) {
    const d = (one.point.x - cx) ** 2 + (one.point.y - cy) ** 2
    if (d < bestD) {
      bestD = d
      best = one
    }
  }
  return { frame: false, selectId: best.id }
}
