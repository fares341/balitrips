/**
 * One way to build the real (3D) map, shared by the public map
 * (`hybrid-view.ts`) and Studio (coordinate picker, places overview), so the
 * dashboard shows exactly the map visitors get.
 */

import {
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
  return map
}
