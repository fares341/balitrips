/**
 * MapLibre GL, loaded at runtime from a pinned CDN build — not an npm
 * dependency (the Docker image installs from a frozen lockfile).
 *
 * Only the slice of the API the map uses is typed here (`MapLike`), which also
 * lets a test harness inject a stand-in engine (`EngineLoader`).
 */

export const MAPLIBRE_VERSION = '5.6.0'
export const MAPLIBRE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`
export const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`

type LngLatLike = [number, number]

export interface LngLatBoundsLike {
  getWest(): number
  getEast(): number
  getNorth(): number
  getSouth(): number
}

export interface CameraOptions {
  center?: LngLatLike
  zoom?: number
  pitch?: number
  bearing?: number
  duration?: number
  easing?: (t: number) => number
  essential?: boolean
  padding?: { top: number; bottom: number; left: number; right: number }
}

export interface MapLike {
  on(type: string, listener: (event?: unknown) => void): unknown
  on(type: string, layerId: string, listener: (event?: unknown) => void): unknown
  off(type: string, listener: (event?: unknown) => void): unknown
  once(type: string, listener: (event?: unknown) => void): unknown
  project(lngLat: LngLatLike): { x: number; y: number }
  unproject(point: [number, number]): { lng: number; lat: number }
  getCenter(): { lng: number; lat: number }
  stop(): unknown
  loaded?(): boolean
  getBounds(): LngLatBoundsLike
  getZoom(): number
  getPitch(): number
  flyTo(options: CameraOptions): unknown
  easeTo(options: CameraOptions): unknown
  jumpTo(options: CameraOptions): unknown
  fitBounds(
    bounds: [LngLatLike, LngLatLike],
    options?: { padding?: CameraOptions['padding']; duration?: number; maxZoom?: number },
  ): unknown
  cameraForBounds(
    bounds: [LngLatLike, LngLatLike],
    options?: { padding?: CameraOptions['padding'] },
  ): { zoom?: number; center?: LngLatLike | { lng: number; lat: number } } | undefined
  setMinZoom?(zoom: number): unknown
  zoomIn(options?: { duration?: number }): unknown
  zoomOut(options?: { duration?: number }): unknown
  panBy(offset: [number, number], options?: { duration?: number }): unknown
  addSource(id: string, source: Record<string, unknown>): unknown
  addLayer(layer: Record<string, unknown>): unknown
  getLayer(id: string): unknown
  getSource(id: string): unknown
  removeLayer(id: string): unknown
  removeSource(id: string): unknown
  resize(): unknown
  remove(): void
  getCanvas?(): HTMLCanvasElement
}

export interface MapOptions {
  container: HTMLElement
  style: Record<string, unknown>
  bounds?: [LngLatLike, LngLatLike]
  maxBounds?: [LngLatLike, LngLatLike]
  minZoom?: number
  maxZoom?: number
  maxPitch?: number
  attributionControl?: false
  pixelRatio?: number
  center?: LngLatLike
  zoom?: number
  pitch?: number
  keyboard?: boolean
  dragRotate?: boolean
  pitchWithRotate?: boolean
  touchPitch?: boolean
  renderWorldCopies?: boolean
  fadeDuration?: number
  fitBoundsOptions?: { padding?: CameraOptions['padding'] | number }
  /** MapLibre 5: keep the canvas for `toDataURL` (off — the map is protected). */
  canvasContextAttributes?: { antialias?: boolean; preserveDrawingBuffer?: boolean }
}

export interface MapEngine {
  Map: new (options: MapOptions) => MapLike
}

export type EngineLoader = () => Promise<MapEngine>

declare global {
  interface Window {
    maplibregl?: MapEngine
  }
}

let pending: Promise<MapEngine> | null = null

/** Inject the pinned stylesheet + script once and resolve with `window.maplibregl`. */
export const loadMapLibre: EngineLoader = () => {
  if (window.maplibregl) return Promise.resolve(window.maplibregl)
  if (pending) return pending
  pending = new Promise<MapEngine>((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = MAPLIBRE_CSS
      link.crossOrigin = 'anonymous'
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = MAPLIBRE_JS
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => {
      if (window.maplibregl) resolve(window.maplibregl)
      else reject(new Error('maplibre-gl did not register'))
    }
    script.onerror = () => {
      pending = null
      script.remove()
      reject(new Error('maplibre-gl failed to load'))
    }
    document.head.appendChild(script)
  })
  return pending
}
