'use client'

/**
 * The interactive stage — pan, zoom, pins, HUD, paywall, detail panel.
 *
 * Ported from `MapPage` in design/handoff/sections-bt/page-map.jsx, keeping the
 * gesture model (pointer-events pan, wheel + pinch zoom, scale clamped 1–5,
 * translation clamped so the raster never leaves the frame), the HUD floating
 * above a stage it does not pan with, the paywall pinned to the bottom of the
 * frame, and the category-coloured pin with its pulsing halo.
 *
 * Four things the handoff got structurally wrong, fixed here:
 *
 *  1. **Scale.** It rendered a pin AND a floating info card for every place in
 *     the dataset, unconditionally, then set `opacity: 0.2` on the ones that
 *     did not match the filter. At the 500+ places the hero advertises that is
 *     1000+ mounted DOM nodes, every one of them re-styled on every frame of a
 *     pan. Here a pin is mounted only if it falls inside the current viewport
 *     bounds, no more than one pin is mounted per `DECLUSTER_CELL` of screen
 *     space, and a floating card is mounted only for the active pin (plus the
 *     hovered pin on pointers and viewports that can use one). Non-matching
 *     pins are unmounted, not dimmed.
 *
 *  2. **Wheel hijacking.** `onWheel` called `preventDefault()` on every event,
 *     so a visitor scrolling the page with the cursor anywhere over the map was
 *     trapped — the page stopped and the map zoomed instead. Zooming now needs
 *     an explicit signal: Ctrl/⌘ held (which is also what browsers synthesise
 *     for a trackpad pinch, so trackpad zoom keeps working untouched), or the
 *     scroll-to-zoom toggle in the zoom cluster. Without one, the event is left
 *     alone and the page scrolls. Two-finger pinch on touch is unaffected — it
 *     runs through the pointer handlers, not the wheel.
 *
 *  3. **Two coordinate systems.** See ./projection.ts. Pins and cards are both
 *     placed by projecting `lat`/`lon`; a card hangs off a zero-size anchor at
 *     its pin's projected point, so the two cannot drift.
 *
 *  4. **Pins grew with the zoom.** Pins and cards lived inside the scaled stage
 *     with no counter-transform, so at scale 5 a 14px dot drew at 70px and the
 *     info cards were bigger than the island. Each anchor counter-scales by
 *     1/s: markers stay glued to their geography and stay legible.
 *
 * Locked places are not drawn at all, and cannot be: the server sent
 * `{ id, locked, requiredEntitlement }` for each of them, with no coordinates
 * to put a marker on. That is the point. They are represented by the count in
 * the paywall bar.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { Icon, Photo } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import type { MapTaxonomy } from '@/lib/search/query'

import { MapFilterBar, useMapFilters } from './map-filters'
import { MapAccessBar } from './map-access-bar'
import { MapWatermark, protectionHandlers } from './map-protect'
import { MapResults } from './map-results'
import { NodePanel } from './node-panel'
import {
  buildPins,
  clamp,
  MAP_IMAGE_AVIF,
  MAP_IMAGE_SRC,
  projectArea,
  projectLat,
  projectLon,
  type MapClientPlace,
  type MapPin,
} from './projection'

/** Where an unentitled visitor goes to buy access. */

const MIN_SCALE = 1
const MAX_SCALE = 5

/** Zoom factor per wheel notch and per button press. */
const WHEEL_STEP = 1.18
const BUTTON_STEP = 1.4

/** Scale the deep link (`/map?place=slug`) settles on. */
const DEEP_LINK_SCALE = 2.6

/** Pointer travel, in px, past which a gesture is a drag and not a tap. */
const DRAG_THRESHOLD = 5

/** Keep pins mounted slightly outside the frame so panning does not pop them. */
const CULL_PADDING = 64

