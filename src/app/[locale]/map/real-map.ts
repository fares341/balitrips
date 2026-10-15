/**
 * One way to build the real (3D) map, shared by the public map
 * (`hybrid-view.ts`) and Studio (coordinate picker, places overview), so the
 * dashboard shows exactly the map visitors get.
 */

import {
  SAND_IMAGE,
  WAVES_IMAGE,
  REAL_BOUNDS,
  REAL_MAX_BOUNDS,
  REAL_MAX_PITCH,
  REAL_MAX_ZOOM,
  REAL_MIN_ZOOM,
  RTL_TEXT_PLUGIN_URL,
  buildStyle,
  type MapSettings,
} from './map-style'
import { ensureRtlTextPlugin, type MapEngine, type MapLike } from './maplibre-loader'

export interface RealMapOptions {
  /** Page / Studio language, for OSM labels (Arabic loads the RTL text plugin). */
  locale?: string
  /** Free-area outline: dims everything outside it (public map, no full access). */
  freeZone?: [number, number][] | null
  /** Open on this point instead of the whole island. */
  center?: [number, number]
  zoom?: number
}

/** Throws when the engine refuses (e.g. no WebGL) — callers fall back. */
export function createRealMap(
  engine: MapEngine,
  container: HTMLElement,
  settings: MapSettings,
  options: RealMapOptions = {},
): MapLike {
  if (options.locale === 'ar') ensureRtlTextPlugin(engine, RTL_TEXT_PLUGIN_URL)
  const map = new engine.Map({
    container,
    style: buildStyle(settings, { freeZone: options.freeZone ?? null, locale: options.locale }),
    ...(options.center
      ? { center: options.center, zoom: options.zoom ?? 14 }
      : { bounds: REAL_BOUNDS, fitBoundsOptions: { padding: 20 } }),
    maxBounds: REAL_MAX_BOUNDS,
    minZoom: REAL_MIN_ZOOM,
    maxZoom: REAL_MAX_ZOOM,
    maxPitch: REAL_MAX_PITCH,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    // The pages draw their own attribution line (always visible, in the site font).
    attributionControl: false,
    // The page's own wrapper owns the keyboard.
    keyboard: false,
  })
  const canvas = map.getCanvas?.()
  if (canvas) canvas.tabIndex = -1
  // The water texture is drawn here (no sprite file): added on first request.
  map.on('styleimagemissing', (event) => {
    const id = (event as { id?: string } | undefined)?.id
    if (id === WAVES_IMAGE && map.hasImage?.(WAVES_IMAGE) === false) {
      const img = wavesImage()
      if (img) map.addImage?.(WAVES_IMAGE, img, { pixelRatio: 2 })
    }
    if (id === SAND_IMAGE && map.hasImage?.(SAND_IMAGE) === false) {
      const img = sandImage()
      if (img) map.addImage?.(SAND_IMAGE, img, { pixelRatio: 2 })
    }
  })
  return map
}

/** A soft wave texture (two staggered ripples), so water reads as water up close. */
function wavesImage(): { width: number; height: number; data: Uint8ClampedArray } | null {
  const W = 64
  const H = 32
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) return null
  g.strokeStyle = 'rgba(255,255,255,0.55)'
  g.lineWidth = 1.6
  g.lineCap = 'round'
  const ripple = (x0: number, y0: number) => {
    g.beginPath()
    for (let x = 0; x <= 22; x += 1) {
      const y = y0 + Math.sin((x / 22) * Math.PI * 2) * 2.2
      if (x === 0) g.moveTo(x0 + x, y)
      else g.lineTo(x0 + x, y)
    }
    g.stroke()
  }
  ripple(4, 9)
  ripple(36, 25)
  const data = g.getImageData(0, 0, W, H).data
  return { width: W, height: H, data }
}

/** Fine sand grain: scattered warm specks on transparent (fixed seed). */
function sandImage(): { width: number; height: number; data: Uint8ClampedArray } | null {
  const W = 48
  const H = 48
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) return null
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < 70; i += 1) {
    const light = rnd() > 0.5
    g.fillStyle = light ? 'rgba(255,250,235,0.85)' : 'rgba(176,138,74,0.45)'
    g.beginPath()
    g.arc(rnd() * W, rnd() * H, 0.6 + rnd() * 0.9, 0, Math.PI * 2)
    g.fill()
  }
  const data = g.getImageData(0, 0, W, H).data
  return { width: W, height: H, data }
}
