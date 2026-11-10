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
import { SHEET_CLOSED, PEEK_PX, sheetReducer, type SheetStop } from '@/lib/map/sheet-state'

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
  const { areas, categories, counts } = props

  const areaKeys = useMemo(() => new Set(areas.map((one) => one.key)), [areas])
  const catKeys = useMemo(() => new Set(categories.map((one) => one.key)), [categories])
  const catByKey = useMemo(() => new Map(categories.map((one) => [one.key, one])), [categories])
  const areaByKey = useMemo(() => new Map(areas.map((one) => [one.key, one])), [areas])

  const [applied, setApplied] = useState<Selection>(props.initial)
  const [facts, setFacts] = useState<FactFilter>(props.initialFacts)
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [paywall, setPaywall] = useState<CategoryItem | null>(null)
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

  // ---- URL ------------------------------------------------------------------

  /** Filters replace the URL (the back button leaves the map, like the reference). */
  const apply = useCallback((next: Selection, nextFacts: FactFilter) => {
    setApplied(next)
    setFacts(nextFacts)
    const url = `${window.location.pathname}${mapQuery(next, nextFacts)}`
    window.history.replaceState(window.history.state, '', url)
  }, [])

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search)
      const next = parseSelection(
        { area: params.get('area'), region: params.get('region'), cat: params.get('cat') },
        areaKeys,
        catKeys,
      )
      setApplied({ area: next.area ?? ALL_AREA, categories: next.categories })
      setFacts(parseFactFilter({ traveler: params.get('traveler'), dur: params.get('dur') }))
      setSheet(null)
      setPaywall(null)
      // Back closes the place sheet before it leaves the page.
      if (sheetOpenRef.current) {
        sheetOpenRef.current = false
        dispatchSheet({ type: 'close' })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [areaKeys, catKeys])

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

  const places = useMemo(
    () => (userPos ? byDistance(results.places, userPos) : results.places),
    [results.places, userPos],
  )
  const placeById = useMemo(() => new Map(places.map((one) => [one.id, one])), [places])
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
    if (!sheetOpenRef.current) {
      window.history.pushState({ ...window.history.state, mxSheet: true }, '', window.location.href)
      sheetOpenRef.current = true
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

  /** A pin was tapped: the sheet opens at peek (or swaps its place). */
  const onPin = useCallback(
    (id: string) => {
      openSheet(id, 'peek')
      mapApi.current?.reveal(id)
    },
    [openSheet],
  )

  /** The carousel settled on a card: select it and ease the map to its pin. */
  const onCard = useCallback((id: string) => {
    setSelectedId((prev) => {
      if (prev !== id) mapApi.current?.glide(id)
      return id
    })
  }, [])

  /** A card was tapped: the sheet opens at half. */
  const onCardOpen = useCallback((id: string) => openSheet(id, 'half'), [openSheet])

  // Keep the place in the visible part of the map as the sheet moves.
  useEffect(() => {
    if (!sheetOpen || sheetState.placeId === null) return
    const rtl = document.documentElement.dir === 'rtl'
    const pad = desktop
      ? { bottom: 40, [rtl ? 'right' : 'left']: PANEL_W + 24 }
      : sheetState.stop === 'peek'
        ? { bottom: PEEK_PX + 24 }
        : sheetState.stop === 'half'
          ? { bottom: Math.round(window.innerHeight * 0.55) + 16 }
          : null
    if (pad) mapApi.current?.focus(sheetState.placeId, pad)
  }, [sheetOpen, sheetState.placeId, sheetState.stop, desktop])

  // ---- Actions ----------------------------------------------------------------

  const toggleCat = (category: CategoryItem) => {
    if (category.locked) {
      setPaywall(category)
      return
    }
    const has = applied.categories.includes(category.key)
    const next = has
      ? applied.categories.filter((one) => one !== category.key)
      : [...applied.categories, category.key]
    apply({ area: applied.area, categories: next }, facts)
  }

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
                const vip = categories.find((one) => one.locked)
                if (vip) setPaywall(vip)
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
                    // After the list closes: the carousel and the map follow.
                    requestAnimationFrame(() => {
                      carouselApi.current?.scrollToId(place.id, 'instant')
                      mapApi.current?.focus(place.id)
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
                return (
                  <li key={cat.key}>
                    <button
                      type="button"
                      role={cat.locked ? undefined : 'checkbox'}
                      aria-checked={cat.locked ? undefined : on}
                      aria-haspopup={cat.locked ? 'dialog' : undefined}
                      className={`mx-cat${on ? ' is-on' : ''}${cat.locked ? ' is-locked' : ''}`}
                      onClick={() => toggleCat(cat)}
                      data-cat={cat.key}
                    >
                      <span className="mx-check" aria-hidden="true">
                        {cat.locked ? (
                          <Icon name="lock" size={16} />
                        ) : on ? (
                          <Icon name="check" size={16} stroke={2.6} />
                        ) : null}
                      </span>
                      <PinGlyph categoryKey={cat.key} size={30} className="mx-caticon" />
                      <span className="mx-catname">{cat.label}</span>
                      <span className={cat.tier === 'vip' ? 'mx-badge is-vip' : 'mx-badge'}>
                        {cat.tier === 'vip' ? t('mx_vip_n', { n }) : t('mx_free_n', { n })}
                      </span>
                      {cat.locked && <span className="sr-only">{t('mx_locked_aria')}</span>}
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
        <Paywall category={paywall} plans={props.plans} onClose={() => setPaywall(null)} />
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
  plans,
  onClose,
}: {
  category: CategoryItem
  plans: PlanItem[]
  onClose: () => void
}) {
  const t = useTranslations()
  const term = (plan: PlanItem) =>
    plan.durationDays === null
      ? t('mx_term_life')
      : plan.durationDays % 30 === 0
        ? t('mx_term_months', { n: plan.durationDays / 30 })
        : t('mx_term_days', { n: plan.durationDays })
  return (
    <Sheet
      title={t('mx_vip_title', { name: category.label })}
      onClose={onClose}
      className="is-paywall"
    >
      <div className="mx-pw">
        <span className="mx-pw-lock" aria-hidden="true">
          <Icon name="lock" size={24} />
        </span>
        <h2 className="mx-h3">{t('mx_vip_title', { name: category.label })}</h2>
        <p className="mx-sub">{t('mx_vip_body')}</p>
        {plans.map((plan, index) => (
          <a
            key={plan.id}
            href={plan.href}
            rel="nofollow"
            className={index === 0 ? 'mx-cta is-orange' : 'mx-cta is-ghost'}
          >
            {plan.name} — <Money minor={plan.priceMinor} currency={plan.currency} /> {term(plan)}
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

  /** Scroll to card `i`. `quiet`: its settle is ours, so it must not echo back. */
  const scrollToIndex = useCallback((i: number, behavior: ScrollBehavior, quiet: boolean) => {
    const el = box.current
    if (!el) return
    const left = i * (latest.current.cardW + GAP) * (rtl() ? -1 : 1)
    if (Math.abs(el.scrollLeft - left) < 2) return
    driving.current = quiet ? (latest.current.places[i]?.id ?? null) : null
    el.scrollTo({ left, behavior })
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      scrollToId(id, behavior = 'smooth') {
        const i = latest.current.places.findIndex((one) => one.id === id)
        if (i < 0) return
        setCenter(i)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-centre the window on new data
    setCenter(index)
    scrollToIndex(index, 'instant', true)
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
      if (driving.current !== null) {
        const target = driving.current
        driving.current = null
        if (target === place.id) return
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

type Pad = Partial<Record<'top' | 'bottom' | 'left' | 'right', number>>

interface ResultsMapHandle {
  /** Ease the map so the pin sits in the open area (above the cards, or beside the sheet). */
  focus(id: string, pad?: Pad): void
  /** Card swipe (Tiqets): ease the pin to the centre, keeping the zoom. */
  glide(id: string): void
  /** Only move when the pin is hidden under the chrome. */
  reveal(id: string): void
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
  padding: () => { top: number; bottom: number; left: number; right: number },
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
  let best: Feature | null = null
  let bestD = Infinity
  for (const hit of hits) {
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
      .then((zoom) =>
        map.easeTo({
          center: coords,
          // Just past the split zoom, so the group opens up at once.
          zoom: Math.min(REAL_MAX_ZOOM, Math.max(map.getZoom() + 1, zoom + 0.5)),
          padding: padding(),
          duration: 450,
        }),
      )
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
  const latest = useRef({ places, selectedId, onPin, onEmpty, labels })
  useLayoutEffect(() => {
    latest.current = { places, selectedId, onPin, onEmpty, labels }
  })

  /** Room the floating chrome takes (header + chips on top, cards at the bottom). */
  const padding = useCallback(() => {
    const el = box.current
    const main = el?.closest('.mx3')
    const head = main?.querySelector('.mx3-head')?.getBoundingClientRect()
    const bottom = main?.querySelector('.mx3-bottom')?.getBoundingClientRect()
    const rect = el?.getBoundingClientRect()
    if (!rect) return { top: 120, bottom: 200, left: 40, right: 40 }
    const top = head ? Math.max(0, head.bottom - rect.top) + 24 : 24
    const bot = bottom ? Math.max(0, rect.bottom - bottom.top) + 36 : 36
    // Narrow sides: the island fills the phone's width (Tiqets).
    return { top, bottom: Math.min(bot, rect.height * 0.55), left: 16, right: 16 }
  }, [])

  const placeById = useCallback(
    (id: string) => latest.current.places.find((one) => one.id === id) ?? null,
    [],
  )

  useImperativeHandle(
    ref,
    () => ({
      focus(id, pad) {
        const map = mapRef.current
        const place = placeById(id)
        if (!map || !place) return
        map.easeTo({
          center: [place.lon, place.lat],
          zoom: Math.max(map.getZoom(), 11),
          padding: pad ? { ...padding(), left: 40, right: 40, ...pad } : padding(),
          duration: 450,
        })
      },
      glide(id) {
        const map = mapRef.current
        const place = placeById(id)
        if (!map || !place) return
        map.easeTo({ center: [place.lon, place.lat], padding: padding(), duration: 450 })
      },
      reveal(id) {
        const map = mapRef.current
        const place = placeById(id)
        const el = box.current
        if (!map || !place || !el) return
        const p = map.project([place.lon, place.lat])
        const pad = padding()
        const { width, height } = el.getBoundingClientRect()
        if (p.x < 24 || p.x > width - 24 || p.y < pad.top || p.y > height - pad.bottom) {
          map.easeTo({ center: [place.lon, place.lat], padding: pad, duration: 450 })
        }
      },
      instance: () => mapRef.current,
    }),
    [padding, placeById],
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
            padding,
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
    framedKey.current = resultKey
    const deep =
      first && initialSlug !== null ? places.find((one) => one.slug === initialSlug) : undefined
    if (deep) {
      map.jumpTo({ center: [deep.lon, deep.lat], zoom: 14, padding: padding() })
      return
    }
    const bounds = boundsOf(places)
    if (bounds) {
      // Whole island first; a filter change eases to its own pins.
      map.fitBounds(bounds, { padding: padding(), maxZoom: 14, duration: first ? 0 : FIT_MS })
    }
  }, [styled, places, resultKey, padding, initialSlug])

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
    map.flyTo({
      center: [userPos.lon, userPos.lat],
      zoom: Math.max(map.getZoom(), 13),
      padding: padding(),
      duration: 700,
    })
  }, [styled, userPos, padding])

  return (
    <div className="mx-map mx3-map">
      <div ref={box} className="mx-canvas" data-map-ready={styled || undefined} />
      {failed && <p className="mx-status is-map">{t('c_error')}</p>}
    </div>
  )
}
