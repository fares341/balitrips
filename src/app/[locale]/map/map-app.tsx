'use client'

/**
 * The interactive map (v3): design-reference/prototype/map.html, screens
 * 03-map, 03b-map-region-ubud, 03c-map-place-card, 03d-map-3d.
 *
 * Engine: MapLibre GL from a pinned CDN build (./maplibre-loader.ts) drawing
 * the package satellite raster as an `image` source (./geo.ts). Everything
 * interactive on top of it — region bubbles, place pins, the glass place
 * label — is an HTML overlay positioned with `map.project()` on every camera
 * move, so it follows pan, zoom and the 3D tilt.
 *
 * Data: only what the server decided this viewer may have (`page.tsx` →
 * `buildMapPayload`). A locked place is `{ id, locked, requiredEntitlement }`
 * with no coordinates and cannot be drawn. Locked AREAS are drawn from
 * region-level data (`regions` prop: region centre + a count), computed on the
 * server.
 *
 * Accessibility: the canvas is `role="application"` with arrow-key panning
 * and +/− zoom; the side list (rendered on the server too) is the text
 * alternative — every visible place is a real button there.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Breadcrumbs, Button, Chip, LinkButton, Stars, Tag } from '@/components/bt'
import { Icon, Photo } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick, pickOptional } from '@/lib/content/localize'
import { haversineKm } from '@/lib/geo'
import type { MapTaxonomy } from '@/lib/search/query'

import {
  FLY_MS,
  IMAGE_SIZE,
  ISLAND_BOUNDS,
  MAX_BOUNDS,
  MAX_ZOOM,
  MIN_ZOOM,
  categoryIcon,
  circleRing,
  declutter,
  easeInOutCubic,
  geoToImagePx,
  imageCorners,
  inBounds,
  type ViewBounds,
} from './geo'
import { useMapFilters } from './map-filters'
import { MapWatermark, protectionHandlers } from './map-protect'
import { loadMapLibre, type EngineLoader, type MapLike } from './maplibre-loader'
import { PlaceActions } from './place-actions'
import { buildPins, type MapClientPlace, type MapPin, type OpenMapPlace } from './projection'
import type { FreeZone, RegionBubble } from './regions'

const SAT_URL = '/brand/bali-sat.jpg'
const SAT_LOCKED_URL = '/brand/bali-sat-locked.jpg'
const FALLBACK_THUMB = '/brand/jungle.jpg'
const PLANS_HREF = '/plans'
const DRIVER_HREF = '/driver'
/** Results follow the visible area once the camera settles. */
const BOUNDS_DEBOUNCE_MS = 180
/** Zoom past the fitted island (in zoom levels) where pins replace bubbles… */
const PINS_AT = 0.63
/** …and where every pin shows its glass label. */
const LABELS_AT = 1.23

type Sheet = 'peek' | 'half' | 'full'

export interface MapAppProps {
  places: MapClientPlace[]
  lockedCount: number
  unlocked: boolean
  initialSlug: string | null
  initialQuery?: string
  initialCategory?: string | null
  initialRegion?: string | null
  taxonomy: MapTaxonomy
  vipFirst: boolean
  /** "email · date" watermark for signed-in viewers; null for guests. */
  viewerLabel: string | null
  regions: RegionBubble[]
  freeZone: FreeZone | null
  /** The map plan's real price, formatted; null when no plan is on sale. */
  price: string | null
  /** Test seam: replaces the CDN loader. */
  loadEngine?: EngineLoader
}

interface ScreenState {
  mode: 'regions' | 'places'
  labels: boolean
  bubbles: { key: string; x: number; y: number; ox: number; oy: number }[]
  pins: { slug: string; x: number; y: number }[]
  me: { x: number; y: number } | null
}

const EMPTY_SCREEN: ScreenState = {
  mode: 'regions',
  labels: false,
  bubbles: [],
  pins: [],
  me: null,
}

function isMobile(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function inRegion(place: OpenMapPlace, key: string): boolean {
  return place.regionKey === key || place.parentRegionKey === key
}

/** Bubble footprint for the overlap solver (px), from its text length. */
function bubbleSize(label: string, locked: boolean, mobile: boolean) {
  return mobile
    ? { w: 58 + label.length * 6.6 + (locked ? 16 : 0), h: 30 }
    : { w: 92 + label.length * 8.6 + (locked ? 22 : 0), h: 48 }
}

/** Builds the paywall layer: the blurred raster with the free area cut out. */
function lockedCanvas(img: HTMLImageElement, zone: FreeZone): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = IMAGE_SIZE.w
  canvas.height = IMAGE_SIZE.h
  const ctx = canvas.getContext('2d')
  if (ctx === null) return canvas
  ctx.drawImage(img, 0, 0, IMAGE_SIZE.w, IMAGE_SIZE.h)
  const c = geoToImagePx(zone.lat, zone.lon)
  const dLat = zone.radiusKm / 111.32
  const dLon = zone.radiusKm / (111.32 * Math.cos((zone.lat * Math.PI) / 180))
  const rx = dLon * 485 * 2.048
  const ry = dLat * 485 * 2.048
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.translate(c.x, c.y)
  ctx.scale(1, ry / rx)
  const g = ctx.createRadialGradient(0, 0, rx * 0.86, 0, 0, rx * 1.02)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, rx * 1.02, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  return canvas
}

