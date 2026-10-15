/**
 * The map engine — an imperative controller the React page drives (no React
 * in here, so it can run in a plain test page too).
 *
 *  - The REAL 3D map (MapLibre: terrain, satellite, sky/fog) is the map. It
 *    opens on the whole island, tilted, so the sea gets the atmosphere from
 *    the first frame; zooming out is clamped so the island stays framed.
 *  - The client's illustrated artwork is the POSTER under it while MapLibre
 *    and the first tiles load (faded out on the first idle), and the
 *    FALLBACK when MapLibre, WebGL or the tiles fail: then it stays, and is
 *    pannable/zoomable on its own (drag, pinch, wheel, double-click, keys).
 *
 * Everything the page draws on top (place pins, region bubbles, landmarks,
 * "you are here") asks `project(lng, lat)`, which answers for whichever view
 * is showing, so the same HTML markers live on both.
 */

import { ART_H, ART_W, artToGeo, clampToArt, geoToArt, zoomFor, type Pt } from './art-warp'
import { easeInOutCubic } from './geo'
import { REAL_BOUNDS, type MapSettings } from './map-style'
import type { MapEngine, MapLike } from './maplibre-loader'
import { createRealMap } from './real-map'

/** Artwork scale cap (× the fitted size) for the fallback view. */
export const MAX_S = 7
/** Slight bearing of the opening camera (degrees). */
const HOME_BEARING = -8
/** How far past the framed island the visitor may zoom OUT (zoom levels). */
const MIN_ZOOM_SLACK = 0.6

export type ViewMode = 'art' | 'switching' | 'map'
export type RealMapState = 'idle' | 'loading' | 'ready' | 'failed'
export type ViewEvent = 'move' | 'moveend' | 'mode' | 'realmap'

export interface Pad {
  top: number
  bottom: number
  left: number
  right: number
}

export interface GeoBounds {
  west: number
  east: number
  north: number
  south: number
}

export interface HybridOptions {
  /** The view box (same size as the art layer and the map container). */
  root: HTMLElement
  /** Transformed wrapper (ART_W × ART_H) holding the image and the mask. */
  stage: HTMLElement
  img: HTMLImageElement
  /** Full-resolution artwork, swapped in once the visitor zooms past the small one. */
  fullSrc: string
  smallWidth: number
  mapContainer: HTMLElement
  settings: MapSettings
  /** Free-area outline (lon/lat ring) for the dimming mask; null = no mask. */
  freeZone: [number, number][] | null
  /** Page language, for the map's own labels. */
  locale: string
  /** Open on this point (deep link) instead of the whole island. */
  initial?: { lng: number; lat: number; zoom: number } | null
  /** Screen area kept clear of the panel / bars (physical px). */
  padding: () => Pad
  reducedMotion: () => boolean
  onEvent: (event: ViewEvent) => void
}

const NO_PAD: Pad = { top: 0, bottom: 0, left: 0, right: 0 }

export class HybridView {
  private o: HybridOptions
  private V = { s: 1, tx: 0, ty: 0, base: 1, w: 0, h: 0 }
  private pad: Pad = NO_PAD
  private modeValue: ViewMode = 'art'
  private shown = false
  /** Real-map zoom of the framed island (the page's "z0" on the real map). */
  private homeZoomMap = 9
  private tilted = true
  private anim = 0
  private endTimer = 0
  private timers: number[] = []
  private pts = new Map<number, Pt>()
  private downAt = new Map<number, Pt>()
  private captured = false
  private last: { n: number; x: number; y: number; d: number } | null = null
  private moved = false
  private upgraded = false
  private map: MapLike | null = null
  private realState: RealMapState = 'idle'
  private tilesOk = false
  private tileErrors = 0
  private ro: ResizeObserver | null = null
  private destroyed = false
  private cleanups: (() => void)[] = []