/**
 * Screen-space declustering grid, in px.
 *
 * A pin is 34px across, so one marker per 46px cell is roughly "as many as fit
 * without overlapping". This is what makes the page's cost independent of the
 * dataset: zoomed all the way out, a 1400x956 frame has ~630 cells, so 500 or
 * 50,000 places both render at most a few hundred markers. Zooming in shrinks
 * the geography each cell covers, so the hidden pins separate out naturally.
 */
const DECLUSTER_CELL = 46

/** Hard ceiling on mounted markers, whatever the grid says. */
const MAX_PINS = 250

/** Below this the frame is too small for a floating card to be readable. */
const HOVER_CARD_MIN_WIDTH = 1024

interface View {
  s: number
  x: number
  y: number
}

interface Point {
  x: number
  y: number
}

interface Gesture {
  pointers: Map<number, Point>
  panStart: { x: number; y: number; origin: Point } | null
  pinchDistance: number
  /** Set once the pointer travels far enough that the gesture is not a tap. */
  moved: boolean
  captured: boolean
}

/** `cluster` = عدد الأماكن المجمّعة تحت هذا الدبوس (1 = مكان واحد). */
type PlacedPin = MapPin & { sx: number; sy: number; cluster: number }

/** A zero-size anchor at a projected point. Scaling it about its own origin
 *  cannot move it, which is what lets children counter-scale for free. */
const ANCHOR: CSSProperties = {
  position: 'absolute',
  width: 0,
  height: 0,
  transformOrigin: '0 0',
}

export type MapExplorerProps = {
  /** Redacted payload. Locked entries carry an id and nothing else. */
  places: MapClientPlace[]
  lockedCount: number
  unlocked: boolean
  /** `?place=` from the URL, so `entityHref('place', slug)` lands on the pin. */
  initialSlug: string | null
  /** المناطق والتصنيفات والوسوم المفعّلة — بيانات عامة، لا شيء فيها مقفل. */
  taxonomy: MapTaxonomy
  /** المستخدم يملك VIP: أماكن VIP أولاً في النتائج. */
  vipFirst: boolean
  /**
   * "البريد · التاريخ" للمسجّل، null للزائر. يفعّل حماية النسخ والعلامة
   * المائية (الوثيقة 17).
   */
  viewerLabel: string | null
}

const wideQuery = () => `(min-width: ${HOVER_CARD_MIN_WIDTH}px)`

