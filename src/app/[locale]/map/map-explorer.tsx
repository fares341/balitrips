'use client'

/**
 * The public map, v3 (owner, Nov 2026 — reference: a GetYourGuide-style map
 * screen). Map first, on every screen size:
 *
 *   header  — back · area name (or «Bali») · list toggle
 *   chips   — Categories · Traveler type · Duration · Area (dropdown sheets)
 *   map     — clustered pins drawn by MapLibre itself (GeoJSON source)
 *   cards   — a snap carousel synced both ways with the selected pin
 *
 * Filters change the data, never the map: the MapLibre instance is created
 * once and its source is swapped with `setData`, keeping the old pins until
 * the new ones arrive. Pan / zoom never re-render React.
 *
 * This component receives counts and the category look only. Places arrive
 * from `/api/map/places` per filter, already redacted on the server.
 */

import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react'
import { useTranslations } from 'next-intl'

import { Icon, SafeImg, type IconName } from '@/components/ui'
import { Money } from '@/components/currency/currency-context'
import { Link, useRouter } from '@/i18n/routing'
import {
  ALL_AREA,
  boundsOf,
  byDistance,
  categoryCounts,
  lockedCounts,
  mapQuery,
  nearestChain,
  parseFactFilter,
  parseSelection,
  toFeatureCollection,
  windowRange,
  type CountRow,
  type DurationBucket,
  type FactFilter,
  type ResultPlace,
  type Selection,
  type TravelerType,
} from '@/lib/map/explore'

import type { AreaLabelPoint } from '@/lib/map/area-labels'
import { formatDistance, haversineMeters, type LatLon } from '@/lib/map/distance'
import { PIN_KINDS, PIN_LOOK, pinImageId, pinKindFor } from '@/lib/map/pins'
import {
  CLUSTER_MAX_ZOOM,
  CLUSTER_MIN_POINTS,
  CLUSTER_RADIUS,
  FIT_MS,
  PIN_SIZE_BY_ZOOM,
  PIN_W,
  PIN_W_ON,
  SYMBOL_FADE_MS,
} from '@/lib/map/map-feel'
import {
  areaOfKey,
  moveDuration,
  planPinMove,
  sheetCover,
  shouldFrameResults,
  SIDE_PX,
  type Insets,
} from '@/lib/map/camera'
import { SHEET_CLOSED, sheetReducer, type SheetStop } from '@/lib/map/sheet-state'
import {
  filterBySection,
  parseSection,
  sectionParentFor,
  sectionsWithPlaces,
  withSection,
  type SectionItem,
} from '@/lib/map/sections'

import { CategoryGlyph } from './category-glyph'
import { MapWatermark, protectionHandlers } from './map-protect'
import { attributionsFor, REAL_MAX_ZOOM, type MapSettings } from './map-style'
import { loadMapLibre, type MapLike } from './maplibre-loader'
import { FavoriteHeart } from './place-actions'
import { drawPin, PinGlyph } from './pin-glyph'
import { PlaceSheet, type NearbyItem } from './place-sheet'
import { createRealMap } from './real-map'

export interface AreaItem {
  key: string
  label: string
  parentKey: string | null
  count: number
  top: string[]
  /** Centre for «distance from the area» (DB centre, or its sub-areas'). */
  center: LatLon | null
}

export interface CategoryItem {
  key: string
  label: string
  tier: 'free' | 'vip'
  /** VIP and this viewer has no map access. */
  locked: boolean
  color: string
  icon: IconName
}

export interface PlanItem {
  id: string
  name: string
  price: string
  /** For the live «≈» display-currency price. */
  priceMinor: number
  currency: string
  durationDays: number | null
  href: string
}

interface Props {
  locale: string
  areas: AreaItem[]
  counts: CountRow[]
  categories: CategoryItem[]
  initial: Selection
  /** Restaurant sections (child categories), labelled for this locale. */
  sections: SectionItem[]
  /** `?sec=` from the link (already checked against `sections`). */
  initialSection: string | null
  initialFacts: { travelers: TravelerType[]; durations: DurationBucket[] }
  travelerOptions: TravelerType[]
  durationOptions: DurationBucket[]
  initialPlace: string | null
  plans: PlanItem[]
  unlocked: boolean
  viewerLabel: string | null
  settings: MapSettings
  /** Curated area names drawn on the map (OSM place labels are hidden). */
  areaLabels: AreaLabelPoint[]
}

type SheetKind = 'cats' | 'traveler' | 'dur' | 'area'

interface Results {
  key: string
  places: ResultPlace[]
  lockedCount: number
}

const NO_PLACES: ResultPlace[] = []

/** Brand forest-deep: the selected pin and clusters (navy clashed with the palette). */
const PIN_ON = '#1b3f22'
/** Desktop side panel width (px), mirrored in bt-map.css. */
const PANEL_W = 400
const GEO_KEY = 'mx-geo'

type GeoState = 'off' | 'asking' | 'on' | 'denied'

function readGeo(): string | null {
  try {
    return window.sessionStorage.getItem(GEO_KEY)
  } catch {
    return null
  }
}
function writeGeo(value: 'granted' | 'denied') {
  try {
    window.sessionStorage.setItem(GEO_KEY, value)
  } catch {
    // private mode: the choice just isn't remembered
  }
}

/** The visitor asked for less motion (the map then jumps instead of easing). */
function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return desktop
}