  constructor(options: HybridOptions) {
    this.o = options
    const { stage } = options
    stage.style.width = `${ART_W}px`
    stage.style.height = `${ART_H}px`
    // Wheel / double-click anywhere on the view (also over a pin or bubble).
    this.listen(options.root, 'wheel', this.onWheel, { passive: false })
    // Pointer gestures on the whole view, so a drag or pinch that starts on a
    // pin or bubble still moves the artwork (a plain tap still clicks it).
    const { root } = options
    this.listen(root, 'pointerdown', this.onDown)
    this.listen(root, 'pointermove', this.onMove)
    this.listen(root, 'pointerup', this.onUp)
    this.listen(root, 'pointercancel', this.onUp)
    this.listen(options.root, 'dblclick', this.onDbl)
    this.listen(options.img, 'load', () => this.layout())
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.layout())
      this.ro.observe(options.root)
    } else {
      this.listen(window, 'resize', () => this.layout())
    }
    this.layout()
  }

  // ---- public read API ----------------------------------------------------

  get mode(): ViewMode {
    return this.modeValue
  }

  /** The real map is faded in (from the start of the cross-fade until the way back starts). */
  get mapVisible(): boolean {
    return this.shown
  }

  get realMapState(): RealMapState {
    return this.realState
  }

  /** Tiles errored and none ever loaded: the real map would be blank. */
  get tilesFailed(): boolean {
    return this.tileErrors > 0 && !this.tilesOk
  }

  get canEnterRealMap(): boolean {
    return this.realState === 'ready' && !this.tilesFailed
  }

  /** The real map is tilted (3D) rather than looking straight down. */
  get isTilted(): boolean {
    return this.tilted
  }

  /** Screen position (px in the view box) of a lon/lat, for the current view. */
  project(lng: number, lat: number): { x: number; y: number } {
    if (this.modeValue === 'map' && this.map !== null) return this.map.project([lng, lat])
    const [ax, ay] = geoToArt(lng, lat)
    const k = this.V.base * this.V.s
    return { x: this.V.tx + ax * k, y: this.V.ty + ay * k }
  }

  /** The visible area as a lon/lat box. */
  bounds(): GeoBounds {
    if (this.modeValue === 'map' && this.map !== null) {
      const b = this.map.getBounds()
      return { west: b.getWest(), east: b.getEast(), north: b.getNorth(), south: b.getSouth() }
    }
    const { w, h } = this.V
    const p = this.pad
    const corners = [
      this.screenToArt(p.left, p.top),
      this.screenToArt(w - p.right, p.top),
      this.screenToArt(p.left, h - p.bottom),
      this.screenToArt(w - p.right, h - p.bottom),
    ].map((c) => artToGeo(...clampToArt(c)))
    const lngs = corners.map((c) => c[0])
    const lats = corners.map((c) => c[1])
    return {
      west: Math.min(...lngs),
      east: Math.max(...lngs),
      north: Math.max(...lats),
      south: Math.min(...lats),
    }
  }

  /** A MapLibre-comparable zoom for the current view (both modes). */
  zoom(): number {
    if (this.modeValue === 'map' && this.map !== null) return this.map.getZoom()
    const c = clampToArt(this.screenToArt(this.V.w / 2, this.V.h / 2))
    return zoomFor(c[0], c[1], this.V.base * this.V.s)
  }

  /**
   * How far past the whole-island view the visitor has zoomed, in zoom levels
   * (log2 of the artwork scale). The page's "pins instead of bubbles" and
   * "labels" thresholds use this; on the real map it keeps growing with the
   * map zoom.
   */
  levels(): number {
    if (this.modeValue === 'map' && this.map !== null) return this.map.getZoom() - this.homeZoomMap
    return Math.log2(this.V.s)
  }

  // ---- real map -------------------------------------------------------------

  /** Build the real map under the artwork (so its overview tiles are cached early). */
  attachEngine(engine: MapEngine): void {
    if (this.destroyed || this.map !== null) return
    this.setReal('loading')
    let map: MapLike
    try {
      map = createRealMap(engine, this.o.mapContainer, this.o.settings, {
        freeZone: this.o.freeZone,
        locale: this.o.locale,
      })
    } catch {
      // No WebGL, or the engine refused: the artwork stays fully usable.
      this.setReal('failed')
      return
    }
    this.map = map
    // Diagnostics hook for the CI screenshot run (?debugmap); harmless otherwise.
    if (typeof window !== 'undefined' && window.location.search.includes('debugmap')) {
      ;(window as unknown as { __btMap?: unknown }).__btMap = map
    }
    map.on('load', () => {
      if (this.destroyed) return
      this.setReal('ready')
      this.openCamera(map)
      let shown = false
      const show = () => {
        if (shown || this.destroyed || this.tilesFailed) return
        shown = true
        // The poster fades out (CSS; instant with reduced motion).
        this.setMode('map', true)
        this.o.onEvent('move')
        this.o.onEvent('moveend')
      }
      map.once('idle', show)
      // Don't wait forever for slow tiles.
      this.later(show, 2500)
    })
    map.on('error', (event) => {
      const e = event as { tile?: unknown; sourceId?: string } | undefined
      if (e && (e.tile !== undefined || e.sourceId !== undefined)) {
        this.tileErrors += 1
        // Tiles failing and none ever loaded: back to the artwork.
        if (this.tilesFailed && this.modeValue !== 'art') this.setMode('art', false)
        this.o.onEvent('realmap')
      }
    })
    map.on('data', (event) => {
      const e = event as { dataType?: string; tile?: unknown } | undefined
      if (!this.tilesOk && e?.dataType === 'source' && e.tile !== undefined) {
        this.tilesOk = true
        this.o.onEvent('realmap')
      }
    })
    map.on('move', () => {
      if (this.modeValue === 'map') this.o.onEvent('move')
    })
    map.on('moveend', () => {
      if (this.modeValue === 'map') this.o.onEvent('moveend')
    })
  }

  /** The framed island, tilted: zoom from the bounds, then clamp zooming out. */
  private homeCamera(map: MapLike) {
    const p = this.pad
    const fit = map.cameraForBounds(REAL_BOUNDS, {
      padding: { top: p.top, bottom: p.bottom, left: p.left, right: p.right },
    })
    const zoom = fit?.zoom ?? 9
    const c = fit?.center
    const center: [number, number] = Array.isArray(c)
      ? [c[0], c[1]]
      : c
        ? [c.lng, c.lat]
        : [115.06, -8.465]
    return { center, zoom }
  }

  private openCamera(map: MapLike) {
    map.resize()
    const home = this.homeCamera(map)
    this.homeZoomMap = home.zoom
    map.setMinZoom?.(home.zoom - MIN_ZOOM_SLACK)
    const start = this.o.initial
    map.jumpTo({
      center: start ? [start.lng, start.lat] : home.center,
      zoom: start ? Math.max(start.zoom, home.zoom) : home.zoom,
      pitch: this.tilted ? this.o.settings.tiltOnEnter : 0,
      bearing: HOME_BEARING,
    })
  }

  /** The engine script itself failed to load. */
  engineFailed(): void {
    this.setReal('failed')
  }

  private setReal(state: RealMapState) {
    this.realState = state
    this.o.onEvent('realmap')
  }

  private setMode(mode: ViewMode, shown = this.shown) {
    this.modeValue = mode
    this.shown = shown
    this.o.onEvent('mode')
  }

  /** 3D (tilted) or straight down — the real map only. */
  setTilt(on: boolean): void {
    this.tilted = on
    const map = this.map
    if (map === null || this.modeValue !== 'map') return
    map.easeTo({
      pitch: on ? this.o.settings.tiltOnEnter : 0,
      duration: this.o.reducedMotion() ? 0 : 850,
      essential: true,
    })
  }

  // ---- camera commands (both modes) -----------------------------------------

  /**
   * Centre a place / region: on the artwork at `artLevels` zoom levels past the
   * whole island (staying on the artwork), on the real map at `realZoom` or
   * closer.
   */
  flyTo(lng: number, lat: number, artLevels: number, realZoom: number): void {
    if (this.modeValue === 'map' && this.map !== null) {
      const zoom = Math.max(this.map.getZoom(), realZoom)
      const pitch = this.tilted ? this.o.settings.tiltOnEnter : 0
      const options = { center: [lng, lat] as [number, number], zoom, pitch }
      if (this.o.reducedMotion()) this.map.jumpTo(options)
      else this.map.flyTo({ ...options, duration: 1200, essential: true })
      return
    }
    if (this.modeValue !== 'art') return
    const a = clampToArt(geoToArt(lng, lat))
    const s = Math.max(1, Math.min(MAX_S, Math.pow(2, artLevels)))
    this.animateTo(s, a, 850)
  }

  /** The whole island, framed (either view). */
  home(): void {
    const map = this.map
    if (this.modeValue === 'map' && map !== null) {
      const home = this.homeCamera(map)
      const options = {
        ...home,
        pitch: this.tilted ? this.o.settings.tiltOnEnter : 0,
        bearing: HOME_BEARING,
      }
      if (this.o.reducedMotion()) map.jumpTo(options)
      else map.flyTo({ ...options, duration: 1200, essential: true })
      return
    }
    if (this.modeValue !== 'art') return
    this.animateTo(1, [ART_W / 2, ART_H / 2], 850)
  }

  zoomBy(dir: 1 | -1): void {
    if (this.modeValue === 'map' && this.map !== null) {
      if (dir > 0) this.map.zoomIn({ duration: 300 })
      else this.map.zoomOut({ duration: 300 })
      return
    }
    this.animateArt(dir > 0 ? 1.8 : 1 / 1.8, this.V.w / 2, this.V.h / 2, 500)
  }

  panBy(dx: number, dy: number): void {
    if (this.modeValue === 'map' && this.map !== null) {
      this.map.panBy([dx, dy], { duration: 200 })
      return
    }
    if (this.modeValue !== 'art') return
    this.V.tx -= dx
    this.V.ty -= dy
    this.clampView()
    this.render()
    this.endSoon()
  }

  /** Re-measure (container resized). */
  layout(): void {
    const { root } = this.o
    const V = this.V
    const w = root.clientWidth
    const h = root.clientHeight
    if (w === 0 || h === 0) return
    // Keep the centred artwork point while the box changes size.
    const centre = V.w > 0 ? this.screenToArt(V.w / 2, V.h / 2) : null
    V.w = w
    V.h = h
    this.pad = this.o.padding()
    const availW = Math.max(80, w - this.pad.left - this.pad.right)
    const availH = Math.max(80, h - this.pad.top - this.pad.bottom)
    V.base = Math.min(availW / ART_W, availH / ART_H)
    if (centre !== null && V.s > 1) {
      const k = V.base * V.s
      V.tx = w / 2 - centre[0] * k
      V.ty = h / 2 - centre[1] * k
    }
    this.clampView()
    this.render()
    this.map?.resize()
    this.o.onEvent('move')
    this.endSoon()
  }

  destroy(): void {
    this.destroyed = true
    cancelAnimationFrame(this.anim)
    window.clearTimeout(this.endTimer)
    for (const id of this.timers) window.clearTimeout(id)
    for (const off of this.cleanups) off()
    this.ro?.disconnect()
    this.map?.remove()
    this.map = null
  }

  // ---- artwork viewer -------------------------------------------------------

  private screenToArt(px: number, py: number): Pt {
    const k = this.V.base * this.V.s
    return [(px - this.V.tx) / k, (py - this.V.ty) / k]
  }

  private clampView() {
    const V = this.V
    const p = this.pad
    const k = V.base * V.s
    const dw = ART_W * k
    const dh = ART_H * k
    const availW = V.w - p.left - p.right
    const availH = V.h - p.top - p.bottom
    V.tx =
      dw <= availW
        ? p.left + (availW - dw) / 2
        : Math.min(p.left, Math.max(V.w - p.right - dw, V.tx))
    V.ty =
      dh <= availH
        ? p.top + (availH - dh) / 2
        : Math.min(p.top, Math.max(V.h - p.bottom - dh, V.ty))
  }

  private render() {
    const V = this.V
    const k = V.base * V.s
    this.o.stage.style.transform = `translate(${V.tx}px, ${V.ty}px) scale(${k})`
    // Swap in the full-resolution artwork once the small one would be stretched.
    if (!this.upgraded && ART_W * k * (window.devicePixelRatio || 1) > this.o.smallWidth * 1.05) {
      this.upgraded = true
      const img = this.o.img
      if (!img.currentSrc.endsWith(this.o.fullSrc)) {
        const full = new Image()
        full.decoding = 'async'
        full.onload = () => {
          img.srcset = ''
          img.src = this.o.fullSrc
        }
        full.src = this.o.fullSrc
      }
    }
    if (this.modeValue !== 'map') this.o.onEvent('move')
  }

  private zoomArt(factor: number, px: number, py: number) {
    if (this.modeValue !== 'art') return
    const V = this.V
    const before = this.screenToArt(px, py)
    V.s = Math.max(1, Math.min(MAX_S, V.s * factor))
    const k = V.base * V.s
    V.tx = px - before[0] * k
    V.ty = py - before[1] * k
    this.clampView()
    this.render()
  }

  private animateArt(factor: number, px: number, py: number, ms: number) {
    cancelAnimationFrame(this.anim)
    if (this.o.reducedMotion()) {
      this.zoomArt(factor, px, py)
      this.endSoon()
      return
    }
    const t0 = performance.now()
    let done = 1
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      const e = 1 - Math.pow(1 - t, 3)
      const target = Math.pow(factor, e)
      this.zoomArt(target / done, px, py)
      done = target
      if (t < 1 && this.modeValue === 'art') this.anim = requestAnimationFrame(step)
      else this.endSoon()
    }
    step(t0)
  }

  /** Animate to scale `s` with artwork point `a` in the middle of the clear area. */
  private animateTo(s: number, a: Pt, ms: number) {
    cancelAnimationFrame(this.anim)
    const V = this.V
    const p = this.pad
    const cx = p.left + (V.w - p.left - p.right) / 2
    const cy = p.top + (V.h - p.top - p.bottom) / 2
    const s0 = V.s
    const c0 = this.screenToArt(cx, cy)
    const apply = (e: number) => {
      V.s = s0 * Math.pow(s / s0, e)
      const k = V.base * V.s
      const x = c0[0] + (a[0] - c0[0]) * e
      const y = c0[1] + (a[1] - c0[1]) * e
      V.tx = cx - x * k
      V.ty = cy - y * k
      this.clampView()
      this.render()
    }
    if (this.o.reducedMotion()) {
      apply(1)
      this.endSoon()
      return
    }
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms)
      apply(easeInOutCubic(t))
      if (t < 1 && this.modeValue === 'art') this.anim = requestAnimationFrame(step)
      else this.endSoon()
    }
    this.anim = requestAnimationFrame(step)
  }

  /** "Camera settled" for the art view (debounced like MapLibre's moveend). */
  private endSoon() {
    window.clearTimeout(this.endTimer)
    this.endTimer = window.setTimeout(() => {
      if (this.modeValue === 'art') this.o.onEvent('moveend')
    }, 120)
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(fn, ms))
  }

  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ) {
    const fn = handler as EventListener
    target.addEventListener(type, fn, options)
    this.cleanups.push(() => target.removeEventListener(type, fn, options))
  }

  // ---- input --------------------------------------------------------------

  private onWheel = (e: WheelEvent) => {
    if (this.modeValue !== 'art') return
    e.preventDefault()
    cancelAnimationFrame(this.anim)
    const r = this.o.root.getBoundingClientRect()
    const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
    this.zoomArt(Math.exp(-d * 0.0022), e.clientX - r.left, e.clientY - r.top)
    this.endSoon()
  }

  private onDown = (e: PointerEvent) => {
    if (this.modeValue !== 'art') return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    cancelAnimationFrame(this.anim)
    this.pts.set(e.pointerId, [e.clientX, e.clientY])
    this.downAt.set(e.pointerId, [e.clientX, e.clientY])
    this.last = null
    if (this.pts.size === 1) {
      this.moved = false
      this.captured = false
    }
  }

  /**
   * Capture only once it is a gesture (moved a few px, or two fingers): taking
   * the pointer on pointerdown would retarget a plain tap's click away from
   * the pin or bubble under it.
   */
  private capture() {
    if (this.captured) return
    this.captured = true
    for (const id of this.pts.keys()) {
      try {
        this.o.root.setPointerCapture(id)
      } catch {
        // A synthetic pointer (tests) cannot be captured; the gesture still works.
      }
    }
  }

  private onMove = (e: PointerEvent) => {
    if (!this.pts.has(e.pointerId) || this.modeValue !== 'art') return
    this.pts.set(e.pointerId, [e.clientX, e.clientY])
    if (!this.captured) {
      const start = this.downAt.get(e.pointerId)
      const far = start !== undefined && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4
      if (!far && this.pts.size < 2) return
      this.capture()
    }
    const list = [...this.pts.values()]
    const r = this.o.root.getBoundingClientRect()
    const V = this.V
    const a = list[0]
    const b = list[1]
    if (list.length === 1 && a !== undefined) {
      if (this.last && this.last.n === 1) {
        V.tx += a[0] - this.last.x
        V.ty += a[1] - this.last.y
        this.moved = true
        this.clampView()
        this.render()
      }
      this.last = { n: 1, x: a[0], y: a[1], d: 0 }
    } else if (a !== undefined && b !== undefined) {
      const cx = (a[0] + b[0]) / 2 - r.left
      const cy = (a[1] + b[1]) / 2 - r.top
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1])
      if (this.last && this.last.n === 2 && this.last.d > 0) {
        V.tx += cx - this.last.x
        V.ty += cy - this.last.y
        this.moved = true
        this.zoomArt(dist / this.last.d, cx, cy)
      }
      this.last = { n: 2, x: cx, y: cy, d: dist }
    }
  }

  private onUp = (e: PointerEvent) => {
    this.pts.delete(e.pointerId)
    this.downAt.delete(e.pointerId)
    this.last = null
    if (this.moved) this.endSoon()
  }

  private onDbl = (e: MouseEvent) => {
    if (this.modeValue !== 'art') return
    const r = this.o.root.getBoundingClientRect()
    this.animateArt(2.2, e.clientX - r.left, e.clientY - r.top, 650)
  }
}