function subscribeWide(onChange: () => void): () => void {
  const media = window.matchMedia(wideQuery())
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function readWide(): boolean {
  return window.matchMedia(wideQuery()).matches
}

export function MapExplorer({
  places,
  lockedCount,
  unlocked,
  initialSlug,
  taxonomy,
  vipFirst,
  viewerLabel,
}: MapExplorerProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const format = useFormatter()

  // Deep link: /map?place=<slug>. The selection is knowable at first render, so
  // it is initial state rather than an effect that opens the panel a frame
  // late. Centring the view on it has to wait for the frame to be measured and
  // happens in the ResizeObserver below.
  const [activeId, setActiveId] = useState<string | null>(() => {
    if (initialSlug === null) return null
    const target = places.find((place) => !place.locked && place.slug === initialSlug)
    return target?.id ?? null
  })
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [view, setView] = useState<View>({ s: MIN_SCALE, x: 0, y: 0 })
  const [frame, setFrame] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)
  const [wheelZoom, setWheelZoom] = useState(false)
  // Read from the browser before paint, not set from an effect.
  const wideEnough = useSyncExternalStore(subscribeWide, readWide, () => false)
  const [paywallHeight, setPaywallHeight] = useState(0)
  /** null = تلقائي: تظهر المناطق وحدها حين يتعذّر الموقع. */
  const [showAreas, setShowAreas] = useState<boolean | null>(null)

  const frameRef = useRef<HTMLDivElement>(null)
  const paywallRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const appliedInitial = useRef(false)
  const viewRef = useRef<View>(view)
  const gestureRef = useRef<Gesture>({
    pointers: new Map(),
    panStart: null,
    pinchDistance: 0,
    moved: false,
    captured: false,
  })

  useEffect(() => {
    viewRef.current = view
  }, [view])

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------

  const pins = useMemo<MapPin[]>(
    () => buildPins(places, taxonomy.categories),
    [places, taxonomy.categories],
  )

  const filters = useMapFilters(pins, (pin) => setActiveId(pin.place.id), { taxonomy, vipFirst })
  const { matched } = filters

  // المناطق المتاحة على الخريطة (الوثيقة 9.3): دائرة واسم عند مركز كل منطقة لها
  // إحداثيات. تظهر تلقائياً حين يُرفض الموقع، كي يختار الزائر منطقة بدله.
  const geoFailed = filters.geoStatus === 'denied' || filters.geoStatus === 'outside'
  const areasOn = showAreas ?? geoFailed
  const areaMarks = useMemo(
    () =>
      taxonomy.regions.flatMap((region) => {
        const at = projectArea(region)
        return at === null ? [] : [{ region, ...at }]
      }),
    [taxonomy.regions],
  )

  const activePin = useMemo(
    () => (activeId === null ? null : (pins.find((pin) => pin.place.id === activeId) ?? null)),
    [pins, activeId],
  )

  /**
   * Viewport culling + declustering.
   *
   * A pin at projected (nx, ny) sits at stage pixel (nx·W, ny·H); the stage
   * transform puts it on screen at (x + nx·W·s, y + ny·H·s). That inversion is
   * the whole viewport test — no quadtree, no per-frame layout read.
   */
  const rendered = useMemo<PlacedPin[]>(() => {
    if (frame.w === 0 || frame.h === 0) return []

    const { s, x, y } = view
    // خلية → فهرس الدبوس الممثّل لها، كي تُعدّ الأماكن المخفية تحته (تجميع بعدد).
    const taken = new Map<string, number>()
    const out: PlacedPin[] = []

    const place = (pin: MapPin): PlacedPin => ({
      ...pin,
      sx: x + pin.nx * frame.w * s,
      sy: y + pin.ny * frame.h * s,
      cluster: 1,
    })

    // The selected pin is never culled and never declustered away — losing the
    // marker the panel is describing would be worse than a little overlap.
    if (activePin !== null) {
      const hot = place(activePin)
      taken.set(`${Math.floor(hot.sx / DECLUSTER_CELL)}:${Math.floor(hot.sy / DECLUSTER_CELL)}`, 0)
      out.push(hot)
    }

    for (const pin of matched) {
      if (activePin !== null && pin.place.id === activePin.place.id) continue

      const placed = place(pin)
      if (placed.sx < -CULL_PADDING || placed.sx > frame.w + CULL_PADDING) continue
      if (placed.sy < -CULL_PADDING || placed.sy > frame.h + CULL_PADDING) continue

      const cell = `${Math.floor(placed.sx / DECLUSTER_CELL)}:${Math.floor(placed.sy / DECLUSTER_CELL)}`
      const owner = taken.get(cell)
      if (owner !== undefined) {
        const representative = out[owner]
        if (representative !== undefined) representative.cluster += 1
        continue
      }
      if (out.length >= MAX_PINS) continue
      taken.set(cell, out.length)
      out.push(placed)
    }

    return out
  }, [matched, activePin, view, frame])

  /** At most two: the selected pin, and the one under the pointer. */
  const cardPins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = []
    if (activePin !== null) out.push(activePin)
    if (wideEnough && hoveredId !== null && hoveredId !== activeId) {
      const hovered = rendered.find((pin) => pin.place.id === hoveredId)
      if (hovered !== undefined) out.push(hovered)
    }
    return out
  }, [activePin, hoveredId, activeId, wideEnough, rendered])

  // -------------------------------------------------------------------------
  // View maths
  // -------------------------------------------------------------------------

  /**
   * Clamp the translation so the raster always covers the frame — ported from
   * the handoff's `clampView`. At s = 1 both bounds collapse to 0, which pins
   * the image exactly; above that the image may travel by the overhang and no
   * further, so no letterboxing can appear at any zoom.
   */
  const clampView = useCallback((next: View): View => {
    const element = frameRef.current
    if (element === null) return next
    const w = element.clientWidth
    const h = element.clientHeight
    return {
      s: next.s,
      x: clamp(next.x, w * (1 - next.s), 0),
      y: clamp(next.y, h * (1 - next.s), 0),
    }
  }, [])

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      setView((current) => {
        const s = clamp(current.s * factor, MIN_SCALE, MAX_SCALE)
        if (s === current.s) return current
        const k = s / current.s
        return clampView({ s, x: cx - (cx - current.x) * k, y: cy - (cy - current.y) * k })
      })
    },
    [clampView],
  )

  const zoomCentre = useCallback(
    (factor: number) => {
      const element = frameRef.current
      if (element === null) return
      zoomAt(element.clientWidth / 2, element.clientHeight / 2, factor)
    },
    [zoomAt],
  )

  const closePanel = useCallback(() => {
    setActiveId(null)
    const trigger = triggerRef.current
    triggerRef.current = null
    if (trigger !== null && trigger.isConnected) trigger.focus()
  }, [])

  const selectPin = (pin: MapPin, trigger: HTMLElement | null) => {
    // A pan that happens to end over a pin is not a tap on that pin.
    if (gestureRef.current.moved) return
    if (activeId === pin.place.id) {
      closePanel()
      return
    }
    triggerRef.current = trigger
    setActiveId(pin.place.id)
  }

  // -------------------------------------------------------------------------
  // Measurement
  // -------------------------------------------------------------------------

  useEffect(() => {
    const element = frameRef.current
    if (element === null) return

    const measure = () => {
      const w = element.clientWidth
      const h = element.clientHeight
      setFrame({ w, h })

      // First measurement is also when a deep link can finally be centred —
      // the maths needs the frame size, which does not exist until layout. Runs
      // once; every pan and zoom after this belongs to the visitor.
      if (appliedInitial.current || initialSlug === null || w === 0 || h === 0) return
      appliedInitial.current = true
      const target = places.find((place) => !place.locked && place.slug === initialSlug)
      if (target === undefined || target.locked) return
      const s = clamp(DEEP_LINK_SCALE, MIN_SCALE, MAX_SCALE)
      const nx = projectLon(target.lon)
      const ny = projectLat(target.lat)
      setView(clampView({ s, x: w / 2 - nx * w * s, y: h / 2 - ny * h * s }))
    }

    // ResizeObserver يستدعي `measure` فور المراقبة (القياس الأول) ثم عند كل تغيير —
    // لا استدعاء متزامن داخل التأثير (react-hooks/set-state-in-effect).
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [places, initialSlug, clampView])

  // The zoom cluster and the paywall both sit at the bottom of the frame, and
  // the paywall restacks into a column under 560px. Measure it rather than
  // guessing an offset that is wrong at one of the two breakpoints.
  useEffect(() => {
    // مفتوح: لا شريط، والإزاحة لا تقرأ `paywallHeight` أصلاً (انظر bt-zoom).
    const element = paywallRef.current
    if (element === null) return
    const measure = () => setPaywallHeight(element.offsetHeight)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [unlocked])

  // -------------------------------------------------------------------------
  // Wheel
  // -------------------------------------------------------------------------

  useEffect(() => {
    const element = frameRef.current
    if (element === null) return

    const onWheel = (event: WheelEvent) => {
      // No modifier and no zoom mode: leave the event alone so the page
      // scrolls. `ctrlKey` is what every browser sets for a trackpad pinch, so
      // that gesture zooms without the visitor pressing anything.
      if (!wheelZoom && !event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      zoomAt(
        event.clientX - rect.left,
        event.clientY - rect.top,
        event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP,
      )
    }

    // Non-passive is required to be *allowed* to preventDefault — but the
    // handler above only does so on the paths that actually zoom.
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [wheelZoom, zoomAt])

  useEffect(() => {
    if (activeId === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeId, closePanel])

  // -------------------------------------------------------------------------
  // Pointer gestures
  // -------------------------------------------------------------------------

  const relative = (event: { clientX: number; clientY: number }): Point | null => {
    const element = frameRef.current
    if (element === null) return null
    const rect = element.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  /**
   * Capture is taken lazily, only once a gesture has become a drag.
   *
   * The handoff captured on every `pointerdown`. With an active capture the
   * browser retargets the follow-up `click` at the capturing element, so a tap
   * on a pin was delivered to the stage instead of the pin. Capturing only
   * after the pointer has actually moved leaves taps alone and still keeps a
   * drag tracking when it leaves the frame.
   */
  const capture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (gesture.captured) return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
      gesture.captured = true
    } catch {
      // Safari throws for pointer ids it has already released. Panning still
      // works without capture; it just stops at the frame edge. Do not retry.
      gesture.captured = true
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    const point = relative(event)
    if (point === null) return

    gesture.pointers.set(event.pointerId, point)
    gesture.moved = false

    if (gesture.pointers.size === 1) {
      gesture.panStart = { x: viewRef.current.x, y: viewRef.current.y, origin: point }
      setDragging(true)
    } else if (gesture.pointers.size === 2) {
      const [a, b] = [...gesture.pointers.values()]
      if (a !== undefined && b !== undefined) {
        gesture.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
      }
      gesture.panStart = null
      capture(event)
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture.pointers.has(event.pointerId)) return
    const point = relative(event)
    if (point === null) return
    gesture.pointers.set(event.pointerId, point)

    if (gesture.pointers.size >= 2) {
      const [a, b] = [...gesture.pointers.values()]
      if (a === undefined || b === undefined) return
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (gesture.pinchDistance > 0) {
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, distance / gesture.pinchDistance)
      }
      gesture.pinchDistance = distance
      gesture.moved = true
      capture(event)
      return
    }

    const start = gesture.panStart
    if (start === null) return
    const dx = point.x - start.origin.x
    const dy = point.y - start.origin.y
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
      gesture.moved = true
      capture(event)
    }
    setView((current) => clampView({ s: current.s, x: start.x + dx, y: start.y + dy }))
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    gesture.pointers.delete(event.pointerId)
    if (gesture.pointers.size < 2) gesture.pinchDistance = 0

    if (gesture.pointers.size === 0) {
      gesture.panStart = null
      gesture.captured = false
      setDragging(false)
      return
    }

    // Lifting one finger out of a pinch re-seats the pan anchor on the finger
    // still down. Without this the map jumps by the gap between them.
    const [remaining] = [...gesture.pointers.values()]
    if (remaining !== undefined) {
      gesture.panStart = { x: viewRef.current.x, y: viewRef.current.y, origin: remaining }
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const counterScale = 1 / view.s
  const stageStyle: CSSProperties = {
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
    transformOrigin: '0 0',
  }

  const hoverable = (event: ReactPointerEvent<HTMLElement>) => event.pointerType === 'mouse'

  return (
    <div
      className={viewerLabel !== null ? 'bt-mapwrap bt-map-protected' : 'bt-mapwrap'}
      style={{ marginTop: 0 }}
    >
      <div className="bt-mapframe" ref={frameRef} {...protectionHandlers(viewerLabel !== null)}>
        <div
          className={dragging ? 'bt-stage grabbing' : 'bt-stage'}
          style={stageStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDragStart={(event) => event.preventDefault()}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(160deg,#0c4a63,#072a3e)',
            }}
          >
            <Photo
              src={MAP_IMAGE_SRC}
              srcSetAvif={MAP_IMAGE_AVIF}
              alt={t('mp_title')}
              priority
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                // `fill`, not `cover`: the raster's aspect ratio and the
                // frame's are both cut to the bounding box, so stretching to
                // the frame is exactly what keeps the projection honest.
                objectFit: 'fill',
              }}
            />
          </div>

          {areasOn &&
            areaMarks.map((mark) => {
              const on = filters.region === mark.region.key
              const label = pick(mark.region.label, locale, mark.region.key)
              return (
                <div key={`area-${mark.region.key}`}>
                  {/* الدائرة جغرافية: داخل المسرح، تكبر مع التقريب. */}
                  <div
                    className={on ? 'bt-area on' : 'bt-area'}
                    aria-hidden="true"
                    style={{
                      left: `${(mark.nx - mark.rx) * 100}%`,
                      top: `${(mark.ny - mark.ry) * 100}%`,
                      width: `${mark.rx * 200}%`,
                      height: `${mark.ry * 200}%`,
                    }}
                  />
                  {/* الاسم يبقى بحجمه، مثل الدبابيس. */}
                  <div
                    style={{
                      ...ANCHOR,
                      left: `${mark.nx * 100}%`,
                      top: `${mark.ny * 100}%`,
                      transform: `scale(${counterScale})`,
                    }}
                  >
                    <button
                      type="button"
                      className={on ? 'bt-area-label on' : 'bt-area-label'}
                      aria-pressed={on}
                      onClick={() => {
                        if (gestureRef.current.moved) return
                        filters.chooseRegion(on ? null : mark.region.key)
                      }}
                    >
                      <bdi>{label}</bdi>
                    </button>
                  </div>
                </div>
              )
            })}

          {rendered.map((pin) => {
            const hot = pin.place.id === activeId
            const dot = hot ? 18 : 14
            return (
              <div
                key={pin.place.id}
                style={{
                  ...ANCHOR,
                  // Physical `left`, deliberately. A satellite raster is not
                  // mirrored under `dir="rtl"`, so its pins must not be either
                  // — `inset-inline-start` would flip Bali east-to-west in
                  // Arabic while the image stayed put.
                  left: `${pin.nx * 100}%`,
                  top: `${pin.ny * 100}%`,
                  transform: `scale(${counterScale})`,
                }}
              >
                <button
                  type="button"
                  className={hot ? 'bt-node hot' : 'bt-node'}
                  aria-label={
                    pin.cluster > 1
                      ? t('map_cluster', { count: pin.cluster })
                      : pick(pin.place.name, locale, pin.place.slug)
                  }
                  aria-haspopup={pin.cluster > 1 ? undefined : 'dialog'}
                  aria-expanded={pin.cluster > 1 ? undefined : hot}
                  onClick={(event) => {
                    // مجموعة: تقريب حولها حتى تنفصل الأماكن؛ مكان واحد: فتح لوحته.
                    if (pin.cluster > 1 && !hot) {
                      if (gestureRef.current.moved) return
                      zoomAt(pin.sx, pin.sy, 2)
                      return
                    }
                    selectPin(pin, event.currentTarget)
                  }}
                  onPointerEnter={(event) => {
                    if (hoverable(event)) setHoveredId(pin.place.id)
                  }}
                  onPointerLeave={(event) => {
                    if (hoverable(event)) setHoveredId(null)
                  }}
                >
                  <span className="bt-node-pulse" style={{ background: pin.color }} />
                  <span
                    className="bt-node-dot"
                    style={{ background: pin.color, width: dot, height: dot }}
                  />
                  {pin.cluster > 1 && !hot && (
                    <span className="bt-node-count" aria-hidden="true">
                      {format.number(pin.cluster)}
                    </span>
                  )}
                </button>
              </div>
            )
          })}

          {cardPins.map((pin) => {
            const hot = pin.place.id === activeId
            const name = pick(pin.place.name, locale, pin.place.slug)
            const category = pickOptional(pin.place.category, locale)
            // Cards on the eastern half of the island open westward so they
            // never run off the frame. Physical, for the same reason as `left`.
            const tx = pin.nx > 0.55 ? 'calc(-100% - 18px)' : '18px'
            const cardStyle: CSSProperties & { '--tx': string } = {
              '--tx': tx,
              transform: `translate(${tx}, -50%)`,
            }

            return (
              <div
                key={`card-${pin.place.id}`}
                style={{
                  ...ANCHOR,
                  left: `${pin.nx * 100}%`,
                  top: `${pin.ny * 100}%`,
                  transform: `scale(${counterScale})`,
                }}
              >
                <button
                  type="button"
                  className={hot ? 'bt-pcard in hot' : 'bt-pcard in'}
                  style={cardStyle}
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={(event) => selectPin(pin, event.currentTarget)}
                >
                  <span className="bt-pthumb">
                    <Photo src={pin.place.heroImageUrl} alt="" />
                  </span>
                  <span className="bt-pmeta">
                    <span className="bt-pname">{name}</span>
                    {category !== null && <span className="bt-pcat">{category}</span>}
                    {pin.place.rating !== null && (
                      <span className="bt-prate">
                        <span style={{ color: '#FFD27A' }}>
                          ★ {format.number(pin.place.rating, { maximumFractionDigits: 1 })}
                        </span>
                      </span>
                    )}
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        {viewerLabel !== null && <MapWatermark label={viewerLabel} />}

        {/* HUD. A sibling of the stage, not a child, so it never pans. */}
        <MapFilterBar f={filters}>
          <button
            type="button"
            className={areasOn ? 'bt-mchip on' : 'bt-mchip'}
            aria-pressed={areasOn}
            onClick={() => setShowAreas(!areasOn)}
          >
            <Icon name="globe" size={13} /> {t('map_show_areas')}
          </button>
        </MapFilterBar>

        <div className="bt-zoom" style={{ bottom: unlocked ? 14 : paywallHeight + 24 }}>
          <button
            type="button"
            onClick={() => zoomCentre(BUTTON_STEP)}
            aria-label={t('map_zoom_in')}
          >
            <Icon name="plus" size={18} color="#fff" />
          </button>
          <button
            type="button"
            onClick={() => zoomCentre(1 / BUTTON_STEP)}
            aria-label={t('map_zoom_out')}
          >
            <span className="bt-minus" />
          </button>
          <button
            type="button"
            onClick={() => setView({ s: MIN_SCALE, x: 0, y: 0 })}
            aria-label={t('map_reset')}
            className={view.s > 1.01 ? undefined : 'off'}
          >
            <Icon name="compass" size={17} color="#fff" />
          </button>
          <button
            type="button"
            onClick={() => setWheelZoom((on) => !on)}
            aria-label={t('map_wheel_zoom')}
            aria-pressed={wheelZoom}
            className={wheelZoom ? undefined : 'off'}
          >
            <Icon name="search" size={17} color="#fff" />
          </button>
        </div>

        <MapAccessBar unlocked={unlocked} lockedCount={lockedCount} barRef={paywallRef} />

        {activePin !== null && <NodePanel pin={activePin} onClose={closePanel} />}
      </div>

      <p className="bt-maptip">
        <span aria-live="polite">{t('map_results_n', { n: matched.length })}</span>
        {' · '}
        {t('map_wheel_hint')}
      </p>

      <MapResults
        pins={matched}
        near={filters.near}
        onShow={(pin) => {
          setActiveId(pin.place.id)
          frameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }}
      />

      {viewerLabel !== null && <p className="bt-map-printnote">{t('map_print_blocked')}</p>}
    </div>
  )
}