export function MapExplorer(props: Props) {
  const t = useTranslations()
  const router = useRouter()
  const { areas, categories, counts, sections } = props

  const areaKeys = useMemo(() => new Set(areas.map((one) => one.key)), [areas])
  const catKeys = useMemo(() => new Set(categories.map((one) => one.key)), [categories])
  const catByKey = useMemo(() => new Map(categories.map((one) => [one.key, one])), [categories])
  const areaByKey = useMemo(() => new Map(areas.map((one) => [one.key, one])), [areas])

  const [applied, setApplied] = useState<Selection>(props.initial)
  const [section, setSection] = useState<string | null>(props.initialSection)
  const sectionRef = useRef(props.initialSection)
  const sectionKeys = useMemo(() => new Set(sections.map((one) => one.key)), [sections])
  const [facts, setFacts] = useState<FactFilter>(props.initialFacts)
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  /** The paywall sheet: one locked category, or `all` (the «N VIP places» chip). */
  const [paywall, setPaywall] = useState<CategoryItem | 'all' | null>(null)
  const [view, setView] = useState<'map' | 'list'>('map')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [userPos, setUserPos] = useState<LatLon | null>(null)
  const [geo, setGeo] = useState<GeoState>('off')
  const [sheetState, dispatchSheet] = useReducer(sheetReducer, SHEET_CLOSED)
  const sheetOpen = sheetState.stop !== 'closed'
  const sheetOpenRef = useRef(sheetOpen)
  useLayoutEffect(() => {
    sheetOpenRef.current = sheetOpen
  })
  const desktop = useDesktop()
  const desktopRef = useRef(desktop)
  useLayoutEffect(() => {
    desktopRef.current = desktop
  })

  // ---- URL ------------------------------------------------------------------

  /** Filters replace the URL (the back button leaves the map, like the reference). */
  const apply = useCallback(
    (next: Selection, nextFacts: FactFilter, nextSection?: string | null) => {
      // A section survives only while its parent is the one chosen category.
      const parent = sectionParentFor(next.categories, sections)
      const wanted = nextSection === undefined ? sectionRef.current : nextSection
      const sec =
        wanted !== null && sections.some((one) => one.key === wanted && one.parentKey === parent)
          ? wanted
          : null
      sectionRef.current = sec
      setSection(sec)
      setApplied(next)
      setFacts(nextFacts)
      const url = `${window.location.pathname}${withSection(mapQuery(next, nextFacts), sec)}`
      window.history.replaceState(window.history.state, '', url)
    },
    [sections],
  )

  // ---- Results ----------------------------------------------------------------

  const resultKey = [
    applied.area ?? ALL_AREA,
    applied.categories.join(','),
    facts.travelers.join(','),
    facts.durations.join(','),
  ].join('|')
  const [results, setResults] = useState<Results>({ key: '', places: NO_PLACES, lockedCount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const [area, cat, traveler, dur] = resultKey.split('|')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fetch starts here
    setLoading(true)
    setError(false)
    const params = new URLSearchParams({ area: area ?? ALL_AREA, locale: props.locale })
    if (cat) params.set('cat', cat)
    if (traveler) params.set('traveler', traveler)
    if (dur) params.set('dur', dur)
    void (async () => {
      try {
        const response = await fetch(`/api/map/places?${params.toString()}`, {
          signal: controller.signal,
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as { places: ResultPlace[]; lockedCount: number }
        // The previous pins stay until this moment: one swap, no flash.
        setResults({
          key: resultKey,
          places: nearestChain(body.places),
          lockedCount: body.lockedCount,
        })
        setLoading(false)
      } catch {
        if (!controller.signal.aborted) {
          setLoading(false)
          setError(true)
        }
      }
    })()
    return () => controller.abort()
  }, [resultKey, props.locale, attempt])

  // Restaurant sections: a second pill row under Restaurants alone, built
  // from the sections the current results really use; filtered client-side.
  const sectionParent = sectionParentFor(applied.categories, sections)
  const sectionPills = useMemo(
    () =>
      sectionParent === null ? [] : sectionsWithPlaces(sections, sectionParent, results.places),
    [sections, sectionParent, results.places],
  )
  const activeSection =
    section !== null && sectionPills.some((one) => one.key === section) ? section : null
  const places = useMemo(() => {
    const base = filterBySection(results.places, activeSection)
    return userPos ? byDistance(base, userPos) : base
  }, [results.places, userPos, activeSection])
  const placeById = useMemo(() => new Map(places.map((one) => [one.id, one])), [places])
  const placeIdsRef = useRef<ReadonlyMap<string, ResultPlace>>(placeById)
  useLayoutEffect(() => {
    placeIdsRef.current = placeById
  })

  // Back / forward (filters replace the URL; the place sheet pushes one entry).
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search)
      const next = parseSelection(
        { area: params.get('area'), region: params.get('region'), cat: params.get('cat') },
        areaKeys,
        catKeys,
      )
      setApplied({ area: next.area ?? ALL_AREA, categories: next.categories })
      const sec = parseSection(params.get('sec'), sectionKeys)
      sectionRef.current = sec
      setSection(sec)
      setFacts(parseFactFilter({ traveler: params.get('traveler'), dur: params.get('dur') }))
      setSheet(null)
      setPaywall(null)
      // Forward onto a sheet entry reopens its place (the camera only moves
      // if that pin is hidden); Back closes the sheet before it leaves the page.
      const state = window.history.state as { mxSheet?: boolean; mxPlace?: unknown } | null
      const back = typeof state?.mxPlace === 'string' ? state.mxPlace : null
      if (state?.mxSheet && back !== null && placeIdsRef.current.has(back)) {
        sheetOpenRef.current = true
        setSelectedId(back)
        dispatchSheet({ type: 'open', id: back, stop: 'peek' })
      } else if (sheetOpenRef.current) {
        sheetOpenRef.current = false
        dispatchSheet({ type: 'close' })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [areaKeys, catKeys, sectionKeys])
  const fresh = results.key === resultKey

  // Deep link `?place=` selects that place once it arrives.
  const wantedSlug = useRef(props.initialPlace)
  useEffect(() => {
    if (wantedSlug.current === null) return
    const hit = places.find((one) => one.slug === wantedSlug.current)
    if (hit) {
      setSelectedId(hit.id)
      wantedSlug.current = null
      // The deep link opens the sheet (no extra history entry: Back leaves).
      sheetOpenRef.current = true
      dispatchSheet({ type: 'open', id: hit.id, stop: 'half' })
    }
  }, [places])

  const sheetPlace =
    sheetState.placeId === null ? null : (placeById.get(sheetState.placeId) ?? null)
  // The sheet only shows with a place; an «open» sheet whose place left the
  // results (filter change) used to hide the cards with nothing in their place.
  const sheetVisible = sheetOpen && sheetPlace !== null
  const selected = selectedId === null ? null : (placeById.get(selectedId) ?? null)
  const current = (sheetOpen ? sheetPlace : null) ?? selected ?? places[0] ?? null
  const currentIndex = current === null ? 0 : Math.max(0, places.indexOf(current))

  // ---- Map ⇄ carousel sync ----------------------------------------------------

  const mapApi = useRef<ResultsMapHandle>(null)
  const carouselApi = useRef<CarouselHandle>(null)

  /** Opens (or swaps) the place sheet. One history entry per opening. */
  const openSheet = useCallback((id: string, stop: 'peek' | 'half') => {
    const entry = { ...window.history.state, mxSheet: true, mxPlace: id }
    if (!sheetOpenRef.current) {
      window.history.pushState(entry, '', window.location.href)
      sheetOpenRef.current = true
    } else if ((window.history.state as { mxSheet?: boolean } | null)?.mxSheet) {
      // A swap keeps the one entry, now naming the place on screen.
      window.history.replaceState(entry, '', window.location.href)
    }
    setSelectedId(id)
    carouselApi.current?.scrollToId(id, 'instant')
    dispatchSheet({ type: 'open', id, stop })
  }, [])

  /** ✕, drag down, empty map: through history so Back stays in step. */
  const closeSheet = useCallback(() => {
    if (!sheetOpenRef.current) return
    const state = window.history.state as { mxSheet?: boolean } | null
    if (state?.mxSheet) {
      window.history.back()
      return
    }
    sheetOpenRef.current = false
    dispatchSheet({ type: 'close' })
  }, [])

  // New results without the sheet's place (a filter change): close the sheet so
  // the cards come back instead of an empty, invisible «open» sheet.
  useEffect(() => {
    if (sheetOpen && places.length > 0 && sheetPlace === null) closeSheet()
  }, [sheetOpen, sheetPlace, places, closeSheet])

  /**
   * A pin was tapped: the sheet opens at peek (or swaps its place). The
   * camera is moved once, by the sheet effect below (not here as well: two
   * eases in a row used to cancel each other mid-way).
   */
  const onPin = useCallback((id: string) => openSheet(id, 'peek'), [openSheet])

  /**
   * The carousel settled on a card: select it and ease the map to its pin.
   * Phone: only while the cards are on screen (under an open sheet they are
   * hidden, and a settle there is our own scroll, never a swipe). Desktop: the
   * cards stay beside the open panel, so a new card swaps the panel to it.
   */
  const onCard = useCallback(
    (id: string) => {
      if (sheetOpenRef.current) {
        if (desktopRef.current) openSheet(id, 'peek')
        return
      }
      setSelectedId((prev) => {
        if (prev !== id) mapApi.current?.glide(id)
        return id
      })
    },
    [openSheet],
  )

  /** A card was tapped: the sheet opens at half. */
  const onCardOpen = useCallback((id: string) => openSheet(id, 'half'), [openSheet])

  // The one camera move for a selection: the sheet's place stays in the
  // visible part of the map as it opens, swaps or changes stop. The map
  // decides whether it needs to move at all (`planPinMove`).
  useEffect(() => {
    if (!sheetOpen || sheetState.placeId === null) return
    mapApi.current?.show(sheetState.placeId)
  }, [sheetOpen, sheetState.placeId, sheetState.stop, desktop])

  // ---- Actions ----------------------------------------------------------------

  const toggleTraveler = (value: TravelerType) => {
    const list = facts.travelers
    const next = list.includes(value) ? list.filter((one) => one !== value) : [...list, value]
    apply(applied, { ...facts, travelers: next })
  }
  const toggleDuration = (value: DurationBucket) => {
    const list = facts.durations
    const next = list.includes(value) ? list.filter((one) => one !== value) : [...list, value]
    apply(applied, { ...facts, durations: next })
  }

  const resetAll = () => {
    apply({ area: ALL_AREA, categories: [] }, { travelers: [], durations: [] })
  }

  /** Asks for the position — only ever from a tap (or a grant this session). */
  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeo('denied')
      return
    }
    setGeo('asking')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        writeGeo('granted')
        setGeo('on')
        setUserPos({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      () => {
        writeGeo('denied')
        setGeo('denied')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  // Granted earlier in this session (and still granted): no prompt, no tap.
  useEffect(() => {
    if (readGeo() !== 'granted' || !navigator.permissions?.query) return
    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (status.state === 'granted') locate()
      })
      .catch(() => undefined)
  }, [locate])

  const goBack = () => {
    const sameOrigin = document.referrer.startsWith(window.location.origin)
    if (sameOrigin && window.history.length > 1) window.history.back()
    else router.push('/')
  }

  const area = applied.area ?? ALL_AREA
  const title = area === ALL_AREA ? t('mx3_bali') : (areaByKey.get(area)?.label ?? t('mx3_bali'))
  const countsHere = useMemo(() => categoryCounts(counts, area), [counts, area])
  const lockedHere = useMemo(() => lockedCounts(counts, area), [counts, area])

  /** Nothing of this type can be opened here by this viewer. */
  const lockedInArea = (category: CategoryItem): boolean => {
    if (props.unlocked) return false
    const n = countsHere.get(category.key) ?? 0
    return category.locked || (n > 0 && (lockedHere.get(category.key) ?? 0) >= n)
  }

  const toggleCat = (category: CategoryItem) => {
    if (lockedInArea(category)) {
      setPaywall(category)
      return
    }
    const has = applied.categories.includes(category.key)
    const next = has
      ? applied.categories.filter((one) => one !== category.key)
      : [...applied.categories, category.key]
    apply({ area: applied.area, categories: next }, facts)
  }

  // Distance: from the viewer (opted in), else from the chosen area's centre,
  // else none. Never a made-up origin.
  const areaCenter = area === ALL_AREA ? null : (areaByKey.get(area)?.center ?? null)
  const distanceOf = useCallback(
    (place: ResultPlace): string | null => {
      const origin = userPos ?? areaCenter
      if (origin === null) return null
      const d = formatDistance(haversineMeters(origin, place), props.locale)
      if (d === '') return null
      return userPos ? t('mx4_away', { d }) : t('mx4_from_area', { d, area: title })
    },
    [userPos, areaCenter, props.locale, title, t],
  )

  const nearby: NearbyItem[] = useMemo(() => {
    if (sheetPlace === null) return []
    return places
      .filter((one) => one.id !== sheetPlace.id)
      .map((one) => ({ one, d: haversineMeters(sheetPlace, one) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)
      .map(({ one, d }) => ({ place: one, distance: formatDistance(d, props.locale) }))
  }, [places, sheetPlace, props.locale])
  const protectedProps = protectionHandlers(props.viewerLabel !== null)

  const catLabel =
    applied.categories.length === 0
      ? t('mx3_categories')
      : applied.categories.length === 1
        ? (catByKey.get(applied.categories[0] ?? '')?.label ?? t('mx3_categories'))
        : `${t('mx3_categories')} · ${applied.categories.length}`
  const factLabel = (base: string, list: readonly string[], prefix: string) =>
    list.length === 0
      ? base
      : list.length === 1
        ? t(`${prefix}${list[0]}` as 'mx3_trav_families')
        : `${base} · ${list.length}`

  const filtered =
    applied.categories.length > 0 ||
    facts.travelers.length > 0 ||
    facts.durations.length > 0 ||
    area !== ALL_AREA

  const chip = (kind: SheetKind, label: string, on: boolean, lead?: ReactNode) => (
    <button
      type="button"
      className={on ? 'mx3-chip is-on' : 'mx3-chip'}
      aria-haspopup="dialog"
      aria-expanded={sheet === kind}
      onClick={() => setSheet(kind)}
      data-chip={kind}
    >
      {lead}
      <span>{label}</span>
      <span className="mx3-caret" aria-hidden="true" />
    </button>
  )

  const empty = fresh && !loading && !error && places.length === 0

  return (
    <main
      className="mx mx3"
      data-view={view}
      data-loading={loading || undefined}
      {...protectedProps}
    >
      <header className="mx3-head">
        <div className="mx3-bar">
          <button
            type="button"
            className="mx3-icon mx3-back"
            aria-label={t('mx3_back')}
            onClick={goBack}
          >
            <Icon name="chevronr" size={22} />
          </button>
          <h1 className="mx3-title">{title}</h1>
          <button
            type="button"
            className="mx3-icon"
            aria-label={view === 'map' ? t('mx3_list_view') : t('mx3_map_view')}
            aria-pressed={view === 'list'}
            onClick={() => setView((v) => (v === 'map' ? 'list' : 'map'))}
            data-toggle="view"
          >
            <Icon name={view === 'map' ? 'list' : 'map'} size={22} />
          </button>
        </div>
        <div className="mx3-chips" role="toolbar" aria-label={t('mx3_filters')}>
          {chip(
            'cats',
            catLabel,
            applied.categories.length > 0,
            applied.categories.length > 0 ? (
              <span className="mx4-chip-dots">
                {applied.categories.slice(0, 3).map((key) => (
                  <PinGlyph key={key} categoryKey={key} size={18} />
                ))}
              </span>
            ) : undefined,
          )}
          {props.travelerOptions.length > 0 &&
            chip(
              'traveler',
              factLabel(t('mx3_traveler'), facts.travelers, 'mx3_trav_'),
              facts.travelers.length > 0,
            )}
          {props.durationOptions.length > 0 &&
            chip(
              'dur',
              factLabel(t('mx3_duration'), facts.durations, 'mx3_dur_'),
              facts.durations.length > 0,
            )}
          {areas.length > 0 &&
            chip('area', area === ALL_AREA ? t('mx3_area') : title, area !== ALL_AREA)}
          {!props.unlocked && results.lockedCount > 0 && fresh && (
            <button
              type="button"
              className="mx3-chip is-vip"
              onClick={() => {
                // One chosen type holds every locked place here: name it.
                const withLocked = applied.categories.filter(
                  (key) => (lockedHere.get(key) ?? 0) > 0,
                )
                const only = withLocked.length === 1 ? catByKey.get(withLocked[0]!) : undefined
                setPaywall(only ?? 'all')
              }}
            >
              <Icon name="lock" size={14} />
              <span>{t('mx3_locked_n', { n: results.lockedCount })}</span>
            </button>
          )}
          <button
            type="button"
            className={geo === 'on' ? 'mx3-chip mx4-near is-on' : 'mx3-chip mx4-near'}
            aria-pressed={geo === 'on'}
            onClick={locate}
            data-chip="near"
          >
            <Icon name="locate" size={15} />
            <span>{geo === 'asking' ? t('mx4_locating') : t('mx4_near_me')}</span>
          </button>
        </div>
        {sectionPills.length > 0 && (
          <div className="mx3-chips mx5-secs" role="toolbar" aria-label={t('mx5_sections')}>
            <button
              type="button"
              className={activeSection === null ? 'mx3-chip mx5-sec is-on' : 'mx3-chip mx5-sec'}
              aria-pressed={activeSection === null}
              onClick={() => apply(applied, facts, null)}
              data-sec="all"
            >
              <span>{t('mx5_section_all')}</span>
            </button>
            {sectionPills.map((one) => (
              <button
                key={one.key}
                type="button"
                className={
                  activeSection === one.key ? 'mx3-chip mx5-sec is-on' : 'mx3-chip mx5-sec'
                }
                aria-pressed={activeSection === one.key}
                onClick={() => apply(applied, facts, activeSection === one.key ? null : one.key)}
                data-sec={one.key}
              >
                <span>{one.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mx3-progress" aria-hidden="true" />
      </header>

      <ResultsMap
        ref={mapApi}
        locale={props.locale}
        settings={props.settings}
        places={places}
        resultKey={results.key}
        initialSlug={props.initialPlace}
        selectedId={current?.id ?? null}
        sheetStop={sheetVisible ? sheetState.stop : 'closed'}
        desktop={desktop}
        userPos={userPos}
        labels={props.areaLabels}
        onPin={onPin}
        onEmpty={closeSheet}
      />

      <MapTools onLocate={locate} geo={geo} />
      {props.viewerLabel !== null && <MapWatermark label={props.viewerLabel} />}
      <Attribution settings={props.settings} />

      <div
        className="mx3-bottom"
        aria-live="polite"
        data-hidden={(sheetVisible && !desktop) || undefined}
      >
        {error ? (
          <div className="mx3-state" role="alert">
            <p>{t('mx3_load_error')}</p>
            <button type="button" className="mx3-btn" onClick={() => setAttempt((n) => n + 1)}>
              <Icon name="refresh" size={16} />
              {t('mx3_retry')}
            </button>
          </div>
        ) : empty ? (
          <div className="mx3-state" role="status">
            <p>{t('mx3_no_match')}</p>
            {filtered && (
              <button type="button" className="mx3-btn" onClick={resetAll}>
                {t('mx3_reset')}
              </button>
            )}
          </div>
        ) : places.length === 0 ? (
          <div className="mx3-skeleton" role="status" aria-label={t('mx3_loading')}>
            <span />
          </div>
        ) : (
          <Carousel
            ref={carouselApi}
            places={places}
            index={currentIndex}
            categories={catByKey}
            onSettle={onCard}
            onOpen={onCardOpen}
            distanceOf={distanceOf}
          />
        )}
      </div>

      {view === 'list' && (
        <section className="mx3-list" aria-label={t('mx3_places_in')}>
          {places.length === 0 && !loading && <p className="mx3-list-empty">{t('mx3_no_match')}</p>}
          <ul>
            {places.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className={place.id === current?.id ? 'mx3-row is-on' : 'mx3-row'}
                  onClick={() => {
                    setSelectedId(place.id)
                    setView('map')
                    openSheet(place.id, 'half')
                    // After the list closes the carousel follows (the map is
                    // moved by the sheet effect).
                    requestAnimationFrame(() => {
                      carouselApi.current?.scrollToId(place.id, 'instant')
                    })
                  }}
                >
                  <Thumb src={place.thumb} category={catByKey.get(place.categoryKey)} />
                  <span className="mx3-row-text">
                    <strong>{place.name}</strong>
                    <small>
                      <PinGlyph categoryKey={place.categoryKey} size={16} />
                      {catByKey.get(place.categoryKey)?.label}
                      {place.rating !== null ? ` · ★ ${place.rating.toFixed(1)}` : ''}
                      {distanceOf(place) ? ` · ${distanceOf(place)}` : ''}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sheet === 'cats' && (
        <Sheet title={t('mx3_categories')} onClose={() => setSheet(null)}>
          <ul className="mx3-opts">
            {categories
              .filter((one) => (countsHere.get(one.key) ?? 0) > 0)
              .map((cat) => {
                const on = applied.categories.includes(cat.key)
                const n = countsHere.get(cat.key) ?? 0
                // Same rule as the «N VIP places» chip, so the badges add up to it.
                const lockedN = props.unlocked ? 0 : Math.min(n, lockedHere.get(cat.key) ?? 0)
                const isLocked = lockedInArea(cat)
                const badge = isLocked
                  ? t('mx_vip_n', { n })
                  : lockedN > 0
                    ? t('mx_mixed_n', { free: n - lockedN, locked: lockedN })
                    : cat.tier === 'vip' && !props.unlocked
                      ? t('mx_free_n', { n })
                      : cat.tier === 'vip'
                        ? t('mx_vip_n', { n })
                        : t('mx_free_n', { n })
                return (
                  <li key={cat.key}>
                    <button
                      type="button"
                      role={isLocked ? undefined : 'checkbox'}
                      aria-checked={isLocked ? undefined : on}
                      aria-haspopup={isLocked ? 'dialog' : undefined}
                      className={`mx-cat${on ? ' is-on' : ''}${isLocked ? ' is-locked' : ''}`}
                      onClick={() => toggleCat(cat)}
                      data-cat={cat.key}
                    >
                      <span className="mx-check" aria-hidden="true">
                        {isLocked ? (
                          <Icon name="lock" size={16} />
                        ) : on ? (
                          <Icon name="check" size={16} stroke={2.6} />
                        ) : null}
                      </span>
                      <PinGlyph categoryKey={cat.key} size={30} className="mx-caticon" />
                      <span className="mx-catname">{cat.label}</span>
                      <span
                        className={isLocked || lockedN > 0 ? 'mx-badge is-vip' : 'mx-badge'}
                        data-locked={lockedN}
                      >
                        {badge}
                      </span>
                      {isLocked && <span className="sr-only">{t('mx_locked_aria')}</span>}
                    </button>
                  </li>
                )
              })}
          </ul>
          <SheetFoot
            onClear={
              applied.categories.length > 0
                ? () => apply({ area: applied.area, categories: [] }, facts)
                : null
            }
            onDone={() => setSheet(null)}
          />
        </Sheet>
      )}

      {sheet === 'traveler' && (
        <Sheet title={t('mx3_traveler')} onClose={() => setSheet(null)}>
          <ul className="mx3-opts">
            {props.travelerOptions.map((key) => (
              <li key={key}>
                <OptionRow
                  on={facts.travelers.includes(key)}
                  label={t(`mx3_trav_${key}`)}
                  onClick={() => toggleTraveler(key)}
                />
              </li>
            ))}
          </ul>
          <SheetFoot
            onClear={
              facts.travelers.length > 0 ? () => apply(applied, { ...facts, travelers: [] }) : null
            }
            onDone={() => setSheet(null)}
          />
        </Sheet>
      )}

      {sheet === 'dur' && (
        <Sheet title={t('mx3_duration')} onClose={() => setSheet(null)}>
          <ul className="mx3-opts">
            {props.durationOptions.map((key) => (
              <li key={key}>
                <OptionRow
                  on={facts.durations.includes(key)}
                  label={t(`mx3_dur_${key}`)}
                  onClick={() => toggleDuration(key)}
                />
              </li>
            ))}
          </ul>
          <SheetFoot
            onClear={
              facts.durations.length > 0 ? () => apply(applied, { ...facts, durations: [] }) : null
            }
            onDone={() => setSheet(null)}
          />
        </Sheet>
      )}

      {sheet === 'area' && (
        <Sheet title={t('mx3_area')} onClose={() => setSheet(null)}>
          <AreaPicker
            areas={areas}
            value={area}
            onPick={(key) => {
              // Keep only the chosen types that exist in the new area.
              const here = categoryCounts(counts, key)
              apply(
                {
                  area: key,
                  categories: applied.categories.filter((one) => (here.get(one) ?? 0) > 0),
                },
                facts,
              )
            }}
          />
          <SheetFoot onClear={null} onDone={() => setSheet(null)} />
        </Sheet>
      )}

      <PlaceSheet
        place={sheetPlace}
        stop={sheetPlace === null ? 'closed' : sheetState.stop}
        desktop={desktop}
        locale={props.locale}
        categoryLabel={sheetPlace ? (catByKey.get(sheetPlace.categoryKey)?.label ?? '') : ''}
        distance={sheetPlace ? distanceOf(sheetPlace) : null}
        nearby={nearby}
        onSnap={(stop: SheetStop) => dispatchSheet({ type: 'snap', stop })}
        onClose={closeSheet}
        onOpen={(id) => openSheet(id, 'half')}
      />

      {paywall !== null && (
        <Paywall
          category={paywall === 'all' ? null : paywall}
          lockedNames={categories
            .filter((one) => (lockedHere.get(one.key) ?? 0) > 0)
            .map((one) => one.label)}
          locale={props.locale}
          plans={props.plans}
          onClose={() => setPaywall(null)}
        />
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function OptionRow({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      className={on ? 'mx-cat is-on' : 'mx-cat'}
      onClick={onClick}
    >
      <span className="mx-check" aria-hidden="true">
        {on ? <Icon name="check" size={16} stroke={2.6} /> : null}
      </span>
      <span className="mx-catname">{label}</span>
    </button>
  )
}

function SheetFoot({ onClear, onDone }: { onClear: (() => void) | null; onDone: () => void }) {
  const t = useTranslations()
  return (
    <div className="mx-foot is-sheet mx3-foot">
      {onClear && (
        <button type="button" className="mx-cta is-ghost" onClick={onClear}>
          {t('mx3_clear')}
        </button>
      )}
      <button type="button" className="mx-cta" onClick={onDone}>
        {t('mx3_done')}
      </button>
    </div>
  )
}

function AreaPicker({
  areas,
  value,
  onPick,
}: {
  areas: AreaItem[]
  value: string
  onPick: (key: string) => void
}) {
  const t = useTranslations()
  const directions = areas.filter((one) => one.parentKey === null)
  const currentArea = areas.find((one) => one.key === value)
  const openDirection =
    currentArea === undefined
      ? null
      : currentArea.parentKey === null
        ? currentArea.key
        : currentArea.parentKey
  const subAreas = areas.filter(
    (one) => one.parentKey !== null && (openDirection === null || one.parentKey === openDirection),
  )
  const chip = (key: string, label: string) => (
    <button
      key={key}
      type="button"
      className={value === key ? 'mx-achip is-on' : 'mx-achip'}
      aria-pressed={value === key}
      onClick={() => onPick(key)}
    >
      {label}
    </button>
  )
  return (
    <div className="mx-achips">
      {chip(ALL_AREA, t('mx_all'))}
      {directions.map((one) => chip(one.key, one.label))}
      {subAreas.map((one) => chip(one.key, one.label))}
    </div>
  )
}

function Sheet({
  title,
  onClose,
  children,
  className,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const t = useTranslations()
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useLayoutEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [])
  return (
    <div className="mx-scrim" onClick={onClose}>
      <div
        ref={ref}
        className={className ? `mx-sheet ${className}` : 'mx-sheet'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-grab" aria-hidden="true" />
        <div className="mx-sheet-head">
          <strong>{title}</strong>
          <button type="button" className="mx-x" aria-label={t('c_close')} onClick={onClose}>
            <Icon name="cross" size={18} />
          </button>
        </div>
        <div className="mx-sheet-body">{children}</div>
      </div>
    </div>
  )
}

function Paywall({
  category,
  lockedNames,
  locale,
  plans,
  onClose,
}: {
  /** The locked type that was tapped; null for the general «N VIP places» chip. */
  category: CategoryItem | null
  /** Every type with locked places here (what the subscription opens). */
  lockedNames: string[]
  locale: string
  plans: PlanItem[]
  onClose: () => void
}) {
  const t = useTranslations()
  const term = (plan: PlanItem) =>
    plan.durationDays === null
      ? t('mx_term_life')
      : plan.durationDays === 365 || plan.durationDays === 366
        ? t('mx_term_year')
        : plan.durationDays % 30 === 0
          ? t('mx_term_months', { n: plan.durationDays / 30 })
          : t('mx_term_days', { n: plan.durationDays })
  // The duration is the label (said once). Two plans of the same length are
  // told apart by their names instead.
  const terms = plans.map(term)
  const label = (index: number) =>
    terms.indexOf(terms[index]!) === terms.lastIndexOf(terms[index]!)
      ? terms[index]!
      : plans[index]!.name
  const title =
    category === null ? t('mx_vip_title_all') : t('mx_vip_title', { name: category.label })
  let names = ''
  if (lockedNames.length > 0) {
    try {
      names = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
        lockedNames,
      )
    } catch {
      names = lockedNames.join(locale === 'ar' ? '، ' : ', ')
    }
  }
  return (
    <Sheet title={title} onClose={onClose} className="is-paywall">
      <div className="mx-pw">
        <span className="mx-pw-lock" aria-hidden="true">
          <Icon name="lock" size={24} />
        </span>
        <h2 className="mx-h3">{title}</h2>
        <p className="mx-sub">
          {names === '' ? t('mx_vip_body_plain') : t('mx_vip_body', { names })}
        </p>
        {plans.map((plan, index) => (
          <a
            key={plan.id}
            href={plan.href}
            rel="nofollow"
            className={index === 0 ? 'mx-cta is-orange mx-plan' : 'mx-cta is-ghost mx-plan'}
            title={plan.name}
            data-plan-days={plan.durationDays ?? ''}
          >
            <span>{label(index)}</span>
            <span aria-hidden="true">–</span>
            <Money minor={plan.priceMinor} currency={plan.currency} />
          </a>
        ))}
        {plans.length === 0 && (
          <Link href="/plans" className="mx-cta is-orange">
            {t('mx_all_plans')}
          </Link>
        )}
        <button type="button" className="mx-link" onClick={onClose}>
          {t('mx_not_now')}
        </button>
      </div>
    </Sheet>
  )
}

function Thumb({
  src,
  category,
  eager = false,
}: {
  src: string | null
  category: CategoryItem | undefined
  /**
   * Carousel cards load eagerly: they are 320px thumbs inside a horizontal
   * scroll-snap strip that is windowed to ~21 cards, and `loading="lazy"`
   * inside a horizontal overflow container is unreliable (WebKit can leave
   * them unloaded until the page itself scrolls).
   */
  eager?: boolean
}) {
  const placeholder = (
    <CategoryGlyph
      className="mx3-thumb is-ph"
      categoryKey={category?.key}
      color={category?.color}
    />
  )
  return (
    <SafeImg
      className="mx3-thumb"
      src={src}
      deferGoogle
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fallback={placeholder}
    />
  )
}

function MapTools({ onLocate, geo }: { onLocate: () => void; geo: GeoState }) {
  const t = useTranslations()
  return (
    <div className="mx3-tools">
      <button
        type="button"
        className={geo === 'on' ? 'mx-tool is-on' : 'mx-tool'}
        aria-label={t('mx_locate')}
        onClick={onLocate}
      >
        <Icon name="locate" size={20} />
      </button>
      {geo === 'denied' && (
        <p className="mx-toast" role="alert">
          {t('mx4_geo_denied')}
        </p>
      )}
    </div>
  )
}

function Attribution({ settings }: { settings: MapSettings }) {
  return (
    <p className="mx-attr">
      {attributionsFor({ ...settings, satellite: 'none', satelliteKey: '' })
        .filter((line) => !line.startsWith('Terrain'))
        .join(' · ')}
    </p>
  )
}

// ---------------------------------------------------------------------------
// The carousel (CSS scroll-snap, windowed)
// ---------------------------------------------------------------------------

interface CarouselHandle {
  scrollToId(id: string, behavior?: ScrollBehavior): void
}

/** Cards rendered on each side of the current one. */
const WINDOW = 10
const GAP = 10

function Carousel({
  ref,
  places,
  index,
  categories,
  onSettle,
  onOpen,
  distanceOf,
}: {
  ref: Ref<CarouselHandle>
  places: ResultPlace[]
  index: number
  categories: Map<string, CategoryItem>
  onSettle: (id: string) => void
  onOpen: (id: string) => void
  distanceOf: (place: ResultPlace) => string | null
}) {
  const t = useTranslations()
  const box = useRef<HTMLDivElement>(null)
  const [cardW, setCardW] = useState(320)
  /** Programmatic scroll in flight: its settle must not echo back to the map. */
  const driving = useRef<string | null>(null)
  const [center, setCenter] = useState(index)
  const latest = useRef({ places, onSettle, cardW })
  useLayoutEffect(() => {
    latest.current = { places, onSettle, cardW }
  })

  const rtl = () => box.current !== null && getComputedStyle(box.current).direction === 'rtl'
  const step = cardW + GAP

  const indexAt = useCallback(() => {
    const el = box.current
    if (!el) return 0
    const s = latest.current.cardW + GAP
    return Math.round(Math.abs(el.scrollLeft) / s)
  }, [])

  /** A jump to a card outside the rendered window waits for that window. */
  const pending = useRef<{ i: number; behavior: ScrollBehavior; quiet: boolean } | null>(null)
  const centerRef = useRef(center)
  useLayoutEffect(() => {
    centerRef.current = center
  })

  /** Scroll to card `i`. `quiet`: its settle is ours, so it must not echo back. */
  const scrollNow = useCallback((i: number, behavior: ScrollBehavior, quiet: boolean) => {
    const el = box.current
    if (!el) return
    const left = i * (latest.current.cardW + GAP) * (rtl() ? -1 : 1)
    if (Math.abs(el.scrollLeft - left) < 2) return
    driving.current = quiet ? (latest.current.places[i]?.id ?? null) : null
    el.scrollTo({ left, behavior: behavior === 'smooth' && reducedMotion() ? 'instant' : behavior })
  }, [])

  /**
   * Only the window around the current card is rendered, and scroll-snap is
   * mandatory: a jump into the spacer (no snap points there) used to snap to
   * the nearest rendered card instead — a different place, which then
   * «settled» and moved the map to it. Far jumps render the window first.
   */
  const scrollToIndex = useCallback(
    (i: number, behavior: ScrollBehavior, quiet: boolean) => {
      const [from, to] = windowRange(latest.current.places.length, centerRef.current, WINDOW)
      if (i >= from && i < to) {
        scrollNow(i, behavior, quiet)
        return
      }
      pending.current = { i, behavior, quiet }
      setCenter(i)
    },
    [scrollNow],
  )

  // The window around a far card is rendered: now jump to it.
  useLayoutEffect(() => {
    const job = pending.current
    if (job === null) return
    pending.current = null
    scrollNow(job.i, job.behavior, job.quiet)
  })

  useImperativeHandle(
    ref,
    () => ({
      scrollToId(id, behavior = 'smooth') {
        const i = latest.current.places.findIndex((one) => one.id === id)
        if (i < 0) return
        scrollToIndex(i, behavior, true)
      },
    }),
    [scrollToIndex],
  )

  // Card width follows the box (one card + the neighbours peeking).
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      setCardW(Math.round(Math.min(380, Math.max(240, w - 64))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // New results: start at the selected card without animating.
  useLayoutEffect(() => {
    const [from, to] = windowRange(places.length, centerRef.current, WINDOW)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-centre the window on new data
    setCenter(index)
    if (index >= from && index < to) scrollNow(index, 'instant', true)
    else pending.current = { i: index, behavior: 'instant', quiet: true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, cardW])

  // Settle → select. `scrollend` where supported, else a short debounce.
  useEffect(() => {
    const el = box.current
    if (!el) return
    let timer = 0
    const settle = () => {
      window.clearTimeout(timer)
      const i = Math.min(latest.current.places.length - 1, indexAt())
      setCenter(i)
      const place = latest.current.places[i]
      if (!place) return
      // Our own scroll never echoes back to the map, even if it ended a
      // card off (a programmatic jump is not the visitor choosing a card).
      if (driving.current !== null) {
        driving.current = null
        return
      }
      latest.current.onSettle(place.id)
    }
    const supportsEnd = 'onscrollend' in window
    const onScroll = () => {
      if (supportsEnd) return
      window.clearTimeout(timer)
      timer = window.setTimeout(settle, 120)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    if (supportsEnd) el.addEventListener('scrollend', settle)
    return () => {
      window.clearTimeout(timer)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', settle)
    }
  }, [indexAt])

  const [start, end] = windowRange(places.length, center, WINDOW)
  const style = { '--card-w': `${cardW}px`, '--gap': `${GAP}px` } as CSSProperties

  return (
    <div className="mx3-carousel-wrap">
      <button
        type="button"
        className="mx3-nav is-prev"
        aria-label={t('c_prev')}
        disabled={index <= 0}
        onClick={() => {
          scrollToIndex(Math.max(0, index - 1), 'smooth', false)
        }}
      >
        <Icon name="chevronr" size={18} className="mx3-back-ico" />
      </button>
      <div ref={box} className="mx3-carousel" style={style} role="list">
        {start > 0 && <span className="mx3-spacer" style={{ width: start * step - GAP }} />}
        {places.slice(start, end).map((place, k) => (
          <Card
            key={place.id}
            place={place}
            on={start + k === index}
            position={start + k + 1}
            total={places.length}
            category={categories.get(place.categoryKey)}
            distance={distanceOf(place)}
            onOpen={onOpen}
          />
        ))}
        {end < places.length && (
          <span className="mx3-spacer" style={{ width: (places.length - end) * step - GAP }} />
        )}
      </div>
      <button
        type="button"
        className="mx3-nav is-next"
        aria-label={t('c_next')}
        disabled={index >= places.length - 1}
        onClick={() => scrollToIndex(Math.min(places.length - 1, index + 1), 'smooth', false)}
      >
        <Icon name="chevronr" size={18} className="flip" />
      </button>
    </div>
  )
}

const Card = memo(function Card({
  place,
  on,
  position,
  total,
  category,
  distance,
  onOpen,
}: {
  place: ResultPlace
  on: boolean
  position: number
  total: number
  category: CategoryItem | undefined
  distance: string | null
  onOpen: (id: string) => void
}) {
  const t = useTranslations()
  return (
    <article
      role="listitem"
      className={on ? 'mx3-card is-on' : 'mx3-card'}
      aria-current={on || undefined}
      aria-label={`${place.name} — ${t('mx3_card_n', { i: position, n: total })}`}
      data-id={place.id}
    >
      <Thumb src={place.thumb} category={category} eager />
      <PinGlyph categoryKey={place.categoryKey} size={22} className="mx4-card-glyph" />
      <div className="mx3-card-body">
        <h2 className="mx3-card-name">
          <button
            type="button"
            className="mx3-card-link"
            onClick={() => onOpen(place.id)}
            aria-haspopup="dialog"
            data-open={place.slug}
          >
            {place.name}
          </button>
        </h2>
        {place.desc ? (
          <p className="mx3-card-desc">{place.desc}</p>
        ) : (
          category && <p className="mx3-card-desc">{category.label}</p>
        )}
        <div className="mx3-card-foot">
          {place.rating !== null ? (
            <span
              className="mx3-rating"
              aria-label={t('mx3_rating', { r: place.rating.toFixed(1) })}
            >
              <span aria-hidden="true" className="mx3-star">
                ★
              </span>{' '}
              <b dir="ltr">{place.rating.toFixed(1)}</b>
              {place.reviews !== null && (
                <small dir="ltr" aria-label={t('mx3_reviews', { n: place.reviews })}>
                  ({place.reviews})
                </small>
              )}
            </span>
          ) : (
            <span />
          )}
          {distance && (
            <span className="mx4-card-dist" data-distance>
              {distance}
            </span>
          )}
          {place.priceMinor !== null && place.currency !== null && (
            <span className="mx3-price">
              <small>{t('mx3_from')}</small>
              <b>
                <Money minor={place.priceMinor} currency={place.currency} />
              </b>
            </span>
          )}
        </div>
      </div>
      {place.canFavorite && (
        <span className="mx3-fav">
          <FavoriteHeart placeId={place.id} active={on} />
        </span>
      )}
    </article>
  )
})

// ---------------------------------------------------------------------------
// The map (MapLibre draws the pins: GeoJSON source, clustered)
// ---------------------------------------------------------------------------

interface ResultsMapHandle {
  /**
   * The sheet's place: keep its pin in the open area (above the cards or the
   * sheet, beside the desktop panel). Moves only when the pin is hidden or the
   * map is far out, never zooms out (`planPinMove`).
   */
  show(id: string): void
  /** Card swipe (Tiqets): ease the pin to the centre, keeping the zoom. */
  glide(id: string): void
  /** The MapLibre instance (tests assert it survives filter changes). */
  instance(): MapLike | null
}

const SRC = 'mx-places'

const SRC_ON = 'mx-selected'
const SRC_ME = 'mx-me'
const L_CLUSTER = 'mx-clusters'
const L_COUNT = 'mx-cluster-count'
const L_PIN = 'mx-pins'
const L_ON = 'mx-pin-on'
const L_ME = 'mx-me'
const L_ME_HALO = 'mx-me-halo'
const SRC_AREAS = 'mx-areas'
const L_AREAS = 'mx-area-labels'

type GeoSource = {
  setData(data: unknown): void
  getClusterExpansionZoom(id: number): Promise<number>
}

interface Feature {
  layer?: { id?: string }
  properties?: Record<string, unknown>
  geometry?: { type?: string; coordinates?: [number, number] }
}

/** Normal pins: everything but the selected one (its larger copy is drawn on top). */
function pinFilter(selectedId: string | null): unknown[] {
  const point = ['!', ['has', 'point_count']]
  return selectedId === null ? point : ['all', point, ['!=', ['get', 'id'], selectedId]]
}

function addLayers(
  map: MapLike,
  places: readonly ResultPlace[],
  labels: readonly AreaLabelPoint[],
) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  for (const kind of PIN_KINDS) {
    const look = PIN_LOOK[kind]
    for (const selected of [false, true]) {
      const id = pinImageId(kind, selected)
      if (map.hasImage?.(id)) continue
      const image = drawPin(look.color, look.path, selected ? PIN_W_ON : PIN_W, ratio)
      if (image) map.addImage?.(id, image, { pixelRatio: ratio })
    }
  }
  const empty = { type: 'FeatureCollection', features: [] }
  // Curated area names under the pins, anchored at the top (below the point)
  // so a pin on the town centre doesn't hide its name.
  map.addSource(SRC_AREAS, {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: labels.map((one) => ({
        type: 'Feature',
        properties: { n: one.name, s: one.sub, z: one.minZoom },
        geometry: { type: 'Point', coordinates: [one.lon, one.lat] },
      })),
    },
  })
  // One layer per minimum zoom (a layer minzoom, not a zoom filter).
  for (const z of [...new Set(labels.map((one) => one.minZoom))].sort((x, y) => x - y)) {
    map.addLayer({
      id: `${L_AREAS}-${z}`,
      type: 'symbol',
      source: SRC_AREAS,
      minzoom: z,
      filter: ['==', ['get', 'z'], z],
      layout: {
        // Owner pick A (Nov 2026): local name bold and white, the English name
        // small and spaced underneath, a dark halo so both read on the green map.
        'text-field': [
          'format',
          ['get', 'n'],
          {},
          '\n',
          {},
          ['upcase', ['get', 's']],
          { 'font-scale': 0.6, 'text-font': ['literal', ['Noto Sans Regular']] },
        ],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 13, 12, 17],
        'text-letter-spacing': 0.04,
        'text-line-height': 1.15,
        'text-anchor': 'top',
        'text-offset': [0, 0.5],
        'text-padding': 2,
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(12,32,18,0.65)',
        'text-halo-width': 1.2,
        'text-halo-blur': 0.5,
      },
    })
  }
  map.addSource(SRC, {
    type: 'geojson',
    data: toFeatureCollection(places),
    cluster: true,
    // Tiqets feel: only pins that truly overlap merge (3+ within ~12px), and
    // nothing clusters once the island fills the screen a little closer.
    clusterRadius: CLUSTER_RADIUS,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterMinPoints: CLUSTER_MIN_POINTS,
  })
  map.addSource(SRC_ON, { type: 'geojson', data: empty })
  map.addSource(SRC_ME, { type: 'geojson', data: empty })
  map.addLayer({
    id: L_CLUSTER,
    type: 'circle',
    source: SRC,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': PIN_ON,
      'circle-opacity': 0.92,
      // Small and discreet (≈ a pin's head), a little larger for big groups.
      'circle-radius': ['step', ['get', 'point_count'], 10, 10, 12, 50, 14],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  })
  map.addLayer({
    id: L_COUNT,
    type: 'symbol',
    source: SRC,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 11,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': '#ffffff' },
  })
  map.addLayer({
    id: L_PIN,
    type: 'symbol',
    source: SRC,
    filter: pinFilter(null),
    layout: {
      'icon-image': ['concat', 'mx-pin-', ['get', 'k']],
      'icon-size': PIN_SIZE_BY_ZOOM,
      'icon-anchor': 'bottom',
      // The drawn tip sits 1.5px above the image's bottom edge.
      'icon-offset': [0, 1.5],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      // Southern pins drawn over northern ones (they are "closer").
      'symbol-sort-key': ['get', 's'],
    },
  })
  map.addLayer({
    id: L_ME_HALO,
    type: 'circle',
    source: SRC_ME,
    paint: { 'circle-radius': 16, 'circle-color': '#1a73e8', 'circle-opacity': 0.18 },
  })
  map.addLayer({
    id: L_ME,
    type: 'circle',
    source: SRC_ME,
    paint: {
      'circle-radius': 7,
      'circle-color': '#1a73e8',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
    },
  })
  map.addLayer({
    id: L_ON,
    type: 'symbol',
    source: SRC_ON,
    layout: {
      'icon-image': ['concat', 'mx-on-', ['get', 'k']],
      'icon-size': PIN_SIZE_BY_ZOOM,
      'icon-anchor': 'bottom',
      'icon-offset': [0, 1.5],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
}

/** Taps within ~22px of a pin or cluster count (44px target), nearest wins. */
function onMapClick(
  map: MapLike,
  event: unknown,
  onPin: (id: string) => void,
  onEmpty: () => void,
  insets: () => Insets | null,
) {
  const point = (event as { point?: { x: number; y: number } } | undefined)?.point
  if (!point || !map.queryRenderedFeatures) return
  const hits = map.queryRenderedFeatures(
    [
      [point.x - 22, point.y - 26],
      [point.x + 22, point.y + 18],
    ],
    { layers: [L_ON, L_PIN, L_CLUSTER] },
  ) as Feature[]
  if (hits.length === 0) {
    onEmpty()
    return
  }
  // The selected pin's larger copy is drawn on top of its twin: on a tie (two
  // places on one spot) the other pin wins, so it can still be opened.
  const ordered = [
    ...hits.filter((hit) => hit.layer?.id !== L_ON),
    ...hits.filter((hit) => hit.layer?.id === L_ON),
  ]
  let best: Feature | null = null
  let bestD = Infinity
  for (const hit of ordered) {
    const coords = hit.geometry?.coordinates
    if (!coords) continue
    const p = map.project(coords)
    // A pin's body sits above its anchor point.
    const isPin = hit.layer?.id !== L_CLUSTER
    const dy = isPin ? point.y - (p.y - 12) : point.y - p.y
    const d = (point.x - p.x) ** 2 + dy ** 2
    if (d < bestD) {
      bestD = d
      best = hit
    }
  }
  if (!best) return
  if (best.layer?.id === L_CLUSTER) {
    const clusterId = Number(best.properties?.cluster_id)
    const coords = best.geometry?.coordinates
    const source = map.getSource(SRC) as GeoSource | undefined
    if (!source || !coords || !Number.isFinite(clusterId)) return
    void source
      .getClusterExpansionZoom(clusterId)
      .then((zoom) => {
        const from = map.getZoom()
        // Just past the split zoom, so the group opens up at once.
        const to = Math.min(REAL_MAX_ZOOM, Math.max(from + 1, zoom + 0.5))
        const pad = insets()
        map.easeTo({
          center: coords,
          zoom: to,
          ...(pad ? { padding: pad } : {}),
          duration: moveDuration(0, to - from, reducedMotion()),
        })
      })
      .catch(() => undefined)
    return
  }
  const id = best.properties?.id
  if (typeof id === 'string') onPin(id)
}

function ResultsMap({
  ref,
  locale,
  settings,
  places,
  resultKey,
  initialSlug,
  selectedId,
  sheetStop,
  desktop,
  userPos,
  labels,
  onPin,
  onEmpty,
}: {
  ref: Ref<ResultsMapHandle>
  locale: string
  settings: MapSettings
  places: ResultPlace[]
  resultKey: string
  /** `?place=` deep link: open close on that place instead of framing all. */
  initialSlug: string | null
  selectedId: string | null
  /** Where the place sheet is (closed while it shows no place). */
  sheetStop: SheetStop
  desktop: boolean
  userPos: LatLon | null
  labels: AreaLabelPoint[]
  onPin: (id: string) => void
  onEmpty: () => void
}) {
  const t = useTranslations()
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLike | null>(null)
  const [styled, setStyled] = useState(false)
  const [failed, setFailed] = useState(false)
  const latest = useRef({ places, selectedId, onPin, onEmpty, labels, sheetStop, desktop })
  useLayoutEffect(() => {
    latest.current = { places, selectedId, onPin, onEmpty, labels, sheetStop, desktop }
  })

  /**
   * Room the chrome takes over the map box: the header on top; at the bottom
   * the cards, or the place sheet at the stop it is going to (not where its
   * slide happens to be); on desktop the side panel at the inline start.
   * Null while the full sheet hides the map. One measure for every move, so
   * MapLibre's (sticky) padding never differs between two moves.
   */
  const insets = useCallback((): Insets | null => {
    const el = box.current
    const rect = el?.getBoundingClientRect()
    if (!el || !rect || rect.height === 0) return null
    const main = el.closest('.mx3')
    const head = main?.querySelector('.mx3-head')?.getBoundingClientRect()
    const top = (head ? Math.max(0, head.bottom - rect.top) : 0) + 12
    const { sheetStop: stop, desktop: wide } = latest.current
    let bottom: number
    if (!wide && stop !== 'closed') {
      const cover = sheetCover(stop, window.innerHeight, rect.bottom)
      if (cover === null) return null
      bottom = cover + 12
    } else {
      const cards = main?.querySelector('.mx3-bottom')?.getBoundingClientRect()
      bottom = (cards && cards.height > 0 ? Math.max(0, rect.bottom - cards.top) : 0) + 12
    }
    const panel = wide && stop !== 'closed' ? PANEL_W + 12 + SIDE_PX : SIDE_PX
    const rtl = document.documentElement.dir === 'rtl'
    return {
      top,
      bottom: Math.round(Math.min(bottom, rect.height * 0.7)),
      left: rtl ? SIDE_PX : panel,
      right: rtl ? panel : SIDE_PX,
    }
  }, [])

  /** One camera move at a time: a new one replaces the one in flight. */
  const moveTo = useCallback(
    (center: [number, number], zoom: number | undefined, duration: number, pad: Insets) => {
      const map = mapRef.current
      if (!map) return
      if (duration === 0)
        map.jumpTo({ center, ...(zoom === undefined ? {} : { zoom }), padding: pad })
      else map.easeTo({ center, ...(zoom === undefined ? {} : { zoom }), padding: pad, duration })
    },
    [],
  )

  const placeById = useCallback(
    (id: string) => latest.current.places.find((one) => one.id === id) ?? null,
    [],
  )

  useImperativeHandle(
    ref,
    () => ({
      show(id) {
        const map = mapRef.current
        const place = placeById(id)
        const el = box.current
        const pad = insets()
        if (!map || !place || !el || !pad) return
        const { width, height } = el.getBoundingClientRect()
        const move = planPinMove({
          point: map.project([place.lon, place.lat]),
          zoom: map.getZoom(),
          maxZoom: REAL_MAX_ZOOM,
          view: { width, height },
          insets: pad,
          reducedMotion: reducedMotion(),
        })
        if (move) moveTo([place.lon, place.lat], move.zoom, move.duration, pad)
      },
      glide(id) {
        const map = mapRef.current
        const place = placeById(id)
        const el = box.current
        const pad = insets()
        if (!map || !place || !el || !pad) return
        const p = map.project([place.lon, place.lat])
        const { width, height } = el.getBoundingClientRect()
        const cx = (pad.left + width - pad.right) / 2
        const cy = (pad.top + height - pad.bottom) / 2
        const ms = moveDuration(Math.hypot(p.x - cx, p.y - cy), 0, reducedMotion())
        moveTo([place.lon, place.lat], undefined, ms, pad)
      },
      instance: () => mapRef.current,
    }),
    [insets, moveTo, placeById],
  )

  // Create the map once. Locale / settings are fixed for the page's life.
  useEffect(() => {
    let live = true
    let map: MapLike | null = null
    void loadMapLibre()
      .then((engine) => {
        if (!live || !box.current) return
        map = createRealMap(engine, box.current, settings, {
          locale,
          flat: true,
          light: true,
          fadeDuration: SYMBOL_FADE_MS,
        })
        mapRef.current = map
        ;(box.current as HTMLDivElement & { __map?: MapLike }).__map = map
        const m = map
        // Pins go in as soon as the style is parsed (not after every tile:
        // 'load'), so they show while the base map is still streaming in.
        let added = false
        const init = () => {
          if (!live || added) return
          added = true
          addLayers(m, latest.current.places, latest.current.labels)
          setStyled(true)
        }
        if (m.isStyleLoaded?.()) init()
        else {
          m.once('style.load', init)
          m.once('load', init)
        }
        m.on('click', (event) =>
          onMapClick(
            m,
            event,
            (id) => latest.current.onPin(id),
            () => latest.current.onEmpty(),
            insets,
          ),
        )
        for (const id of [L_PIN, L_ON, L_CLUSTER]) {
          m.on('mouseenter', id, () => {
            const c = m.getCanvas?.()
            if (c) c.style.cursor = 'pointer'
          })
          m.on('mouseleave', id, () => {
            const c = m.getCanvas?.()
            if (c) c.style.cursor = ''
          })
        }
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Data: swap the source (no re-init), then frame the new results once.
  const framedKey = useRef<string | null>(null)
  const sentPlaces = useRef<readonly ResultPlace[] | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!styled || !map) return
    // One setData per new result set (never during movement or re-renders).
    if (sentPlaces.current !== places) {
      sentPlaces.current = places
      const source = map.getSource(SRC) as GeoSource | undefined
      source?.setData(toFeatureCollection(places))
    }
    if (framedKey.current === resultKey || places.length === 0) return
    const first = framedKey.current === null
    const areaChanged = !first && areaOfKey(framedKey.current ?? '') !== areaOfKey(resultKey)
    framedKey.current = resultKey
    const pad = insets() ?? { top: 12, bottom: 12, left: SIDE_PX, right: SIDE_PX }
    const deep =
      first && initialSlug !== null ? places.find((one) => one.slug === initialSlug) : undefined
    if (deep) {
      map.jumpTo({ center: [deep.lon, deep.lat], zoom: 14, padding: pad })
      return
    }
    const bounds = boundsOf(places)
    if (!bounds) return
    if (first) {
      // Whole island first, without animating.
      map.fitBounds(bounds, { padding: pad, maxZoom: 14, duration: 0 })
      return
    }
    // A filter change keeps the view while any new pin is already on screen
    // (it used to re-frame every time: the jump back to the whole island).
    const el = box.current
    const rect = el?.getBoundingClientRect()
    if (!rect) return
    const frame = shouldFrameResults({
      points: places.map((one) => map.project([one.lon, one.lat])),
      view: { width: rect.width, height: rect.height },
      insets: pad,
      areaChanged,
    })
    if (frame) {
      map.fitBounds(bounds, { padding: pad, maxZoom: 14, duration: reducedMotion() ? 0 : FIT_MS })
    }
  }, [styled, places, resultKey, insets, initialSlug])

  // Selected pin: its own one-feature source, drawn above the clusters.
  const sentOn = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!styled || !map) return
    const place = selectedId === null ? null : placeById(selectedId)
    const key = place ? `${place.id}:${place.lon}:${place.lat}:${place.categoryKey}` : ''
    if (sentOn.current === key) return
    sentOn.current = key
    const source = map.getSource(SRC_ON) as GeoSource | undefined
    source?.setData(
      place
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { id: place.id, k: pinKindFor(place.categoryKey) },
                geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
              },
            ],
          }
        : { type: 'FeatureCollection', features: [] },
    )
    // The normal copy hides while its larger selected copy shows.
    map.setFilter?.(L_PIN, pinFilter(place ? place.id : null))
  }, [styled, selectedId, places, placeById])

  // Locate-me dot, and centre on it once.
  useEffect(() => {
    const map = mapRef.current
    if (!styled || !map || !userPos) return
    const source = map.getSource(SRC_ME) as GeoSource | undefined
    source?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [userPos.lon, userPos.lat] },
    })
    const pad = insets()
    if (!pad) return
    const from = map.getZoom()
    const to = Math.max(from, 13)
    moveTo([userPos.lon, userPos.lat], to, moveDuration(400, to - from, reducedMotion()), pad)
  }, [styled, userPos, insets, moveTo])

  return (
    <div className="mx-map mx3-map">
      <div ref={box} className="mx-canvas" data-map-ready={styled || undefined} />
      {failed && <p className="mx-status is-map">{t('c_error')}</p>}
    </div>
  )
}