export function MapApp(props: MapAppProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const { unlocked, freeZone, regions, price, viewerLabel } = props

  const pins = useMemo<MapPin[]>(
    () => buildPins(props.places, props.taxonomy.categories),
    [props.places, props.taxonomy.categories],
  )

  const [selectedSlug, setSelectedSlug] = useState<string | null>(props.initialSlug)
  const [lockedPick, setLockedPick] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet>(props.initialSlug === null ? 'peek' : 'half')
  const [is3d, setIs3d] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [bounds, setBounds] = useState<ViewBounds | null>(null)
  const [screen, setScreen] = useState<ScreenState>(EMPTY_SCREEN)
  const [geoAsk, setGeoAsk] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [howto, setHowto] = useState(false)

  const appRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const sideRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLike | null>(null)
  const z0Ref = useRef(8.6)
  const frameRef = useRef(0)
  const settleRef = useRef(0)

  const flyToPlace = useCallback((place: OpenMapPlace) => {
    const map = mapRef.current
    if (map === null) return
    const zoom = Math.min(MAX_ZOOM, Math.max(map.getZoom(), z0Ref.current + 1.6))
    const options = { center: [place.lon, place.lat] as [number, number], zoom }
    if (reducedMotion()) map.jumpTo(options)
    else map.flyTo({ ...options, duration: FLY_MS, easing: easeInOutCubic, essential: true })
  }, [])

  const select = useCallback(
    (slug: string, fly: boolean) => {
      setSelectedSlug(slug)
      setLockedPick(null)
      if (isMobile()) setSheet('half')
      const pin = pins.find((entry) => entry.place.slug === slug)
      if (fly && pin) flyToPlace(pin.place)
    },
    [pins, flyToPlace],
  )

  const filters = useMapFilters(pins, (pin) => select(pin.place.slug, true), {
    taxonomy: props.taxonomy,
    vipFirst: props.vipFirst,
    initialQuery: props.initialQuery,
    initialCategory: props.initialCategory,
    initialRegion: props.initialRegion,
  })
  const { matched, near } = filters

  // Everything the camera handlers read lives here, so the MapLibre listeners
  // (registered once) always see the current render's values.
  const live = useRef({ matched, near, regions, pins, initialSlug: props.initialSlug })
  useEffect(() => {
    live.current = { matched, near, regions, pins, initialSlug: props.initialSlug }
  })

  /** Camera padding that keeps the island clear of the sheet / unlock bar. */
  const padding = useCallback(() => {
    const app = canvasRef.current?.getBoundingClientRect()
    const pad = { top: 16, bottom: 16, left: 16, right: 16 }
    if (app === undefined) return pad
    if (isMobile()) {
      pad.top = 64
      const side = sideRef.current?.getBoundingClientRect()
      if (side) pad.bottom = Math.max(16, app.bottom - side.top + 12)
      pad.left = 12
      pad.right = 12
    } else {
      pad.top = 64
      const bar = barRef.current?.getBoundingClientRect()
      if (bar && bar.height > 0) pad.bottom = Math.max(16, app.bottom - bar.top + 12)
      pad.left = 72
      pad.right = 72
    }
    return pad
  }, [])

  /** Re-project the overlay for the current camera. */
  const measure = useCallback(() => {
    const map = mapRef.current
    const box = canvasRef.current
    if (map === null || box === null) return
    const W = box.clientWidth
    const H = box.clientHeight
    const zoom = map.getZoom()
    const mobile = isMobile()
    const mode = zoom < z0Ref.current + PINS_AT ? 'regions' : 'places'
    const { matched: list, near: here, regions: bubbles } = live.current

    const anchors = bubbles.map((region) => {
      const p = map.project([region.lon, region.lat])
      const label = region.label.en ?? region.key
      return { key: region.key, ...p, ...bubbleSize(label, region.locked, mobile) }
    })
    const offsets = mode === 'regions' ? declutter(anchors) : anchors.map(() => ({ ox: 0, oy: 0 }))

    const placed: ScreenState['pins'] = []
    if (mode === 'places') {
      for (const pin of list) {
        const p = map.project([pin.place.lon, pin.place.lat])
        if (p.x < -60 || p.y < -60 || p.x > W + 60 || p.y > H + 60) continue
        placed.push({ slug: pin.place.slug, x: p.x, y: p.y })
      }
    }
    setScreen({
      mode,
      labels: zoom >= z0Ref.current + LABELS_AT,
      bubbles: anchors.map((a, i) => ({
        key: a.key,
        x: a.x,
        y: a.y,
        ox: offsets[i]?.ox ?? 0,
        oy: offsets[i]?.oy ?? 0,
      })),
      pins: placed,
      me: here === null ? null : map.project([here.lon, here.lat]),
    })
  }, [])

  const schedule = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(measure)
  }, [measure])

  const settle = useCallback(() => {
    window.clearTimeout(settleRef.current)
    settleRef.current = window.setTimeout(() => {
      const map = mapRef.current
      if (map === null) return
      const b = map.getBounds()
      setBounds({ west: b.getWest(), east: b.getEast(), north: b.getNorth(), south: b.getSouth() })
    }, BOUNDS_DEBOUNCE_MS)
  }, [])

  /**
   * The "whole island" camera (the prototype's `fit`): zoom to the region
   * bubbles' extent, but never further out than the whole island fits — so on
   * a wide screen the bubbles fill the view instead of floating in the sea.
   */
  const homeCamera = useCallback(() => {
    const map = mapRef.current
    if (map === null) return null
    const pad = padding()
    const list = live.current.regions
    const mobile = isMobile()
    const island = map.cameraForBounds(ISLAND_BOUNDS, { padding: pad })?.zoom ?? 8.6
    if (list.length < 2) return { bounds: ISLAND_BOUNDS, padding: pad, zoom: island }
    const lons = list.map((r) => r.lon)
    const lats = list.map((r) => r.lat)
    const box: [[number, number], [number, number]] = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ]
    // Room for the bubbles themselves around their anchors.
    const bw = mobile ? 56 : 110
    const bh = mobile ? 22 : 34
    const roomy = {
      top: pad.top + bh,
      bottom: pad.bottom + bh,
      left: pad.left + bw,
      right: pad.right + bw,
    }
    const regionsZoom = map.cameraForBounds(box, { padding: roomy })?.zoom ?? island
    if (regionsZoom > island) return { bounds: box, padding: roomy, zoom: regionsZoom }
    return { bounds: ISLAND_BOUNDS, padding: pad, zoom: island }
  }, [padding])

  const fitIsland = useCallback(
    (animate: boolean) => {
      const map = mapRef.current
      const camera = homeCamera()
      if (map === null || camera === null) return
      z0Ref.current = camera.zoom
      map.fitBounds(camera.bounds, {
        padding: camera.padding,
        duration: animate && !reducedMotion() ? FLY_MS : 0,
      })
    },
    [homeCamera],
  )

  // ---- engine lifecycle ---------------------------------------------------
  const loadEngine = props.loadEngine ?? loadMapLibre
  useEffect(() => {
    let cancelled = false
    let map: MapLike | null = null
    const onResize = () => {
      const m = mapRef.current
      if (m === null) return
      const camera = homeCamera()
      if (camera !== null) z0Ref.current = camera.zoom
      schedule()
    }
    loadEngine()
      .then((engine) => {
        const container = canvasRef.current
        if (cancelled || container === null) return
        map = new engine.Map({
          container,
          style: {
            version: 8,
            sources: { sat: { type: 'image', url: SAT_URL, coordinates: imageCorners() } },
            layers: [
              { id: 'sea', type: 'background', paint: { 'background-color': '#0a2d40' } },
              { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 0 } },
            ],
          },
          bounds: ISLAND_BOUNDS,
          maxBounds: MAX_BOUNDS,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          maxPitch: 60,
          attributionControl: false,
          // Arrow keys and +/− are handled on the application wrapper.
          keyboard: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          renderWorldCopies: false,
          fadeDuration: 0,
        })
        mapRef.current = map
        // One tab stop: the application wrapper owns the keyboard, not the canvas.
        const canvas = map.getCanvas?.()
        if (canvas) canvas.tabIndex = -1
        const m = map
        m.on('move', schedule)
        m.on('moveend', settle)
        m.on('resize', onResize)
        m.on('error', () => undefined)
        m.once('load', () => {
          if (cancelled) return
          if (!unlocked && freeZone !== null) {
            const ring = circleRing(freeZone, freeZone.radiusKm)
            m.addSource('free-zone', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Polygon', coordinates: [ring] },
              },
            })
            m.addLayer({
              id: 'free-zone-glow',
              type: 'fill',
              source: 'free-zone',
              paint: { 'fill-color': '#71FF85', 'fill-opacity': 0.07 },
            })
            m.addLayer({
              id: 'free-zone-line',
              type: 'line',
              source: 'free-zone',
              paint: { 'line-color': '#71FF85', 'line-width': 2.5, 'line-dasharray': [3, 2.8] },
            })
            const img = new Image()
            img.decoding = 'async'
            img.onload = () => {
              if (cancelled || mapRef.current !== m) return
              m.addSource('locked', {
                type: 'canvas',
                canvas: lockedCanvas(img, freeZone),
                coordinates: imageCorners(),
                animate: false,
              })
              m.addLayer({
                id: 'locked',
                type: 'raster',
                source: 'locked',
                paint: { 'raster-fade-duration': 0 },
              })
              // Keep the dashed outline above the blur.
              if (m.getLayer('free-zone-line')) {
                m.removeLayer('free-zone-line')
                m.addLayer({
                  id: 'free-zone-line',
                  type: 'line',
                  source: 'free-zone',
                  paint: { 'line-color': '#71FF85', 'line-width': 2.5, 'line-dasharray': [3, 2.8] },
                })
              }
            }
            img.src = SAT_LOCKED_URL
          }
          fitIsland(false)
          setStatus('ready')
          const first = live.current.initialSlug
          const target =
            first === null ? undefined : live.current.pins.find((p) => p.place.slug === first)
          if (target) flyToPlace(target.place)
          schedule()
          settle()
        })
      })
      .catch(() => {
        if (!cancelled) setStatus('failed')
      })
    return () => {
      cancelled = true
      cancelAnimationFrame(frameRef.current)
      window.clearTimeout(settleRef.current)
      map?.remove()
      mapRef.current = null
    }
  }, [loadEngine, attempt, unlocked, freeZone, schedule, settle, fitIsland, flyToPlace, homeCamera])

  // Filters changed: re-project the pins (async — no setState in the effect body).
  useEffect(() => {
    const id = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(id)
  }, [matched, near, sheet, measure])

  // Near me granted: go there.
  useEffect(() => {
    const map = mapRef.current
    if (near === null || map === null) return
    const options = { center: [near.lon, near.lat] as [number, number], zoom: z0Ref.current + 1.8 }
    if (reducedMotion()) map.jumpTo(options)
    else map.flyTo({ ...options, duration: FLY_MS, easing: easeInOutCubic, essential: true })
  }, [near])

  // Fullscreen state follows the browser (Esc exits without our button).
  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement === appRef.current)
      window.setTimeout(() => mapRef.current?.resize(), 60)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ---- actions ------------------------------------------------------------
  const pickRegion = (key: string | null) => {
    filters.chooseRegion(key)
    setSelectedSlug(null)
    setLockedPick(null)
    const map = mapRef.current
    if (map === null) return
    if (key === null) {
      fitIsland(true)
      return
    }
    const region = regions.find((entry) => entry.key === key)
    if (region === undefined) return
    const zoom = Math.min(MAX_ZOOM, z0Ref.current + (region.radiusKm >= 10 ? 1.05 : 1.35))
    const options = { center: [region.lon, region.lat] as [number, number], zoom }
    if (reducedMotion()) map.jumpTo(options)
    else map.flyTo({ ...options, duration: FLY_MS, easing: easeInOutCubic, essential: true })
  }

  const set3d = (on: boolean) => {
    setIs3d(on)
    const map = mapRef.current
    if (map === null) return
    const rtl = locale === 'ar'
    map.easeTo({
      pitch: on ? 55 : 0,
      bearing: on ? (rtl ? 12 : -12) : 0,
      duration: reducedMotion() ? 0 : FLY_MS,
      easing: easeInOutCubic,
    })
  }

  const zoomBy = (dir: 1 | -1) => {
    const map = mapRef.current
    if (map === null) return
    if (dir > 0) map.zoomIn({ duration: 300 })
    else map.zoomOut({ duration: 300 })
  }

  const toggleFullscreen = () => {
    const el = appRef.current
    if (el === null) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.().catch(() => undefined)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const map = mapRef.current
    if (map === null || event.target !== event.currentTarget) return
    const step = 80
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      map.panBy(move, { duration: 200 })
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomBy(1)
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      zoomBy(-1)
    }
  }

  const onNear = () => {
    if (near !== null) filters.locate()
    else setGeoAsk(true)
  }

  // ---- derived ------------------------------------------------------------
  const selected =
    selectedSlug === null
      ? null
      : (pins.find((entry) => entry.place.slug === selectedSlug)?.place ?? null)
  const query = filters.query.trim()
  const inView =
    bounds === null ? matched : matched.filter((p) => inBounds(bounds, p.place.lat, p.place.lon))
  const useAll = query.length > 0 || bounds === null || inView.length === 0
  const listed = useAll ? matched : inView
  const lockedRegions = regions.filter((r) => r.lockedCount > 0)
  // Locked places have no coordinates here: "in view" is judged by their
  // REGION's centre (server-side region data), never by the place itself.
  const lockedInView =
    useAll && filters.region === null
      ? props.lockedCount
      : lockedRegions
          .filter((r) => useAll || (bounds !== null && inBounds(bounds, r.lat, r.lon)))
          .filter((r) => filters.region === null || r.key === filters.region)
          .reduce((sum, r) => sum + r.lockedCount, 0)
  const viewCount = inView.length + (bounds === null ? props.lockedCount : lockedInView)
  const freeName = freeZone === null ? '' : pick(freeZone.label, locale, freeZone.key)
  const hasFilters =
    filters.category !== null ||
    filters.filterTag !== null ||
    query.length > 0 ||
    filters.region !== null

  const regionCount = (key: string) =>
    matched.filter((pin) => inRegion(pin.place, key)).length +
    (regions.find((r) => r.key === key)?.lockedCount ?? 0)

  const regionName = (place: OpenMapPlace) =>
    pickOptional(place.regionLabel, locale) ?? pickOptional(place.parentRegionLabel, locale) ?? ''
  const categoryName = (place: OpenMapPlace) =>
    pickOptional(place.categoryLabel, locale) ?? pickOptional(place.category, locale) ?? ''

  const clearFilters = () => {
    filters.setCategory(null)
    filters.setFilterTag(null)
    filters.setQuery('')
    filters.chooseRegion(null)
  }

  const typeChips = (
    <>
      <Chip active={filters.category === null} onClick={() => filters.setCategory(null)}>
        {t('map_f_all')}
      </Chip>
      {props.taxonomy.categories.map((entry) => (
        <Chip
          key={entry.key}
          icon={categoryIcon(entry.key)}
          active={filters.category === entry.key}
          onClick={() => {
            filters.setCategory(filters.category === entry.key ? null : entry.key)
            if (isMobile()) setSheet('half')
          }}
        >
          <bdi>{pick(entry.label, locale, entry.key)}</bdi>
        </Chip>
      ))}
    </>
  )
  const tagChips = filters.facets.tags.map(([key, label]) => (
    <Chip
      key={key}
      active={filters.filterTag === key}
      onClick={() => filters.setFilterTag(filters.filterTag === key ? null : key)}
    >
      <bdi>{label}</bdi>
    </Chip>
  ))

  const unlockLabel = price === null ? t('mp3_unlock_full') : `${t('mp3_unlock_full')} · `

  // ---- render -------------------------------------------------------------
  return (
    <>
      <section className={howto ? 'mp-intro show-howto' : 'mp-intro'} aria-labelledby="mp-h">
        <div className="arc mp-arc" aria-hidden="true" />
        <div className="wrap mp-intro-in">
          <div className="stack mp-intro-text">
            <Breadcrumbs
              light
              trail={[
                { label: t('bt_nav_home'), href: '/' },
                { label: t('bt_nav_services'), href: '/services' },
                { label: t('bt_nav_map') },
              ]}
            />
            <h1 id="mp-h">{t('mp3_title')}</h1>
            <p className="mp-lede">{t('mp3_lede', { area: freeName || 'Ubud' })}</p>
            <button
              type="button"
              className="mp-howto-btn"
              aria-expanded={howto}
              aria-controls="mp-cando"
              onClick={() => setHowto((v) => !v)}
            >
              {t('mp3_howto')} <Icon name="chevron" size={16} />
            </button>
          </div>
          <div className="mp-cando" id="mp-cando">
            {(['1', '2', '3', '4'] as const).map((n) => (
              <div key={n}>
                <Icon name="check" size={18} />
                <span>
                  <b>{t(`mp3_can${n}_t`)}</b>
                  {t(`mp3_can${n}_b`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        ref={appRef}
        className={[
          'mp-app',
          fullscreen ? 'is-full' : null,
          viewerLabel ? 'bt-map-protected' : null,
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={t('bt_nav_map')}
      >
        {/* Side panel (desktop) / bottom sheet (mobile) */}
        <aside ref={sideRef} className={`mp-side is-${sheet}`} aria-label={t('mp3_results_label')}>
          <button
            type="button"
            className="mp-grab"
            aria-label={t('mp3_expand')}
            onClick={() => setSheet(sheet === 'peek' ? 'half' : sheet === 'half' ? 'full' : 'peek')}
          >
            <i />
          </button>
          <div className="mp-side-head">
            <SheetUnlock
              unlocked={unlocked}
              freeName={freeName}
              price={price}
              unlockLabel={unlockLabel}
            />
            <div className="mp-search-box">
              <label className="mp-search">
                <Icon name="search" size={18} />
                <span className="sr-only">{t('mp3_search_label')}</span>
                <input
                  type="search"
                  value={filters.query}
                  onChange={(event) => filters.setQuery(event.target.value)}
                  onFocus={() => {
                    if (isMobile() && sheet === 'peek') setSheet('half')
                  }}
                  placeholder={t('map_search')}
                  autoComplete="off"
                />
              </label>
              {filters.suggestions.length > 0 && (
                <ul className="mp-suggest" aria-label={t('map_suggestions')}>
                  {filters.suggestions.map((item, index) => (
                    <li key={`${item.type}-${index}`}>
                      <button type="button" onClick={() => filters.applySuggestion(item)}>
                        <Icon
                          name={
                            item.type === 'place' ? 'pin' : item.type === 'tag' ? 'tag' : 'search'
                          }
                          size={15}
                        />
                        <bdi>{item.label}</bdi>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="stack mp-desk-only mp-group">
              <span className="mp-flabel">{t('mp3_area')}</span>
              <div className="chips mp-chips" role="group" aria-label={t('mp3_area')}>
                <Chip active={filters.region === null} onClick={() => pickRegion(null)}>
                  {t('mp3_whole')}
                </Chip>
                {regions.map((region) => (
                  <Chip
                    key={region.key}
                    active={filters.region === region.key}
                    onClick={() => pickRegion(region.key)}
                  >
                    <bdi>{pick(region.label, locale, region.key)}</bdi>
                  </Chip>
                ))}
              </div>
            </div>
            <div className="stack mp-desk-only mp-group">
              <span className="mp-flabel">{t('mp3_type')}</span>
              <div className="chips mp-chips" role="group" aria-label={t('mp3_type')}>
                {typeChips}
              </div>
              {tagChips.length > 0 && <div className="chips mp-tags">{tagChips}</div>}
            </div>
          </div>

          <div className="mp-side-body" aria-live="polite">
            {selected !== null ? (
              <PlaceDetail
                key={selected.id}
                place={selected}
                categoryName={categoryName(selected)}
                regionName={regionName(selected)}
                onBack={() => setSelectedSlug(null)}
              />
            ) : lockedPick !== null ? (
              <LockedDetail
                regionName={pick(
                  regions.find((r) => r.key === lockedPick)?.label,
                  locale,
                  lockedPick,
                )}
                price={price}
                onBack={() => setLockedPick(null)}
              />
            ) : (
              <>
                <div className="mp-res-head">
                  <span>
                    <b dir="ltr">{listed.length}</b>{' '}
                    {useAll && bounds !== null ? t('mp3_results_all') : t('mp3_results_view')}
                  </span>
                  {near !== null && (
                    <Tag variant="info" icon="locate">
                      {t('mp3_nearest')}
                    </Tag>
                  )}
                </div>
                {(filters.geoStatus === 'denied' || filters.geoStatus === 'outside') && (
                  <p role="status" className="mp-note">
                    {t(filters.geoStatus === 'denied' ? 'map_geo_denied' : 'map_geo_outside')}
                  </p>
                )}
                {listed.length > 0 ? (
                  <ul className="mp-list">
                    {listed.map((pin) => (
                      <li key={pin.place.id}>
                        <button
                          type="button"
                          className="mp-res"
                          onClick={() => select(pin.place.slug, true)}
                        >
                          <span className="mp-res-img">
                            <Photo src={pin.place.heroImageUrl ?? FALLBACK_THUMB} alt="" />
                          </span>
                          <span className="mp-res-meta">
                            <span className="mp-res-name">
                              {pick(pin.place.name, locale, pin.place.slug)}
                            </span>
                            <span className="mp-res-sub">
                              <span>{categoryName(pin.place)}</span>
                              {regionName(pin.place) && <span>· {regionName(pin.place)}</span>}
                              {near !== null && (
                                <span dir="ltr">
                                  · {haversineKm(near, pin.place).toFixed(1)} km
                                </span>
                              )}
                            </span>
                            <Stars value={pin.place.rating} />
                          </span>
                          <Icon name="chevronr" size={18} className="flip mp-res-chev" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty mp-empty">
                    <span className="ill">
                      <Icon name="search" size={34} />
                    </span>
                    <b>{t('mp3_no_results')}</b>
                    <p className="muted">{t('mp3_no_results_b')}</p>
                    {hasFilters && (
                      <Button variant="ghost" size="sm" onClick={clearFilters}>
                        {t('mp3_clear')}
                      </Button>
                    )}
                  </div>
                )}
                {!unlocked && lockedInView > 0 && (
                  <div className="mp-lockcard">
                    <Icon name="lock" size={22} />
                    <b>{t('mp3_locked_n', { n: lockedInView })}</b>
                    <span>{t('mp3_locked_b')}</span>
                    <LinkButton href={PLANS_HREF} size="sm" className="mp-self-start">
                      <span>
                        {unlockLabel}
                        {price !== null && <span dir="ltr">{price}</span>}
                      </span>
                    </LinkButton>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Map column */}
        <div className="mp-col" {...protectionHandlers(viewerLabel !== null)}>
          <div
            className={[
              'mp-view',
              is3d ? 'is-3d' : null,
              `is-${screen.mode}`,
              screen.labels ? 'show-labels' : null,
            ]
              .filter(Boolean)
              .join(' ')}
            role="application"
            aria-roledescription={t('mp3_app_role')}
            aria-label={t('mp3_app_label')}
            tabIndex={0}
            onKeyDown={onKeyDown}
          >
            <div ref={canvasRef} className="mp-canvas" />
            <div className="mp-sky" aria-hidden="true" />
            <div className="mp-overlay">
              {screen.mode === 'regions' &&
                screen.bubbles.map((b) => {
                  const region = regions.find((r) => r.key === b.key)
                  if (region === undefined) return null
                  const off = Math.abs(b.ox) > 3 || Math.abs(b.oy) > 3
                  const name = pick(region.label, locale, region.key)
                  const n = regionCount(region.key)
                  const style = {
                    transform: `translate(${b.x}px, ${b.y}px)`,
                    '--ox': `${b.ox.toFixed(1)}px`,
                    '--oy': `${b.oy.toFixed(1)}px`,
                    '--len': `${Math.hypot(b.ox, b.oy).toFixed(1)}px`,
                    '--ang': `${Math.atan2(b.oy, b.ox).toFixed(3)}rad`,
                  } as CSSProperties
                  return (
                    <div key={b.key} className={off ? 'mp-rpin is-off' : 'mp-rpin'} style={style}>
                      <span className="mp-ld" aria-hidden="true" />
                      <span className="mp-an" aria-hidden="true" />
                      <button
                        type="button"
                        className="mp-rb"
                        tabIndex={-1}
                        aria-label={`${name} · ${t('map_results_n', { n })}${region.locked ? ` · ${t('mp3_locked_short')}` : ''}`}
                        onClick={() => pickRegion(region.key)}
                      >
                        {region.image !== null && <img src={region.image} alt="" />}
                        <b>{name}</b>
                        <span className="mp-n" dir="ltr">
                          {n}
                        </span>
                        {region.locked && (
                          <span className="mp-lk">
                            <Icon name="lock" size={13} />
                          </span>
                        )}
                      </button>
                    </div>
                  )
                })}
              {screen.mode === 'places' &&
                screen.bubbles.map((b) => {
                  const region = regions.find((r) => r.key === b.key)
                  if (region === undefined || !region.locked || region.lockedCount === 0)
                    return null
                  return (
                    <div
                      key={b.key}
                      className="mp-pin is-locked"
                      style={{ transform: `translate(${b.x}px, ${b.y}px)` }}
                    >
                      <button
                        type="button"
                        className="mp-dot"
                        tabIndex={-1}
                        aria-label={`${pick(region.label, locale, region.key)} · ${t('mp3_locked_short')}`}
                        onClick={() => {
                          setSelectedSlug(null)
                          setLockedPick(region.key)
                          if (isMobile()) setSheet('half')
                        }}
                      >
                        <Icon name="lock" size={15} />
                      </button>
                    </div>
                  )
                })}
              {screen.mode === 'places' &&
                screen.pins.map((p) => {
                  const pin = pins.find((entry) => entry.place.slug === p.slug)
                  if (pin === undefined) return null
                  const on = p.slug === selectedSlug
                  const name = pick(pin.place.name, locale, pin.place.slug)
                  return (
                    <div
                      key={p.slug}
                      className={on ? 'mp-pin is-on' : 'mp-pin'}
                      style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
                    >
                      {on && <span className="mp-pulse" aria-hidden="true" />}
                      <button
                        type="button"
                        className="mp-dot"
                        tabIndex={-1}
                        aria-label={name}
                        onClick={() => select(p.slug, false)}
                      >
                        <Icon name={categoryIcon(pin.place.categoryKey)} size={16} />
                      </button>
                      <button
                        type="button"
                        className="mp-lbl"
                        tabIndex={-1}
                        aria-hidden="true"
                        onClick={() => select(p.slug, false)}
                      >
                        <span className="mp-lbl-img">
                          <Photo src={pin.place.heroImageUrl ?? FALLBACK_THUMB} alt="" />
                        </span>
                        <span>
                          <b>{name}</b>
                          <small>
                            {categoryName(pin.place)}
                            {regionName(pin.place) ? ` · ${regionName(pin.place)}` : ''}
                          </small>
                        </span>
                      </button>
                    </div>
                  )
                })}
              {screen.me !== null && (
                <div
                  className="mp-me"
                  style={{ transform: `translate(${screen.me.x}px, ${screen.me.y}px)` }}
                >
                  <i />
                </div>
              )}
            </div>
            {status === 'loading' && <div className="mp-state">{t('bt_loading')}</div>}
            {status === 'failed' && (
              <div className="mp-state">
                <p>{t('mp3_map_failed')}</p>
                <Button
                  variant="light"
                  size="sm"
                  onClick={() => {
                    setStatus('loading')
                    setAttempt((n) => n + 1)
                  }}
                >
                  {t('bt_retry')}
                </Button>
              </div>
            )}
          </div>

          <div className="mp-mfilters">
            <div className="chips scroll mp-chips">
              {typeChips}
              {tagChips}
            </div>
          </div>

          <div className="mp-ctrl mp-ctrl-top">
            <div className="mp-seg" role="group" aria-label={t('mp3_view_mode')}>
              <button type="button" aria-pressed={!is3d} onClick={() => set3d(false)}>
                2D
              </button>
              <button type="button" aria-pressed={is3d} onClick={() => set3d(true)}>
                <Icon name="cube" size={15} />
                3D
              </button>
            </div>
            <span className="mp-pill">
              <Icon name="pin" size={15} /> <b dir="ltr">{viewCount}</b> {t('mp3_places_view')}
            </span>
          </div>
          {is3d && (
            <div className="mp-legend3d" role="note">
              <b>{t('mp3_3d_t')}</b> {t('mp3_3d_b')}
            </div>
          )}

          <div className="mp-ctrl mp-ctrl-zoom">
            <button
              type="button"
              className="mp-gbtn mp-zoom"
              aria-label={t('map_zoom_in')}
              title={t('map_zoom_in')}
              onClick={() => zoomBy(1)}
            >
              <Icon name="plus" size={20} />
            </button>
            <button
              type="button"
              className="mp-gbtn mp-zoom"
              aria-label={t('map_zoom_out')}
              title={t('map_zoom_out')}
              onClick={() => zoomBy(-1)}
            >
              <Icon name="minus" size={20} />
            </button>
            <button
              type="button"
              className="mp-gbtn"
              aria-label={t('map_near_me')}
              title={t('map_near_me')}
              aria-pressed={near !== null}
              onClick={onNear}
            >
              <Icon name="locate" size={20} />
            </button>
            <button
              type="button"
              className="mp-gbtn"
              aria-label={fullscreen ? t('mp3_exit_fullscreen') : t('mp3_fullscreen')}
              title={fullscreen ? t('mp3_exit_fullscreen') : t('mp3_fullscreen')}
              aria-pressed={fullscreen}
              onClick={toggleFullscreen}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                aria-hidden="true"
              >
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            </button>
            <Link
              href={DRIVER_HREF}
              className="mp-gbtn"
              aria-label={t('mp3_driver')}
              title={t('mp3_driver')}
            >
              <Icon name="car" size={20} />
            </Link>
          </div>

          <div className="mp-unlockbar" ref={barRef}>
            {unlocked ? (
              <span className="mp-ul-t">
                <span className="mp-ic">
                  <Icon name="unlock" size={20} />
                </span>
                <span>
                  <b>{t('mp_unlocked')}</b>
                  <span>{t('mp3_unlocked_b')}</span>
                </span>
              </span>
            ) : (
              <>
                <span className="mp-ul-t">
                  <span className="mp-ic">
                    <Icon name="lock" size={20} />
                  </span>
                  <span>
                    <b>{t('mp3_free_title', { area: freeName })}</b>
                    <span>{t('mp3_free_text')}</span>
                  </span>
                </span>
                <LinkButton href={PLANS_HREF} size="sm">
                  <span>
                    {unlockLabel}
                    {price !== null && <span dir="ltr">{price}</span>}
                  </span>
                </LinkButton>
              </>
            )}
          </div>

          {viewerLabel !== null && <MapWatermark label={viewerLabel} />}
        </div>
        {viewerLabel !== null && <p className="bt-map-printnote">{t('map_print_blocked')}</p>}
      </section>

      {/* Near me: the explanation comes BEFORE the browser prompt. */}
      <div
        className={geoAsk ? 'modal-scrim open' : 'modal-scrim'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mp-geo-h"
        aria-hidden={!geoAsk}
        onClick={(event) => {
          if (event.target === event.currentTarget) setGeoAsk(false)
        }}
      >
        {geoAsk && (
          <div className="modal stack mp-geo">
            <span className="mp-geo-ill">
              <Icon name="locate" size={30} />
            </span>
            <h2 className="h3" id="mp-geo-h">
              {t('mp3_geo_t')}
            </h2>
            <p className="muted">{t('mp3_geo_b')}</p>
            <div className="row mp-geo-actions">
              <Button
                autoFocus
                onClick={() => {
                  setGeoAsk(false)
                  filters.locate()
                }}
              >
                {t('mp3_geo_ok')}
              </Button>
              <Button variant="ghost" onClick={() => setGeoAsk(false)}>
                {t('mp3_geo_no')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function SheetUnlock({
  unlocked,
  freeName,
  price,
  unlockLabel,
}: {
  unlocked: boolean
  freeName: string
  price: string | null
  unlockLabel: string
}) {
  const t = useTranslations()
  if (unlocked) {
    return (
      <div className="mp-m-unlock">
        <span>
          <Icon name="unlock" size={16} /> <b>{t('mp_unlocked')}</b>
        </span>
      </div>
    )
  }
  return (
    <div className="mp-m-unlock">
      <span>
        <Icon name="lock" size={16} /> <b>{t('mp3_free_short', { area: freeName })}</b>
      </span>
      <LinkButton href={PLANS_HREF} size="sm">
        <span>
          {price === null ? unlockLabel : `${t('mp3_unlock_all')} · `}
          {price !== null && <span dir="ltr">{price}</span>}
        </span>
      </LinkButton>
    </div>
  )
}

function PlaceDetail({
  place,
  categoryName,
  regionName,
  onBack,
}: {
  place: OpenMapPlace
  categoryName: string
  regionName: string
  onBack: () => void
}) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const name = pick(place.name, locale, place.slug)
  const description = pickOptional(place.description, locale)
  const gallery = [place.heroImageUrl, ...place.gallery].filter((src): src is string => !!src)
  const main = gallery[0] ?? FALLBACK_THUMB
  const side = gallery.slice(1, 3)
  return (
    <article className="mp-detail">
      <Button variant="ghost" size="sm" icon="back" className="mp-self-start" onClick={onBack}>
        {t('mp3_back')}
      </Button>
      <div className={side.length > 0 ? 'mp-gal' : 'mp-gal is-single'}>
        <Photo src={main} alt={name} />
        {side.length > 0 && (
          <div>
            {side.map((src) => (
              <Photo key={src} src={src} alt="" />
            ))}
          </div>
        )}
      </div>
      <div className="stack mp-detail-text">
        <div className="row mp-tags-row">
          {categoryName && (
            <Tag variant="palm" icon={categoryIcon(place.categoryKey)}>
              {categoryName}
            </Tag>
          )}
          {regionName && (
            <Tag variant="forest" icon="pin">
              {regionName}
            </Tag>
          )}
        </div>
        <h2 className="h3">{name}</h2>
        <Stars value={place.rating} />
        {description && <p className="muted">{description}</p>}
      </div>
      <PlaceActions
        placeId={place.id}
        canFavorite={place.canFavorite}
        canAddToTrip={place.canAddToTrip}
      >
        <LinkButton href={`/places/${place.slug}`} variant="forest" size="sm">
          {t('mp3_details')}
        </LinkButton>
        <LinkButton
          href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`}
          target="_blank"
          variant="ghost"
          size="sm"
          icon="route"
        >
          {t('mp3_directions')}
        </LinkButton>
      </PlaceActions>
      {place.activitySlug !== null && (
        <Link href={`/activities/${place.activitySlug}`} className="panel mp-bookable">
          <Icon name="bolt" size={20} />
          <span>
            <b>{t('mp3_bookable')}</b>
          </span>
          <Icon name="chevronr" size={18} className="flip" />
        </Link>
      )}
    </article>
  )
}

function LockedDetail({
  regionName,
  price,
  onBack,
}: {
  regionName: string
  price: string | null
  onBack: () => void
}) {
  const t = useTranslations()
  return (
    <div className="mp-detail">
      <Button variant="ghost" size="sm" icon="back" className="mp-self-start" onClick={onBack}>
        {t('mp3_back')}
      </Button>
      <div className="mp-lockcard">
        <Icon name="lock" size={24} />
        <b>{t('mp3_pl_locked_t')}</b>
        <span>{t('mp3_locked_region', { region: regionName })}</span>
        <LinkButton href={PLANS_HREF} className="mp-self-start">
          <span>
            {t('mp3_unlock_full')}
            {price !== null && (
              <>
                {' · '}
                <span dir="ltr">{price}</span>
              </>
            )}
          </span>
        </LinkButton>
      </div>
    </div>
  )
}
