/**
 * Camera decisions for the public map, as pure functions (the component only
 * measures the screen and calls MapLibre). Owner, Nov 2026: tapping one pin
 * and then another must never throw the view far away or zoom it out.
 *
 *   - a pin tap keeps the zoom and only moves when the pin is hidden under the
 *     chrome (header, cards, the place sheet); from far out it zooms in a
 *     little, never out;
 *   - a filter change only re-frames when none of the new results is on screen
 *     (an area pick always frames its area);
 *   - every move is short (300–500 ms) and instant with reduced motion.
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

/** Below this zoom the island is «far out»: a tapped pin zooms in a little. */
export const FAR_OUT_ZOOM = 9.5
/** How much a tap from far out zooms in (moderate, never more than this). */
export const TAP_ZOOM_STEP = 2
/** A tap never zooms in beyond this on its own. */
export const TAP_ZOOM_CAP = 11
/** The drawn pin's height above its tip (the selected one is the largest). */
export const PIN_HEAD_PX = 40
/** Breathing room between a pin and the edge of the open area. */
export const EDGE_PX = 16
export const MIN_MS = 300
export const MAX_MS = 500
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

/** Short and calm: 300 ms for a nudge, up to 500 ms across the island. */
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
 * A pin was selected (tap, card, sheet stop change, back/forward). Null means
 * «leave the camera alone». The zoom only ever goes up, and only from far out.
 */
export function planPinMove(input: {
  point: Point
  zoom: number
  maxZoom: number
  view: Size
  insets: Insets
  reducedMotion: boolean
}): PinMove | null {
  const { point, zoom, maxZoom, view, insets, reducedMotion } = input
  const far = zoom < FAR_OUT_ZOOM
  const visible = pinVisible(point, view, insets)
  if (visible && !far) return null
  const target = far
    ? Math.min(maxZoom, Math.max(zoom, Math.min(TAP_ZOOM_CAP, zoom + TAP_ZOOM_STEP)))
    : zoom
  const area = openArea(view, insets)
  const cx = (area.left + area.right) / 2
  const cy = (area.top + area.bottom) / 2
  const distance = Math.hypot(point.x - cx, point.y - cy)
  return {
    zoom: Math.max(zoom, target),
    duration: moveDuration(distance, target - zoom, reducedMotion),
  }
}

/**
 * New results from a filter. An area pick frames its area; otherwise the view
 * stays while any result is already on screen (no jump to the whole island).
 */
export function shouldFrameResults(input: {
  points: readonly Point[]
  view: Size
  insets: Insets
  areaChanged: boolean
}): boolean {
  const { points, view, insets, areaChanged } = input
  if (points.length === 0) return false
  if (areaChanged) return true
  const area = openArea(view, insets)
  return !points.some(
    (p) => p.x >= area.left && p.x <= area.right && p.y >= area.top && p.y <= area.bottom,
  )
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
