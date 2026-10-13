/**
 * The map's geography — pure, no React, no MapLibre.
 *
 * The base is the package's satellite raster (public/brand/bali-sat.jpg,
 * 2048×1399), an equirectangular image. Its georeference comes from the
 * prototype's data.js formula
 *
 *   x = (190 + (lon − 114.43) · 485) · 2.048
 *   y = (155 + (−lat − 8.07) · 485) · 2.048
 *
 * solved for the image edges: x = 0 → lon 114.0382, x = 2048 → lon 116.1001,
 * y = 0 → lat −7.7504, y = 1399 → lat −9.1589. MapLibre draws it as an
 * `image` source pinned to those four corners — no tiles, no API key.
 */

import type { IconName } from '@/components/ui'

export const IMAGE_SIZE = { w: 2048, h: 1399 } as const

/** The raster's corners, solved from the package formula (see above). */
export const IMAGE_BOUNDS = {
  west: 114.43 - 190 / 485,
  east: 114.43 + (2048 / 2.048 - 190) / 485,
  north: -(8.07 - 155 / 485),
  south: -(8.07 + (1399 / 2.048 - 155) / 485),
} as const

export type LngLat = [number, number]

/** MapLibre `image` source corners: top-left, top-right, bottom-right, bottom-left. */
export function imageCorners(): [LngLat, LngLat, LngLat, LngLat] {
  const { west, east, north, south } = IMAGE_BOUNDS
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ]
}

/** Panning stops a little past the raster, never into the blank world around it. */
export const MAX_BOUNDS: [LngLat, LngLat] = [
  [IMAGE_BOUNDS.west + 0.15, IMAGE_BOUNDS.south + 0.1],
  [IMAGE_BOUNDS.east - 0.15, IMAGE_BOUNDS.north - 0.1],
]

/** The main island (what "Whole island" fits), excluding the empty sea. */
export const ISLAND_BOUNDS: [LngLat, LngLat] = [
  [114.43, -8.86],
  [115.72, -8.06],
]

/**
 * Zoom range. The raster is ~0.001° per pixel, i.e. native resolution at
 * zoom ≈ 9.45 (512 px tiles); beyond ~11.5 it is a 4× upscale and only blur.
 */
export const MIN_ZOOM = 7.4
export const MAX_ZOOM = 11.6

/** Geographic → raster pixel (the package formula). */
export function geoToImagePx(lat: number, lon: number): { x: number; y: number } {
  return {
    x: (190 + (lon - 114.43) * 485) * 2.048,
    y: (155 + (-lat - 8.07) * 485) * 2.048,
  }
}

/** A circle on the ground as a closed lon/lat ring (for the free-zone outline). */
export function circleRing(
  center: { lat: number; lon: number },
  radiusKm: number,
  steps = 64,
): LngLat[] {
  const dLat = radiusKm / 111.32
  const dLon = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180))
  const ring: LngLat[] = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    ring.push([center.lon + dLon * Math.cos(a), center.lat + dLat * Math.sin(a)])
  }
  return ring
}

/** The handoff's motion curve for every camera move (850 ms). */
export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export const FLY_MS = 850

export interface ViewBounds {
  west: number
  east: number
  north: number
  south: number
}

export function inBounds(b: ViewBounds, lat: number, lon: number): boolean {
  return lon >= b.west && lon <= b.east && lat <= b.north && lat >= b.south
}

/**
 * Region bubbles never overlap: push colliding boxes apart in screen space
 * (the prototype's `declutter`). Returns each bubble's offset from its anchor;
 * a non-zero offset gets a leader line back to the real spot.
 */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function declutter(items: readonly Box[], rounds = 60): { ox: number; oy: number }[] {
  const it = items.map((b) => ({ ...b, ox: 0, oy: 0 }))
  for (let k = 0; k < rounds; k++) {
    let moved = false
    for (let i = 0; i < it.length; i++) {
      for (let j = i + 1; j < it.length; j++) {
        const a = it[i]
        const b = it[j]
        if (a === undefined || b === undefined) continue
        const dx = b.x + b.ox - (a.x + a.ox)
        const dy = b.y + b.oy - (a.y + a.oy)
        const ovx = (a.w + b.w) / 2 - Math.abs(dx)
        const ovy = (a.h + b.h) / 2 - Math.abs(dy)
        if (ovx > 0 && ovy > 0) {
          moved = true
          if (ovx * 0.7 < ovy) {
            const sx = dx === 0 ? (a.x <= b.x ? 1 : -1) : Math.sign(dx)
            const push = ovx / 2 + 0.5
            a.ox -= sx * push
            b.ox += sx * push
          } else {
            const sy = dy === 0 ? (a.y <= b.y ? 1 : -1) : Math.sign(dy)
            const push = ovy / 2 + 0.5
            a.oy -= sy * push
            b.oy += sy * push
          }
        }
      }
    }
    if (!moved) break
  }
  return it.map((p) => ({ ox: p.ox, oy: p.oy }))
}

/** Pin glyph per category key (admin categories, so a best-effort map). */
export function categoryIcon(key: string | null): IconName {
  if (key === null) return 'pin'
  const k = key.toLowerCase()
  if (/restaurant|food|dining|eat/.test(k)) return 'food'
  if (/cafe|coffee/.test(k)) return 'coffee'
  if (/beach|surf|sea/.test(k)) return 'wave'
  if (/waterfall|water/.test(k)) return 'drop'
  if (/resort|hotel|stay|villa/.test(k)) return 'bed'
  if (/temple|culture|sight|landmark|history/.test(k)) return 'temple'
  if (/nature|hik|volcano|mountain/.test(k)) return 'mountain'
  if (/market|shop/.test(k)) return 'bag'
  if (/event/.test(k)) return 'ticket'
  if (/activit|adventure/.test(k)) return 'bolt'
  return 'pin'
}
