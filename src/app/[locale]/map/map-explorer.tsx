'use client'

/**
 * The public map, v2 (owner, Nov 2026 — approved concept «تصور خريطة Bali
 * Trips الجديدة»). Never the whole island at once:
 *
 *   1. «وين بتكون في بالي؟» — all of Bali, a direction or one area
 *   2. «وش تبغى تشوف؟»   — one to three categories (VIP ones locked)
 *   3. the map            — only those places, changeable in place
 *
 * Phones walk the three steps; desktops (≥1024px) get one screen: filters,
 * a big map and the selected card with a short list. The selection lives in
 * the URL (`?area=&cat=`), so the back button and deep links work, and is
 * remembered in localStorage for the next visit.
 *
 * This component receives counts and the category look only. Places arrive
 * from `/api/map/places` per selection, already redacted on the server.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'

import { Icon, type IconName } from '@/components/ui'
import { Link } from '@/i18n/routing'
import {
  ALL_AREA,
  boundsOf,
  categoryCounts,
  clusterPoints,
  directionsUrl,
  distanceMeters,
  parseSelection,
  selectionQuery,
  STORAGE_KEY,
  stepOf,
  toggleCategory,
  type Cluster,
  type CountRow,
  type ResultPlace,
  type Selection,
} from '@/lib/map/explore'

import { MapWatermark, protectionHandlers } from './map-protect'
import { attributionsFor, type MapSettings } from './map-style'
import { loadMapLibre, type MapLike } from './maplibre-loader'
import { FavoriteHeart } from './place-actions'
import { createRealMap } from './real-map'

export interface AreaItem {
  key: string
  label: string
  parentKey: string | null
  count: number
  top: string[]
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
  durationDays: number | null
  href: string
}

interface Props {
  locale: string
  areas: AreaItem[]
  counts: CountRow[]
  categories: CategoryItem[]
  initial: Selection
  initialPlace: string | null
  plans: PlanItem[]
  unlocked: boolean
  viewerLabel: string | null
  settings: MapSettings
}

const DESK_QUERY = '(min-width: 1024px)'

function subscribeDesk(callback: () => void): () => void {
  const mq = window.matchMedia(DESK_QUERY)
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}

function useIsDesk(): boolean {
  return useSyncExternalStore(
    subscribeDesk,
    () => window.matchMedia(DESK_QUERY).matches,
    () => false,
  )
}

function readStored(): Selection | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as { area?: unknown; categories?: unknown }
    if (typeof value.area !== 'string' || !Array.isArray(value.categories)) return null
    return {
      area: value.area,
      categories: value.categories.filter((one): one is string => typeof one === 'string'),
    }
  } catch {
    return null
  }
}

function writeStored(selection: Selection): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection))
  } catch {
    // private mode / blocked storage: remembering is a convenience only
  }
}

interface Results {
  key: string
  places: ResultPlace[]
  lockedCount: number
  loading: boolean
  error: boolean
}

export function MapExplorer(props: Props) {
  const t = useTranslations()
  const desk = useIsDesk()
  const { areas, categories, counts } = props

  const areaKeys = useMemo(() => new Set(areas.map((one) => one.key)), [areas])
  const catKeys = useMemo(() => new Set(categories.map((one) => one.key)), [categories])
  const catByKey = useMemo(() => new Map(categories.map((one) => [one.key, one])), [categories])
  const areaByKey = useMemo(() => new Map(areas.map((one) => [one.key, one])), [areas])

  // The applied selection (what the URL says) and the phone's step drafts.
  const [applied, setApplied] = useState<Selection>(props.initial)
  const [draftArea, setDraftArea] = useState<string | null>(props.initial.area)
  const [draftCats, setDraftCats] = useState<string[]>(props.initial.categories)
  const [full, setFull] = useState(false)
  const [paywall, setPaywall] = useState<CategoryItem | null>(null)
  const [sheet, setSheet] = useState(false)
  const [view, setView] = useState<'map' | 'list'>('map')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [userPos, setUserPos] = useState<{ lat: number; lon: number } | null>(null)
  const [locateError, setLocateError] = useState(false)

  const step = stepOf(applied)

  // Counts for an area, restricted to the map's categories.
  const countsFor = useCallback((area: string) => categoryCounts(counts, area), [counts])

  /** Keeps only categories that have places in the area. */
  const keepAvailable = useCallback(
    (area: string, cats: readonly string[]) => {
      const here = countsFor(area)
      return cats.filter((key) => (here.get(key) ?? 0) > 0 && catKeys.has(key))
    },
    [countsFor, catKeys],
  )

  // ---- URL + history -------------------------------------------------------

  const go = useCallback((next: Selection, mode: 'push' | 'replace' = 'push') => {
    setApplied(next)
    setDraftArea(next.area)
    setDraftCats(next.categories)
    setFull(false)
    const url = `${window.location.pathname}${selectionQuery(next)}`
    if (mode === 'push') window.history.pushState({ mx: true }, '', url)
    else window.history.replaceState({ mx: true }, '', url)
    if (next.area !== null && next.categories.length > 0) writeStored(next)
  }, [])

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search)
      const next = parseSelection(
        { area: params.get('area'), region: params.get('region'), cat: params.get('cat') },
        areaKeys,
        catKeys,
      )
      setApplied(next)
      setDraftArea(next.area)
      setDraftCats(next.categories)
      setSheet(false)
      setPaywall(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [areaKeys, catKeys])

  // First visit with no selection in the URL: preselect the last one.
  useEffect(() => {
    if (props.initial.area !== null) return
    const stored = readStored()
    if (stored === null) return
    if (stored.area !== ALL_AREA && !areaKeys.has(stored.area ?? '')) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after mount
    setDraftArea(stored.area)
    setDraftCats(keepAvailable(stored.area ?? ALL_AREA, stored.categories))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Results -------------------------------------------------------------

  const resultKey =
    applied.area !== null && applied.categories.length > 0
      ? `${applied.area}|${applied.categories.join(',')}`
      : ''
  const [results, setResults] = useState<Results>({
    key: '',
    places: [],
    lockedCount: 0,
    loading: false,
    error: false,
  })

  useEffect(() => {
    if (resultKey === '') return
    const controller = new AbortController()
    const [area, cat] = resultKey.split('|')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before the fetch
    setResults({ key: resultKey, places: [], lockedCount: 0, loading: true, error: false })
    void (async () => {
      try {
        const all: ResultPlace[] = []
        let page: number | null = 1
        let lockedCount = 0
        // Paged (120 per page); five pages is far beyond any one area.
        while (page !== null && page <= 5) {
          const params = new URLSearchParams({
            area: area ?? ALL_AREA,
            cat: cat ?? '',
            page: String(page),
            locale: props.locale,
          })
          const response = await fetch(`/api/map/places?${params.toString()}`, {
            signal: controller.signal,
            credentials: 'same-origin',
          })
          if (!response.ok) throw new Error(String(response.status))
          const body = (await response.json()) as {
            places: ResultPlace[]
            lockedCount: number
            nextPage: number | null
          }
          all.push(...body.places)
          lockedCount = body.lockedCount
          page = body.nextPage
          setResults({
            key: resultKey,
            places: [...all],
            lockedCount,
            loading: page !== null,
            error: false,
          })
        }
      } catch {
        if (!controller.signal.aborted) {
          setResults((prev) => ({ ...prev, loading: false, error: true }))
        }
      }
    })()
    return () => controller.abort()
  }, [resultKey, props.locale])

  const places = results.key === resultKey ? results.places : []
  const placeById = useMemo(() => new Map(places.map((one) => [one.id, one])), [places])

  // Deep link `?place=` selects that place once it arrives.
  const wantedSlug = useRef(props.initialPlace)
  useEffect(() => {
    if (wantedSlug.current === null) return
    const hit = places.find((one) => one.slug === wantedSlug.current)
    if (hit) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the place arrives by fetch
      setSelectedId(hit.id)
      wantedSlug.current = null
    }
  }, [places])

  // With nothing chosen (or a choice no longer in the results) the first
  // place's card shows under the map.
  const selected = selectedId === null ? null : (placeById.get(selectedId) ?? null)
  const cardPlace = selected ?? places[0] ?? null

  // ---- Actions ---------------------------------------------------------------

  const tapCategory = (category: CategoryItem, mode: 'draft' | 'live') => {
    if (category.locked) {
      setPaywall(category)
      return
    }
    const current = mode === 'draft' ? draftCats : applied.categories
    const { next, full: isFull } = toggleCategory(current, category.key)
    setFull(isFull)
    if (isFull) return
    if (mode === 'draft') setDraftCats(next)
    else go({ area: applied.area ?? ALL_AREA, categories: next })
  }

  const chooseAreaLive = (key: string) => {
    go({ area: key, categories: keepAvailable(key, applied.categories) })
  }

  const locate = () => {
    setLocateError(false)
    if (!('geolocation' in navigator)) {
      setLocateError(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => setLocateError(true),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  const areaLabel = (key: string | null) =>
    key === null || key === ALL_AREA ? t('mx_all') : (areaByKey.get(key)?.label ?? key)

  const protectedProps = protectionHandlers(props.viewerLabel !== null)

  // ---- Render ----------------------------------------------------------------

  const areaPicker = (
    <AreaPicker
      areas={areas}
      value={desk ? applied.area : draftArea}
      categories={catByKey}
      compact={desk}
      onPick={(key) => (desk ? chooseAreaLive(key) : setDraftArea(key))}
    />
  )

  const categoryList = (mode: 'draft' | 'live', area: string) => (
    <CategoryList
      categories={categories}
      counts={countsFor(area)}
      value={mode === 'draft' ? draftCats : applied.categories}
      full={full}
      onTap={(category) => tapCategory(category, mode)}
    />
  )

  const paywallSheet =
    paywall === null ? null : (
      <Paywall category={paywall} plans={props.plans} onClose={() => setPaywall(null)} />
    )

  // Phone, steps 1 and 2.
  if (!desk && step !== 3) {
    const showCats = step === 2
    const area = draftArea ?? ALL_AREA
    return (
      <main className="mx mx-steps" data-step={showCats ? 2 : 1}>
        {!showCats ? (
          <section className="mx-step" aria-labelledby="mx-h">
            <div className="mx-kick">
              <span className="mx-progress" aria-hidden="true">
                <i className="on" />
                <i className="" />
                <i />
              </span>
              <span className="mx-kicker">{t('mx_step', { n: 1 })}</span>
            </div>
            <h1 id="mx-h" className="mx-h1">
              {t('mx_where_t')}
            </h1>
            <p className="mx-sub">{t('mx_where_s')}</p>
            {areaPicker}
            <div className="mx-foot">
              <button
                type="button"
                className="mx-cta"
                disabled={draftArea === null}
                onClick={() => {
                  const keep = keepAvailable(area, draftCats)
                  go({ area, categories: [] })
                  setDraftCats(keep)
                }}
              >
                {t('mx_next_cats')}
              </button>
            </div>
          </section>
        ) : (
          <section className="mx-step" aria-labelledby="mx-h">
            <button
              type="button"
              className="mx-back"
              onClick={() => {
                const back = applied.area
                go({ area: null, categories: [] })
                setDraftArea(back)
              }}
            >
              <Icon name="chevron" size={18} className="flip" />
              <span>
                {areaLabel(applied.area)} — {t('mx_change_area')}
              </span>
            </button>
            <div className="mx-kick">
              <span className="mx-progress" aria-hidden="true">
                <i className="on" />
                <i className="on" />
                <i />
              </span>
              <span className="mx-kicker">{t('mx_step', { n: 2 })}</span>
            </div>
            <h1 id="mx-h" className="mx-h1">
              {t('mx_what_t')}
            </h1>
            <p className="mx-sub">{t('mx_what_s')}</p>
            {categoryList('draft', applied.area ?? ALL_AREA)}
            <div className="mx-foot">
              <button
                type="button"
                className="mx-cta"
                disabled={draftCats.length === 0}
                onClick={() => go({ area: applied.area ?? ALL_AREA, categories: draftCats })}
              >
                {draftCats.length === 0 ? t('mx_pick_one') : t('mx_show_map')}
              </button>
            </div>
          </section>
        )}
        {paywallSheet}
      </main>
    )
  }

  const total = places.length
  const summary = `${areaLabel(applied.area)}`
  const catNames = applied.categories.map((key) => catByKey.get(key)?.label ?? key).join('، ')

  const mapBlock = (
    <ResultsMap
      key="map"
      locale={props.locale}
      settings={props.settings}
      places={places}
      categories={catByKey}
      selectedId={cardPlace?.id ?? null}
      userPos={userPos}
      desk={desk}
      onSelect={setSelectedId}
      hidden={!desk && view === 'list'}
    />
  )

  const chips = (
    <div className="mx-chips" role="list">
      {applied.categories.map((key) => {
        const cat = catByKey.get(key)
        if (!cat) return null
        return (
          <span role="listitem" key={key} className="mx-chip">
            <span className="mx-dot" style={{ background: cat.color }} aria-hidden="true" />
            {cat.label}
            {!desk && (
              <button
                type="button"
                className="mx-chip-x"
                aria-label={t('mx_remove', { name: cat.label })}
                onClick={() =>
                  applied.categories.length === 1
                    ? go({ area: applied.area, categories: [] })
                    : go({
                        area: applied.area,
                        categories: applied.categories.filter((one) => one !== key),
                      })
                }
              >
                <Icon name="cross" size={14} />
              </button>
            )}
          </span>
        )
      })}
    </div>
  )

  const status =
    results.loading && total === 0 ? (
      <p className="mx-status" role="status">
        {t('c_loading')}
      </p>
    ) : results.error ? (
      <p className="mx-status" role="alert">
        {t('c_error')}
      </p>
    ) : resultKey !== '' && total === 0 ? (
      <p className="mx-status" role="status">
        {t('mx_empty')}
      </p>
    ) : null

  const card =
    cardPlace === null ? null : (
      <PlaceCard
        key={cardPlace.id}
        place={cardPlace}
        category={catByKey.get(cardPlace.categoryKey)}
        userPos={userPos}
        onSwipe={(dir) => {
          const index = places.findIndex((one) => one.id === cardPlace.id)
          const next = places[(index + dir + places.length) % places.length]
          if (next) setSelectedId(next.id)
        }}
        swipeable={!desk && places.length > 1}
      />
    )

  const list = (
    <ul className="mx-list">
      {places.map((place) => {
        const cat = catByKey.get(place.categoryKey)
        return (
          <li key={place.id}>
            <button
              type="button"
              className={place.id === cardPlace?.id ? 'mx-row is-on' : 'mx-row'}
              aria-current={place.id === cardPlace?.id ? 'true' : undefined}
              onClick={() => {
                setSelectedId(place.id)
                setView('map')
              }}
            >
              <Thumb src={place.images[0] ?? null} icon={cat?.icon ?? 'pin'} color={cat?.color} />
              <span className="mx-row-text">
                <strong>{place.name}</strong>
                <small>
                  {cat?.label}
                  {userPos ? ` · ${formatDistance(t, distanceMeters(userPos, place))}` : ''}
                </small>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )

  // Desktop: one screen.
  if (desk) {
    return (
      <main className="mx mx-desk" {...protectedProps}>
        <h1 className="sr-only">{t('mp_title')}</h1>
        <aside className="mx-side" aria-label={t('mx_change_search')}>
          <h2 className="mx-h2">{t('mx_where_t')}</h2>
          {areaPicker}
          <h2 className="mx-h2">
            {t('mx_what_t')} <small>{t('mx_upto3')}</small>
          </h2>
          {categoryList('live', applied.area ?? ALL_AREA)}
          {!props.unlocked && props.plans[0] && (
            <div className="mx-upsell">
              <strong>{t('mx_upsell_t')}</strong>
              <p>{t('mx_upsell_s')}</p>
              <a className="mx-upsell-cta" href={props.plans[0].href} rel="nofollow">
                {t('mx_upsell_cta', { price: props.plans[0].price })}
              </a>
            </div>
          )}
        </aside>
        <section className="mx-stage">
          {mapBlock}
          {chips}
          {applied.categories.length === 0 && <p className="mx-hintbox">{t('mx_desk_pick')}</p>}
          <MapTools
            view={null}
            onView={() => undefined}
            onLocate={locate}
            locateError={locateError}
          />
          {props.viewerLabel !== null && <MapWatermark label={props.viewerLabel} />}
          <Attribution settings={props.settings} />
        </section>
        <section className="mx-col" aria-live="polite">
          {status}
          {card}
          {places.length > 1 && (
            <ul className="mx-list is-short">
              {places
                .filter((one) => one.id !== cardPlace?.id)
                .map((place) => {
                  const cat = catByKey.get(place.categoryKey)
                  return (
                    <li key={place.id}>
                      <button
                        type="button"
                        className="mx-row"
                        onClick={() => setSelectedId(place.id)}
                      >
                        <Thumb
                          src={place.images[0] ?? null}
                          icon={cat?.icon ?? 'pin'}
                          color={cat?.color}
                        />
                        <span className="mx-row-text">
                          <strong>{place.name}</strong>
                          <small>
                            {cat?.label}
                            {userPos
                              ? ` · ${formatDistance(t, distanceMeters(userPos, place))}`
                              : ''}
                          </small>
                        </span>
                      </button>
                    </li>
                  )
                })}
            </ul>
          )}
        </section>
        {paywallSheet}
      </main>
    )
  }

  // Phone, step 3: the results map.
  return (
    <main className="mx mx-results" {...protectedProps}>
      <h1 className="sr-only">{t('mp_title')}</h1>
      <div className="mx-top">
        <button
          type="button"
          className="mx-pill"
          aria-haspopup="dialog"
          aria-label={`${t('mx_change_search')}: ${summary}, ${catNames}, ${t('mx_count', { n: total })}`}
          onClick={() => {
            setDraftArea(applied.area)
            setDraftCats(applied.categories)
            setFull(false)
            setSheet(true)
          }}
        >
          <Icon name="search" size={18} />
          <span className="mx-pill-text">
            <strong>{summary}</strong>
            <small>
              {catNames} · {t('mx_count', { n: total })}
            </small>
          </span>
          <span className="mx-pill-change">{t('mx_change')}</span>
        </button>
        {chips}
      </div>
      {mapBlock}
      {view === 'list' && <div className="mx-listview">{list}</div>}
      <MapTools view={view} onView={setView} onLocate={locate} locateError={locateError} />
      {props.viewerLabel !== null && <MapWatermark label={props.viewerLabel} />}
      <div className="mx-bottom" aria-live="polite">
        {status}
        {view === 'map' && card}
      </div>
      {sheet && (
        <Sheet title={t('mx_change_search')} onClose={() => setSheet(false)}>
          <h2 className="mx-h3">{t('mx_where_t')}</h2>
          <AreaPicker
            areas={areas}
            value={draftArea}
            categories={catByKey}
            compact
            onPick={(key) => {
              setDraftArea(key)
              setDraftCats((cats) => keepAvailable(key, cats))
            }}
          />
          <h2 className="mx-h3">
            {t('mx_what_t')} <small>{t('mx_upto3')}</small>
          </h2>
          {categoryList('draft', draftArea ?? ALL_AREA)}
          <div className="mx-foot is-sheet">
            <button
              type="button"
              className="mx-cta"
              disabled={draftCats.length === 0}
              onClick={() => {
                setSheet(false)
                go({ area: draftArea ?? ALL_AREA, categories: draftCats })
              }}
            >
              {draftCats.length === 0 ? t('mx_pick_one') : t('mx_apply')}
            </button>
          </div>
        </Sheet>
      )}
      {paywallSheet}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

type T = ReturnType<typeof useTranslations>

function formatDistance(t: T, metres: number): string {
  if (metres < 1000) return t('mx_m', { n: Math.max(10, Math.round(metres / 10) * 10) })
  return t('mx_km', { n: Math.round(metres / 100) / 10 })
}

function AreaPicker({
  areas,
  value,
  categories,
  compact,
  onPick,
}: {
  areas: AreaItem[]
  value: string | null
  categories: Map<string, CategoryItem>
  compact: boolean
  onPick: (key: string) => void
}) {
  const t = useTranslations()
  const directions = areas.filter((one) => one.parentKey === null)
  const current = value === null ? null : areas.find((one) => one.key === value)
  // The direction whose areas are listed: the chosen one, or the chosen area's.
  const openDirection =
    current === undefined || current === null
      ? null
      : current.parentKey === null
        ? current.key
        : current.parentKey
  const subAreas = areas.filter(
    (one) => one.parentKey !== null && (openDirection === null || one.parentKey === openDirection),
  )
  const dirLabel = directions.find((one) => one.key === openDirection)?.label ?? null

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

  if (compact) {
    return (
      <div className="mx-achips">
        {chip(ALL_AREA, t('mx_all'))}
        {directions.map((one) => chip(one.key, one.label))}
        {subAreas.map((one) => chip(one.key, one.label))}
      </div>
    )
  }

  return (
    <>
      <div className="mx-achips is-grid">
        {chip(ALL_AREA, t('mx_all'))}
        {directions.map((one) => chip(one.key, one.label))}
      </div>
      {subAreas.length > 0 && (
        <>
          <p className="mx-label">
            {dirLabel === null ? t('mx_or_area_all') : t('mx_or_area', { region: dirLabel })}
          </p>
          <div className="mx-acards">
            {subAreas.map((one) => (
              <button
                key={one.key}
                type="button"
                className={value === one.key ? 'mx-acard is-on' : 'mx-acard'}
                aria-pressed={value === one.key}
                onClick={() => onPick(one.key)}
              >
                <strong>{one.label}</strong>
                <small>
                  {one.top
                    .map((key) => categories.get(key)?.label)
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function CategoryList({
  categories,
  counts,
  value,
  full,
  onTap,
}: {
  categories: CategoryItem[]
  counts: Map<string, number>
  value: readonly string[]
  full: boolean
  onTap: (category: CategoryItem) => void
}) {
  const t = useTranslations()
  const shown = categories.filter((one) => (counts.get(one.key) ?? 0) > 0)
  return (
    <div className="mx-cats">
      <ul className="mx-catlist">
        {shown.map((cat) => {
          const on = value.includes(cat.key)
          const n = counts.get(cat.key) ?? 0
          return (
            <li key={cat.key}>
              <button
                type="button"
                role={cat.locked ? undefined : 'checkbox'}
                aria-checked={cat.locked ? undefined : on}
                aria-haspopup={cat.locked ? 'dialog' : undefined}
                className={`mx-cat${on ? ' is-on' : ''}${cat.locked ? ' is-locked' : ''}`}
                onClick={() => onTap(cat)}
                data-cat={cat.key}
              >
                <span className="mx-check" aria-hidden="true">
                  {cat.locked ? (
                    <Icon name="lock" size={16} />
                  ) : on ? (
                    <Icon name="check" size={16} stroke={2.6} />
                  ) : null}
                </span>
                <span
                  className="mx-caticon"
                  style={{ '--c': cat.color } as CSSProperties}
                  aria-hidden="true"
                >
                  <Icon name={cat.icon} size={18} />
                </span>
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
      {full && (
        <p className="mx-full" role="alert">
          {t('mx_max_hint')}
        </p>
      )}
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
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [onClose])
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
            {plan.name} — {plan.price} {term(plan)}
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

function Thumb({ src, icon, color }: { src: string | null; icon: IconName; color?: string }) {
  const [broken, setBroken] = useState(false)
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="mx-thumb"
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span className="mx-thumb is-ph" style={{ '--c': color ?? '#2E5E4E' } as CSSProperties}>
      <Icon name={icon} size={20} />
    </span>
  )
}

function PlaceCard({
  place,
  category,
  userPos,
  swipeable,
  onSwipe,
}: {
  place: ResultPlace
  category: CategoryItem | undefined
  userPos: { lat: number; lon: number } | null
  swipeable: boolean
  onSwipe: (dir: 1 | -1) => void
}) {
  const t = useTranslations()
  const start = useRef<{ x: number; y: number } | null>(null)
  const photos = place.images.slice(0, 3)
  const rtl = typeof document !== 'undefined' && document.dir === 'rtl'
  return (
    <article
      className="mx-card"
      aria-label={place.name}
      onPointerDown={(event) => {
        if (swipeable) start.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerUp={(event) => {
        const from = start.current
        start.current = null
        if (!from) return
        const dx = event.clientX - from.x
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(event.clientY - from.y)) return
        // Swipe toward the reading direction's end = next place.
        const forward = rtl ? dx > 0 : dx < 0
        onSwipe(forward ? 1 : -1)
      }}
    >
      <div className={`mx-photos n${Math.max(1, photos.length)}`}>
        {photos.length === 0 ? (
          <span className="mx-ph" style={{ '--c': category?.color ?? '#2E5E4E' } as CSSProperties}>
            <Icon name={category?.icon ?? 'pin'} size={28} />
            <small>{t('mx_no_photo')}</small>
          </span>
        ) : (
          photos.map((src, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={index === 0 ? place.name : ''}
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
              onError={(event) => {
                event.currentTarget.style.visibility = 'hidden'
              }}
            />
          ))
        )}
        {place.canFavorite && (
          <span className="mx-fav">
            <FavoriteHeart placeId={place.id} active />
          </span>
        )}
      </div>
      <div className="mx-card-body">
        <h3 className="mx-card-name">{place.name}</h3>
        <p className="mx-card-meta">
          {category && (
            <span className="mx-tag" style={{ '--c': category.color } as CSSProperties}>
              {category.label}
            </span>
          )}
          {place.rating !== null && (
            <span>
              <span aria-hidden="true">★</span> {place.rating.toFixed(1)}
            </span>
          )}
          {userPos && (
            <span>{t('mx_away', { d: formatDistance(t, distanceMeters(userPos, place)) })}</span>
          )}
        </p>
        <div className="mx-card-actions">
          <a
            className="mx-btn is-primary"
            href={directionsUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="route" size={18} />
            {t('mx_directions')}
          </a>
          <Link className="mx-btn" href={`/places/${place.slug}`}>
            {t('mx_details')}
          </Link>
        </div>
        {swipeable && (
          <div className="mx-swipe-nav">
            <button
              type="button"
              className="mx-x"
              aria-label={t('c_prev')}
              onClick={() => onSwipe(-1)}
            >
              <Icon name="chevron" size={18} className="flip" />
            </button>
            <button
              type="button"
              className="mx-x"
              aria-label={t('c_next')}
              onClick={() => onSwipe(1)}
            >
              <Icon name="chevronr" size={18} className="flip" />
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

function MapTools({
  view,
  onView,
  onLocate,
  locateError,
}: {
  view: 'map' | 'list' | null
  onView: (view: 'map' | 'list') => void
  onLocate: () => void
  locateError: boolean
}) {
  const t = useTranslations()
  return (
    <div className={view === 'list' ? 'mx-tools is-list' : 'mx-tools'}>
      {view !== null && (
        <button
          type="button"
          className="mx-tool is-wide"
          onClick={() => onView(view === 'map' ? 'list' : 'map')}
        >
          <Icon name={view === 'map' ? 'list' : 'map'} size={18} />
          {view === 'map' ? t('mx_list') : t('mx_map')}
        </button>
      )}
      {view !== 'list' && (
        <button type="button" className="mx-tool" aria-label={t('mx_locate')} onClick={onLocate}>
          <Icon name="locate" size={20} />
        </button>
      )}
      {locateError && (
        <p className="mx-toast" role="alert">
          {t('mx_locate_err')}
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
// The map itself (lazy: MapLibre is fetched only when this mounts)
// ---------------------------------------------------------------------------

interface PinPos extends Cluster {
  key: string
}

function ResultsMap({
  locale,
  settings,
  places,
  categories,
  selectedId,
  userPos,
  desk,
  hidden,
  onSelect,
}: {
  locale: string
  settings: MapSettings
  places: ResultPlace[]
  categories: Map<string, CategoryItem>
  selectedId: string | null
  userPos: { lat: number; lon: number } | null
  desk: boolean
  hidden: boolean
  onSelect: (id: string) => void
}) {
  const t = useTranslations()
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLike | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [loads, setLoads] = useState(0)
  const [pins, setPins] = useState<PinPos[]>([])
  const [me, setMe] = useState<{ x: number; y: number } | null>(null)
  const frame = useRef(0)

  const latest = useRef({ places, selectedId, userPos })
  useLayoutEffect(() => {
    latest.current = { places, selectedId, userPos }
  })

  const layout = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const { places: list, selectedId: sel, userPos: pos } = latest.current
    const points = list.map((one) => {
      const p = map.project([one.lon, one.lat])
      return { id: one.id, x: p.x, y: p.y }
    })
    // Only truly overlapping pins fold together, and never when zoomed in.
    const radius = map.getZoom() >= 15 ? 0 : 30
    const clusters =
      radius === 0
        ? points.map((p) => ({ ids: [p.id], x: p.x, y: p.y }))
        : clusterPoints(points, radius, sel)
    setPins(clusters.map((c) => ({ ...c, key: c.ids.join('-') })))
    setMe(pos ? map.project([pos.lon, pos.lat]) : null)
    box.current?.setAttribute('data-zoom', map.getZoom().toFixed(2))
  }, [])

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(layout)
  }, [layout])

  useEffect(() => {
    let live = true
    let map: MapLike | null = null
    void loadMapLibre()
      .then((engine) => {
        if (!live || !box.current) return
        map = createRealMap(engine, box.current, settings, { locale, flat: true, light: true })
        mapRef.current = map
        map.on('move', schedule)
        map.on('resize', schedule)
        // Camera moves need no loaded style: frame the results right away.
        map.resize()
        setReady(true)
        // …and once more when the style is in (the canvas has its final size).
        map.once('load', () => {
          if (live) setLoads((n) => n + 1)
        })
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
      cancelAnimationFrame(frame.current)
      map?.remove()
      mapRef.current = null
    }
  }, [locale, settings, schedule])

  // Frame the results whenever they change.
  const placesKey = places.map((one) => one.id).join(',')
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const bounds = boundsOf(places)
    if (bounds) {
      map.resize()
      map.fitBounds(bounds, {
        padding: desk
          ? { top: 90, bottom: 60, left: 60, right: 60 }
          : { top: 150, bottom: 330, left: 40, right: 40 },
        maxZoom: 15,
        duration: 600,
      })
    }
    schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loads, placesKey, desk])

  useEffect(() => {
    schedule()
  }, [selectedId, userPos, schedule])

  // Locate-me: centre on the visitor once.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !userPos) return
    map.flyTo({
      center: [userPos.lon, userPos.lat],
      zoom: Math.max(map.getZoom(), 13),
      duration: 700,
    })
  }, [ready, userPos])

  // Keep the selected pin on screen.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || selectedId === null) return
    const place = places.find((one) => one.id === selectedId)
    if (!place) return
    const p = map.project([place.lon, place.lat])
    const canvas = box.current
    if (!canvas) return
    const { width, height } = canvas.getBoundingClientRect()
    const bottomPad = desk ? 40 : 320
    if (p.x < 30 || p.x > width - 30 || p.y < 140 || p.y > height - bottomPad) {
      map.easeTo({ center: [place.lon, place.lat], duration: 500 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedId])

  useEffect(() => {
    if (!hidden) mapRef.current?.resize()
  }, [hidden])

  const byId = new Map(places.map((one) => [one.id, one]))

  return (
    <div
      className="mx-map"
      aria-hidden={hidden || undefined}
      style={hidden ? { visibility: 'hidden' } : undefined}
    >
      <div ref={box} className="mx-canvas" />
      {failed && <p className="mx-status is-map">{t('c_error')}</p>}
      <div className="mx-pins">
        {me && (
          <span
            className="mx-me"
            style={{ transform: `translate(${me.x}px, ${me.y}px)` }}
            aria-hidden="true"
          />
        )}
        {pins.map((pin) => {
          if (pin.ids.length > 1) {
            return (
              <button
                key={pin.key}
                type="button"
                className="mx-cluster"
                style={{ transform: `translate(${pin.x}px, ${pin.y}px)` }}
                aria-label={t('mx_cluster', { n: pin.ids.length })}
                onClick={() => {
                  const bounds = boundsOf(
                    pin.ids.map((id) => byId.get(id)).filter((p): p is ResultPlace => !!p),
                  )
                  if (bounds)
                    mapRef.current?.fitBounds(bounds, {
                      padding: { top: 160, bottom: 340, left: 60, right: 60 },
                      maxZoom: 17,
                      duration: 500,
                    })
                }}
              >
                {pin.ids.length}
              </button>
            )
          }
          const place = byId.get(pin.ids[0] ?? '')
          if (!place) return null
          const cat = categories.get(place.categoryKey)
          const on = place.id === selectedId
          return (
            <button
              key={pin.key}
              type="button"
              className={on ? 'mx-pin is-on' : 'mx-pin'}
              style={
                {
                  transform: `translate(${pin.x}px, ${pin.y}px)`,
                  '--c': cat?.color ?? '#2E5E4E',
                  zIndex: on ? 3 : 1,
                } as CSSProperties
              }
              aria-label={place.name}
              aria-pressed={on}
              onClick={() => onSelect(place.id)}
            >
              <span className="mx-drop" aria-hidden="true">
                <Icon name={cat?.icon ?? 'pin'} size={on ? 20 : 16} color="#fff" stroke={2.2} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
