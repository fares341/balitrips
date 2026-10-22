'use client'

/**
 * The interactive map (v3): design-reference/prototype/map.html, screens
 * 03-map, 03b-map-region-ubud, 03c-map-place-card, 03d-map-3d.
 *
 * Engine (`./hybrid-view.ts`): the real map (MapLibre GL 5 from a pinned
 * CDN build: terrain, satellite, OpenStreetMap, sky/fog), opening on the
 * whole island, straight down (2D only — client, Oct 2026). The client's illustrated artwork is its poster
 * while it loads and the fallback if it cannot run. Everything interactive on
 * top — region bubbles, place pins, landmarks, "you are here" — is an HTML
 * overlay positioned with `view.project()` on every camera move, so the same
 * markers (in the site font, shaped correctly in Arabic) work on both.
 *
 * Data: only what the server decided this viewer may have (`page.tsx` →
 * `buildMapPayload`). A locked place is `{ id, locked, requiredEntitlement }`
 * with no coordinates and cannot be drawn. Locked AREAS are drawn from
 * region-level data (`regions` prop: region centre + a count), computed on the
 * server.
 *
 * Without the real map (CDN blocked, no WebGL, tiles failing) the artwork
 * stays (pannable, zoomable) and every list / filter keeps working; a small
 * note says so, with "Try again".
 *
 * Accessibility: the view is `role="application"` with arrow-key panning
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
  type PointerEvent,
} from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Breadcrumbs, Button, Chip, LinkButton, Stars, Tag } from '@/components/bt'
import { Icon, Photo } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick, pickOptional } from '@/lib/content/localize'
import { haversineKm } from '@/lib/geo'
import type { MapTaxonomy } from '@/lib/search/query'
import { FEATURES } from '@/lib/features'
import { reportMapError, track } from '@/lib/analytics/client'

import { ART_FULL_URL, ART_SMALL_URL, ART_SMALL_W, ART_W } from './art-warp'
import { categoryIcon, declutter, inBounds, type ViewBounds } from './geo'
import { HybridView, type Pad, type RealMapState } from './hybrid-view'
import { LANDMARK_COLORS, RANK_MINZOOM, type MapLandmark } from './landmark-style'
import { useMapFilters } from './map-filters'
import { MapWatermark, protectionHandlers } from './map-protect'
import { attributionsFor, MAP_SETTING_DEFAULTS, type MapSettings } from './map-style'
import { loadMapLibre, type EngineLoader } from './maplibre-loader'
import { PlaceActions } from './place-actions'
import { PlaceThumb } from './place-thumb'
import { buildPins, type MapClientPlace, type MapPin, type OpenMapPlace } from './projection'
import type { RegionBubble } from './regions'

const PLANS_HREF = '/plans'
const DRIVER_HREF = '/driver'
/** Results follow the visible area once the camera settles. */
const BOUNDS_DEBOUNCE_MS = 180
/** Zoom past the fitted island (in zoom levels) where pins replace bubbles… */
const PINS_AT = 0.63
/** …and where every pin shows its glass label. */
const LABELS_AT = 1.23

/** Phones: the map, or a full-screen list of the results. */
type MobileView = 'map' | 'list'

const NO_LANDMARKS: MapLandmark[] = []

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
  /** The map plan's real price, formatted; null when no plan is on sale. */
  price: string | null
  /**
   * The client's landmarks for the real map, in the page language — already
   * filtered on the server so none names a place this viewer cannot see.
   */
  landmarks?: MapLandmark[]
  /** Studio → Map settings (imagery, terrain exaggeration, tilt). */
  settings?: MapSettings
  /** Test seam: replaces the CDN loader. */
  loadEngine?: EngineLoader
}

interface ScreenState {
  mode: 'regions' | 'places'
  labels: boolean
  bubbles: { key: string; x: number; y: number; ox: number; oy: number }[]
  pins: { slug: string; x: number; y: number }[]
  landmarks: { id: string; x: number; y: number }[]
  me: { x: number; y: number } | null
  /** View box size, for keeping the landmark card on screen. */
  w: number
  h: number
}

const EMPTY_SCREEN: ScreenState = {
  mode: 'regions',
  labels: false,
  bubbles: [],
  pins: [],
  landmarks: [],
  me: null,
  w: 0,
  h: 0,
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

/**
 * Where the landmark card sits relative to its marker: above it (below when the
 * marker is near the top), shifted sideways to stay inside the view. Screen
 * geometry, hence physical `left`.
 */
function landmarkCardBox(at: { x: number; y: number }, viewW: number): CSSProperties {
  const width = Math.min(260, Math.max(200, viewW - 24))
  const left = Math.max(12, Math.min(viewW - width - 12, at.x - width / 2)) - at.x
  return at.y < 230
    ? { width, left, insetInlineStart: 'auto', top: 16, bottom: 'auto' }
    : { width, left, insetInlineStart: 'auto' }
}

export function MapApp(props: MapAppProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const { unlocked, regions, price, viewerLabel } = props
  const settings = props.settings ?? MAP_SETTING_DEFAULTS
  const landmarks = props.landmarks ?? NO_LANDMARKS

  const pins = useMemo<MapPin[]>(
    () => buildPins(props.places, props.taxonomy.categories),
    [props.places, props.taxonomy.categories],
  )

  const [selectedSlug, setSelectedSlug] = useState<string | null>(props.initialSlug)
  const [lockedPick, setLockedPick] = useState<string | null>(null)
  const [landmarkPick, setLandmarkPick] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<MobileView>('map')
  const [mapShown, setMapShown] = useState(false)
  const [realState, setRealState] = useState<RealMapState>('idle')
  const [tilesFailed, setTilesFailed] = useState(false)
  const [attribOpen, setAttribOpen] = useState(false)
  const [noteHidden, setNoteHidden] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [bounds, setBounds] = useState<ViewBounds | null>(null)
  const [screen, setScreen] = useState<ScreenState>(EMPTY_SCREEN)
  const [geoAsk, setGeoAsk] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [howto, setHowto] = useState(false)

  const appRef = useRef<HTMLElement>(null)
  const viewBoxRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const sideRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const mbarRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HybridView | null>(null)
  const frameRef = useRef(0)
  const settleRef = useRef(0)

  const flyToPlace = useCallback((place: OpenMapPlace) => {
    viewRef.current?.flyTo(place.lon, place.lat, 1.6, 14)
  }, [])

  const select = useCallback(
    (slug: string, fly: boolean) => {
      setSelectedSlug(slug)
      setLockedPick(null)
      // Phase 5 analytics: which place, never where the visitor is.
      track('map_place_click', {
        itemKind: 'place',
        itemRef: slug,
        props: { source: fly ? 'list' : 'pin' },
      })
      track('map_place_view', { itemKind: 'place', itemRef: slug })
      if (isMobile()) setMobileView('map')
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

  // Everything the camera handlers read lives here, so the view's listeners
  // (registered once) always see the current render's values.
  const live = useRef({ matched, near, regions, pins, landmarks, initialSlug: props.initialSlug })
  useEffect(() => {
    live.current = { matched, near, regions, pins, landmarks, initialSlug: props.initialSlug }
  })

  /** Screen area kept clear of the chips / bottom bar / unlock bar / controls. */
  const padding = useCallback((): Pad => {
    const app = viewBoxRef.current?.getBoundingClientRect()
    const pad = { top: 16, bottom: 16, left: 16, right: 16 }
    if (app === undefined) return pad
    if (isMobile()) {
      pad.top = 56
      // the Map / List bar along the bottom (the place card comes and goes)
      const mbar = mbarRef.current?.getBoundingClientRect()
      if (mbar && mbar.height > 0) pad.bottom = Math.max(16, app.bottom - mbar.top + 8)
      // room for the region bubbles' labels, which extend sideways
      pad.left = 56
      pad.right = 56
    } else {
      pad.top = 64
      const bar = barRef.current?.getBoundingClientRect()
      if (bar && bar.height > 0) pad.bottom = Math.max(16, app.bottom - bar.top + 12)
      pad.left = 24
      pad.right = 72
    }
    return pad
  }, [])

  /** Re-project the overlay for the current camera. */
  const measure = useCallback(() => {
    const view = viewRef.current
    const box = viewBoxRef.current
    if (view === null || box === null) return
    const W = box.clientWidth
    const H = box.clientHeight
    const onMap = view.mode === 'map'
    const zoom = view.zoom()
    const levels = view.levels()
    const mobile = isMobile()
    const mode = levels >= PINS_AT ? 'places' : 'regions'
    const { matched: list, near: here, regions: bubbles } = live.current
    const visible = (p: { x: number; y: number }, m: number) =>
      Number.isFinite(p.x) && p.x > -m && p.y > -m && p.x < W + m && p.y < H + m

    const anchors = bubbles.map((region) => {
      const p = view.project(region.lon, region.lat)
      const label = region.label.en ?? region.key
      return { key: region.key, ...p, ...bubbleSize(label, region.locked, mobile) }
    })
    const offsets = mode === 'regions' ? declutter(anchors) : anchors.map(() => ({ ox: 0, oy: 0 }))

    const placed: ScreenState['pins'] = []
    if (mode === 'places') {
      for (const pin of list) {
        const p = view.project(pin.place.lon, pin.place.lat)
        if (visible(p, 60)) placed.push({ slug: pin.place.slug, x: p.x, y: p.y })
      }
    }
    // The client's landmarks: on the real map only (the artwork has them painted).
    const marks: ScreenState['landmarks'] = []
    if (onMap) {
      for (const l of live.current.landmarks) {
        if (zoom < RANK_MINZOOM[l.rank]) continue
        const p = view.project(l.lng, l.lat)
        // A site pin or region bubble wins over a landmark label in the same spot.
        const crowded =
          placed.some((pin) => Math.hypot(pin.x - p.x, pin.y - p.y) < 44) ||
          (mode === 'regions' &&
            anchors.some((b, i) => {
              const dx = b.x + (offsets[i]?.ox ?? 0) - p.x
              const dy = b.y + (offsets[i]?.oy ?? 0) - p.y
              return Math.abs(dx) < b.w / 2 + 50 && Math.abs(dy) < b.h / 2 + 12
            }))
        if (visible(p, 20) && !crowded) marks.push({ id: l.id, x: p.x, y: p.y })
      }
    }
    const me = here === null ? null : view.project(here.lon, here.lat)
    setScreen({
      mode,
      labels: levels >= LABELS_AT,
      bubbles: anchors.map((a, i) => ({
        key: a.key,
        x: a.x,
        y: a.y,
        ox: offsets[i]?.ox ?? 0,
        oy: offsets[i]?.oy ?? 0,
      })),
      pins: placed,
      landmarks: marks,
      me: me !== null && visible(me, 20) ? me : null,
      w: W,
      h: H,
    })
  }, [])

  const schedule = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(measure)
  }, [measure])

  const settle = useCallback(() => {
    window.clearTimeout(settleRef.current)
    settleRef.current = window.setTimeout(() => {
      const view = viewRef.current
      if (view !== null) setBounds(view.bounds())
    }, BOUNDS_DEBOUNCE_MS)
  }, [])

  // ---- engine lifecycle ---------------------------------------------------
  const loadEngine = props.loadEngine ?? loadMapLibre
  useEffect(() => {
    const root = viewBoxRef.current
    const stage = stageRef.current
    const img = imgRef.current
    const mapContainer = canvasRef.current
    if (!root || !stage || !img || !mapContainer) return
    let cancelled = false
    // Deep link (`/map?place=slug`): the real map opens on that place (and the
    // poster artwork flies there meanwhile).
    const first = live.current.initialSlug
    const target =
      first === null ? undefined : live.current.pins.find((p) => p.place.slug === first)
    const view: HybridView = new HybridView({
      root,
      stage,
      img,
      fullSrc: ART_FULL_URL,
      smallWidth: ART_SMALL_W,
      mapContainer,
      settings,
      // No free AREA any more: access follows the category (client, Oct 2026).
      freeZone: null,
      locale,
      initial: target ? { lng: target.place.lon, lat: target.place.lat, zoom: 14 } : null,
      padding,
      reducedMotion,
      onEvent: (event) => {
        if (event === 'move') schedule()
        else if (event === 'moveend') settle()
        else if (event === 'mode') {
          setMapShown(view.mapVisible)
          if (view.mode !== 'map') setLandmarkPick(null)
          schedule()
          settle()
        } else {
          setRealState(view.realMapState)
          setTilesFailed(view.tilesFailed)
        }
      },
    })
    viewRef.current = view
    const kick = requestAnimationFrame(() => {
      if (target) flyToPlace(target.place)
      schedule()
      settle()
    })
    // The real map is the map: load it straight away (the artwork is its
    // poster until the first tiles are in, and the fallback if it fails).
    loadEngine()
      .then((engine) => {
        if (!cancelled) view.attachEngine(engine)
      })
      .catch(() => {
        if (!cancelled) view.engineFailed()
        reportMapError('engine_load')
      })
    return () => {
      cancelled = true
      cancelAnimationFrame(kick)
      cancelAnimationFrame(frameRef.current)
      window.clearTimeout(settleRef.current)
      view.destroy()
      viewRef.current = null
    }
  }, [loadEngine, attempt, settings, padding, schedule, settle, flyToPlace, locale])

  // Filters changed: re-project the pins (async — no setState in the effect body).
  useEffect(() => {
    const id = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(id)
  }, [matched, near, mobileView, measure])

  // Near me granted: go there.
  useEffect(() => {
    if (near === null) return
    viewRef.current?.flyTo(near.lon, near.lat, 1.8, 14)
  }, [near])

  // Fullscreen state follows the browser (Esc exits without our button).
  useEffect(() => {
    const onChange = () => {
      setFullscreen(document.fullscreenElement === appRef.current)
      window.setTimeout(() => viewRef.current?.layout(), 60)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ---- actions ------------------------------------------------------------
  const pickRegion = (key: string | null) => {
    filters.chooseRegion(key)
    setSelectedSlug(null)
    setLockedPick(null)
    const view = viewRef.current
    if (view === null) return
    if (key === null) {
      view.home()
      return
    }
    const region = regions.find((entry) => entry.key === key)
    if (region === undefined) return
    const wide = region.radiusKm >= 10
    view.flyTo(region.lon, region.lat, wide ? 1.05 : 1.35, wide ? 11.5 : 12.5)
  }

  const zoomBy = (dir: 1 | -1) => viewRef.current?.zoomBy(dir)

  const toggleFullscreen = () => {
    const el = appRef.current
    if (el === null) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.().catch(() => undefined)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const view = viewRef.current
    if (view === null || event.target !== event.currentTarget) return
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
      view.panBy(move[0], move[1])
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

  const realBroken = realState === 'failed' || tilesFailed
  const landmark =
    landmarkPick === null ? undefined : landmarks.find((entry) => entry.id === landmarkPick)
  const landmarkAt =
    landmark === undefined ? undefined : screen.landmarks.find((m) => m.id === landmark.id)

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
            <p className="mp-lede">{t('mp3_lede')}</p>
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
        <aside
          ref={sideRef}
          className={mobileView === 'list' ? 'mp-side is-list' : 'mp-side'}
          aria-label={t('mp3_results_label')}
        >
          <div className="mp-side-head">
            <SheetUnlock unlocked={unlocked} price={price} unlockLabel={unlockLabel} />
            <div className="mp-search-box">
              <label className="mp-search">
                <Icon name="search" size={18} />
                <span className="sr-only">{t('mp3_search_label')}</span>
                <input
                  type="search"
                  value={filters.query}
                  onChange={(event) => filters.setQuery(event.target.value)}
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
                    {useAll && bounds !== null
                      ? t('mp3_results_all_n', { n: listed.length })
                      : t('mp3_results_view_n', { n: listed.length })}
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
                          <PlaceThumb
                            className="mp-res-img"
                            src={pin.place.heroImageUrl}
                            icon={categoryIcon(pin.place.categoryKey)}
                          />
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
            ref={viewBoxRef}
            className={[
              'mp-view',
              mapShown ? 'is-map' : null,
              !mapShown && !realBroken ? 'is-loading' : null,
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
            onClick={(event) => {
              // Phones: a tap on the map itself (not a marker) puts the card away.
              const target = event.target as HTMLElement
              if (isMobile() && (target.tagName === 'CANVAS' || target.closest('.mp-art'))) {
                setSelectedSlug(null)
                setLockedPick(null)
              }
            }}
          >
            <div ref={canvasRef} className="mp-canvas" aria-hidden={!mapShown} />
            {!mapShown && !realBroken && (
              <div className="mp-loading" role="status">
                <span className="mp-spin" aria-hidden="true" />
                <span>{t('mp4_loading')}</span>
              </div>
            )}
            {/* the illustrated map is only the fallback when the 3D map can't load */}
            <div className="mp-art" hidden={!realBroken}>
              <div ref={stageRef} className="mp-art-stage">
                <img
                  ref={imgRef}
                  src={realBroken ? ART_SMALL_URL : undefined}
                  srcSet={
                    realBroken
                      ? `${ART_SMALL_URL} ${ART_SMALL_W}w, ${ART_FULL_URL} ${ART_W}w`
                      : undefined
                  }
                  sizes="(max-width: 1023px) 100vw, 70vw"
                  alt=""
                  draggable={false}
                  decoding="async"
                />
              </div>
            </div>
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
                        <PlaceThumb
                          className="mp-lbl-img"
                          src={pin.place.heroImageUrl}
                          icon={categoryIcon(pin.place.categoryKey)}
                          size={18}
                        />
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
              {screen.landmarks.map((m) => {
                const l = landmarks.find((entry) => entry.id === m.id)
                if (l === undefined) return null
                const name = l.name
                return (
                  <div
                    key={m.id}
                    className={`mp-lm is-r${l.rank}`}
                    style={
                      {
                        transform: `translate(${m.x}px, ${m.y}px)`,
                        '--lm': LANDMARK_COLORS[l.cat],
                      } as CSSProperties
                    }
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-pressed={landmarkPick === l.id}
                      onClick={() => setLandmarkPick(landmarkPick === l.id ? null : l.id)}
                    >
                      <i aria-hidden="true" />
                      <span>{name}</span>
                    </button>
                  </div>
                )
              })}
              {landmark !== undefined && landmarkAt !== undefined && (
                <div
                  className="mp-lm-card"
                  role="dialog"
                  aria-labelledby="mp-lm-h"
                  style={{ transform: `translate(${landmarkAt.x}px, ${landmarkAt.y}px)` }}
                >
                  <div style={landmarkCardBox(landmarkAt, screen.w)}>
                    <button
                      type="button"
                      className="mp-lm-x"
                      aria-label={t('c_close')}
                      onClick={() => setLandmarkPick(null)}
                    >
                      <Icon name="cross" size={16} />
                    </button>
                    <b id="mp-lm-h">{landmark.name}</b>
                    {landmark.latin !== landmark.name && (
                      <span className="mp-lm-latin" lang="en" dir="ltr">
                        {landmark.latin}
                      </span>
                    )}
                    {landmark.ele !== null && (
                      <span className="mp-lm-ele">
                        {t('mp4_elevation')}{' '}
                        <span dir="ltr">{landmark.ele.toLocaleString('en')} m</span>
                      </span>
                    )}
                    <p>{landmark.desc}</p>
                  </div>
                </div>
              )}
              {screen.me !== null && (
                <div
                  className="mp-me"
                  style={{ transform: `translate(${screen.me.x}px, ${screen.me.y}px)` }}
                >
                  <i />
                </div>
              )}
            </div>
          </div>

          <div className="mp-notes">
            {mapShown && (
              <div className={attribOpen ? 'mp-attrib is-open' : 'mp-attrib'} lang="en" dir="ltr">
                <button
                  type="button"
                  className="mp-attrib-btn"
                  aria-expanded={attribOpen}
                  aria-label="Map data sources"
                  onClick={() => setAttribOpen((v) => !v)}
                >
                  i
                </button>
                <p>{attributionsFor(settings).join(' · ')}</p>
              </div>
            )}
            {realBroken && !noteHidden && (
              <div className="mp-chipnote" role="status">
                <Icon name="info" size={16} />
                <span>{t('mp4_real_failed')}</span>
                <button
                  type="button"
                  onClick={() => {
                    setRealState('idle')
                    setTilesFailed(false)
                    setAttempt((n) => n + 1)
                  }}
                >
                  {t('bt_retry')}
                </button>
                <button
                  type="button"
                  className="mp-chipnote-x"
                  aria-label={t('c_close')}
                  onClick={() => setNoteHidden(true)}
                >
                  <Icon name="cross" size={14} />
                </button>
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
            <span className="mp-pill">
              <Icon name="pin" size={15} /> <b dir="ltr">{viewCount}</b>{' '}
              {t('mp3_places_view_n', { n: viewCount })}
            </span>
          </div>

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
            {FEATURES.driver && (
              <Link
                href={DRIVER_HREF}
                className="mp-gbtn"
                aria-label={t('mp3_driver')}
                title={t('mp3_driver')}
              >
                <Icon name="car" size={20} />
              </Link>
            )}
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
                    <b>{t('mp3_free_title')}</b>
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

          {/* Phones: the place card and the Map / List switch, one-hand reach. */}
          <div className="mp-mbar" ref={mbarRef}>
            {mobileView === 'map' && selected !== null && (
              <MobileCard
                key={selected.id}
                place={selected}
                categoryName={categoryName(selected)}
                regionName={regionName(selected)}
                km={near === null ? null : haversineKm(near, selected)}
                onClose={() => setSelectedSlug(null)}
              />
            )}
            {mobileView === 'map' && selected === null && lockedPick !== null && (
              <MobileLockedCard
                regionName={pick(
                  regions.find((r) => r.key === lockedPick)?.label,
                  locale,
                  lockedPick,
                )}
                price={price}
                onClose={() => setLockedPick(null)}
              />
            )}
            <div className="mp-mrow">
              <div className="mp-mtoggle" role="group" aria-label={t('mp5_view')}>
                <button
                  type="button"
                  aria-pressed={mobileView === 'map'}
                  onClick={() => setMobileView('map')}
                >
                  <Icon name="map" size={18} />
                  {t('mp5_map')}
                </button>
                <button
                  type="button"
                  aria-pressed={mobileView === 'list'}
                  onClick={() => {
                    setSelectedSlug(null)
                    setLockedPick(null)
                    setMobileView('list')
                  }}
                >
                  <Icon name="list" size={18} />
                  {t('mp5_list')}
                  <span className="mp-mcount" dir="ltr">
                    {listed.length}
                  </span>
                </button>
              </div>
              {!unlocked && (
                <LinkButton href={PLANS_HREF} size="sm" icon="lock" className="mp-munlock">
                  {t('mp5_unlock')}
                </LinkButton>
              )}
            </div>
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
  price,
  unlockLabel,
}: {
  unlocked: boolean
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
        <Icon name="lock" size={16} /> <b>{t('mp3_free_short')}</b>
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
  const main = gallery[0]
  const side = gallery.slice(1, 3)
  return (
    <article className="mp-detail">
      <Button variant="ghost" size="sm" icon="back" className="mp-self-start" onClick={onBack}>
        {t('mp3_back')}
      </Button>
      <div className={side.length > 0 ? 'mp-gal' : 'mp-gal is-single'}>
        <PlaceThumb src={main} alt={name} icon={categoryIcon(place.categoryKey)} size={40} />
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

/** Swipe the card down to put it away (a plain tap still works on its buttons). */
function useSwipeDown(onClose: () => void) {
  const [dy, setDy] = useState(0)
  const start = useRef<number | null>(null)
  return {
    style:
      dy > 0
        ? ({ transform: `translateY(${dy}px)`, transition: 'none' } as CSSProperties)
        : undefined,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if ((event.target as HTMLElement).closest('a, button')) return
        start.current = event.clientY
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (start.current === null) return
        setDy(Math.max(0, event.clientY - start.current))
      },
      onPointerUp: () => {
        if (start.current === null) return
        start.current = null
        if (dy > 70) onClose()
        setDy(0)
      },
      onPointerCancel: () => {
        start.current = null
        setDy(0)
      },
    },
  }
}

function MobileCard({
  place,
  categoryName,
  regionName,
  km,
  onClose,
}: {
  place: OpenMapPlace
  categoryName: string
  regionName: string
  km: number | null
  onClose: () => void
}) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const name = pick(place.name, locale, place.slug)
  const swipe = useSwipeDown(onClose)
  return (
    <article className="mp-mcard" aria-label={name} style={swipe.style} {...swipe.handlers}>
      <span className="mp-mcard-grab" aria-hidden="true" />
      <button type="button" className="mp-mcard-x" aria-label={t('c_close')} onClick={onClose}>
        <Icon name="cross" size={18} />
      </button>
      <div className="mp-mcard-top">
        <PlaceThumb
          className="mp-mcard-img"
          src={place.heroImageUrl}
          icon={categoryIcon(place.categoryKey)}
          size={26}
        />
        <div className="mp-mcard-meta">
          <b>{name}</b>
          <span>
            {[categoryName, regionName].filter(Boolean).join(' · ')}
            {km !== null && (
              <>
                {' · '}
                <span dir="ltr">{km.toFixed(1)} km</span>
              </>
            )}
          </span>
          <Stars value={place.rating} />
        </div>
      </div>
      <PlaceActions
        placeId={place.id}
        canFavorite={place.canFavorite}
        canAddToTrip={false}
        layout="row"
      >
        <LinkButton href={`/places/${place.slug}`} variant="forest" size="sm">
          {t('mp5_details')}
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
    </article>
  )
}

function MobileLockedCard({
  regionName,
  price,
  onClose,
}: {
  regionName: string
  price: string | null
  onClose: () => void
}) {
  const t = useTranslations()
  const swipe = useSwipeDown(onClose)
  return (
    <article className="mp-mcard is-locked" style={swipe.style} {...swipe.handlers}>
      <span className="mp-mcard-grab" aria-hidden="true" />
      <button type="button" className="mp-mcard-x" aria-label={t('c_close')} onClick={onClose}>
        <Icon name="cross" size={18} />
      </button>
      <div className="mp-mcard-top">
        <span className="mp-mcard-img pl-ph">
          <Icon name="lock" size={26} />
        </span>
        <div className="mp-mcard-meta">
          <b>{t('mp3_pl_locked_t')}</b>
          <span>{t('mp3_locked_region', { region: regionName })}</span>
        </div>
      </div>
      <LinkButton href={PLANS_HREF} size="sm" className="mp-mcard-cta">
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
    </article>
  )
}
