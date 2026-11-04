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
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react'
import { useTranslations } from 'next-intl'

import { Icon, type IconName } from '@/components/ui'
import { Money } from '@/components/currency/currency-context'
import { Link, useRouter } from '@/i18n/routing'
import {
  ALL_AREA,
  boundsOf,
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
  initialFacts: { travelers: TravelerType[]; durations: DurationBucket[] }
  travelerOptions: TravelerType[]
  durationOptions: DurationBucket[]
  initialPlace: string | null
  plans: PlanItem[]
  unlocked: boolean
  viewerLabel: string | null
  settings: MapSettings
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
const PIN_OFF = '#69736d'

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
  const [userPos, setUserPos] = useState<{ lat: number; lon: number } | null>(null)
  const [locateError, setLocateError] = useState(false)

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

  const places = results.places
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
    }
  }, [places])

  const selected = selectedId === null ? null : (placeById.get(selectedId) ?? null)
  const current = selected ?? places[0] ?? null
  const currentIndex = current === null ? 0 : Math.max(0, places.indexOf(current))

  // ---- Map ⇄ carousel sync ----------------------------------------------------

  const mapApi = useRef<ResultsMapHandle>(null)
  const carouselApi = useRef<CarouselHandle>(null)

  /** A pin was tapped: select it and bring its card into view. */
  const onPin = useCallback((id: string) => {
    setSelectedId(id)
    carouselApi.current?.scrollToId(id)
    mapApi.current?.reveal(id)
  }, [])

  /** The carousel settled on a card: select it and ease the map to its pin. */
  const onCard = useCallback((id: string) => {
    setSelectedId((prev) => {
      if (prev !== id) mapApi.current?.focus(id)
      return id
    })
  }, [])

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

  const goBack = () => {
    const sameOrigin = document.referrer.startsWith(window.location.origin)
    if (sameOrigin && window.history.length > 1) window.history.back()
    else router.push('/')
  }

  const area = applied.area ?? ALL_AREA
  const title = area === ALL_AREA ? t('mx3_bali') : (areaByKey.get(area)?.label ?? t('mx3_bali'))
  const countsHere = useMemo(() => categoryCounts(counts, area), [counts, area])
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

  const chip = (kind: SheetKind, label: string, on: boolean) => (
    <button
      type="button"
      className={on ? 'mx3-chip is-on' : 'mx3-chip'}
      aria-haspopup="dialog"
      aria-expanded={sheet === kind}
      onClick={() => setSheet(kind)}
      data-chip={kind}
    >
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
          {chip('cats', catLabel, applied.categories.length > 0)}
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
        onPin={onPin}
      />

      <MapTools onLocate={locate} locateError={locateError} />
      {props.viewerLabel !== null && <MapWatermark label={props.viewerLabel} />}
      <Attribution settings={props.settings} />

      <div className="mx3-bottom" aria-live="polite">
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
                      {catByKey.get(place.categoryKey)?.label}
                      {place.rating !== null ? ` · ★ ${place.rating.toFixed(1)}` : ''}
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

function Thumb({ src, category }: { src: string | null; category: CategoryItem | undefined }) {
  const [broken, setBroken] = useState(false)
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="mx3-thumb"
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span
      className="mx3-thumb is-ph"
      style={{ '--c': category?.color ?? '#2E5E4E' } as CSSProperties}
    >
      <Icon name={category?.icon ?? 'pin'} size={22} />
    </span>
  )
}

function MapTools({ onLocate, locateError }: { onLocate: () => void; locateError: boolean }) {
  const t = useTranslations()
  return (
    <div className="mx3-tools">
      <button type="button" className="mx-tool" aria-label={t('mx_locate')} onClick={onLocate}>
        <Icon name="locate" size={20} />
      </button>
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
}: {
  ref: Ref<CarouselHandle>
  places: ResultPlace[]
  index: number
  categories: Map<string, CategoryItem>
  onSettle: (id: string) => void
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
}: {
  place: ResultPlace
  on: boolean
  position: number
  total: number
  category: CategoryItem | undefined
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
      <Thumb src={place.thumb} category={category} />
      <div className="mx3-card-body">
        <h2 className="mx3-card-name">
          <Link href={`/places/${place.slug}`} className="mx3-card-link">
            {place.name}
          </Link>
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
  /** Ease the map so the pin sits in the open area above the cards. */
  focus(id: string): void
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
const IMG_PIN = 'mx-pin'
const IMG_ON = 'mx-pin-on'

/** Teardrop pin drawn on a canvas (no sprite file): fill + white centre dot. */
function pinImage(
  fill: string,
  cssW: number,
  ratio: number,
): { width: number; height: number; data: Uint8ClampedArray } | null {
  const cssH = Math.round(cssW * 1.32)
  const W = Math.round(cssW * ratio)
  const H = Math.round(cssH * ratio)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) return null
  g.scale(ratio, ratio)
  const r = cssW / 2 - 1.5
  const cx = cssW / 2
  const cy = r + 1.5
  const tipY = cssH - 1
  g.shadowColor = 'rgba(0,0,0,0.28)'
  g.shadowBlur = 3
  g.shadowOffsetY = 1
  g.beginPath()
  // Circle top, two tangents meeting at the tip.
  const a = Math.asin(r / (tipY - cy))
  g.arc(cx, cy, r, Math.PI / 2 + a, Math.PI / 2 - a)
  g.lineTo(cx, tipY)
  g.closePath()
  g.fillStyle = fill
  g.fill()
  g.shadowColor = 'transparent'
  g.lineWidth = 1.5
  g.strokeStyle = '#ffffff'
  g.stroke()
  g.beginPath()
  g.arc(cx, cy, r * 0.38, 0, Math.PI * 2)
  g.fillStyle = '#ffffff'
  g.fill()
  return { width: W, height: H, data: g.getImageData(0, 0, W, H).data }
}

type GeoSource = {
  setData(data: unknown): void
  getClusterExpansionZoom(id: number): Promise<number>
}

interface Feature {
  layer?: { id?: string }
  properties?: Record<string, unknown>
  geometry?: { type?: string; coordinates?: [number, number] }
}

function addLayers(map: MapLike, places: readonly ResultPlace[]) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2)
  const off = pinImage(PIN_OFF, 22, ratio)
  const on = pinImage(PIN_ON, 32, ratio)
  if (off && !map.hasImage?.(IMG_PIN)) map.addImage?.(IMG_PIN, off, { pixelRatio: ratio })
  if (on && !map.hasImage?.(IMG_ON)) map.addImage?.(IMG_ON, on, { pixelRatio: ratio })
  const empty = { type: 'FeatureCollection', features: [] }
  map.addSource(SRC, {
    type: 'geojson',
    data: toFeatureCollection(places),
    cluster: true,
    clusterRadius: 40,
    clusterMaxZoom: 14,
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
      'circle-radius': ['step', ['get', 'point_count'], 15, 10, 18, 50, 22],
      'circle-stroke-width': 2.5,
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
      'text-size': 13,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': '#ffffff' },
  })
  map.addLayer({
    id: L_PIN,
    type: 'symbol',
    source: SRC,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': IMG_PIN,
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      // Southern pins drawn over northern ones (they are "closer").
      'symbol-sort-key': ['get', 's'],
    },
  })
  map.addLayer({
    id: L_ME,
    type: 'circle',
    source: SRC_ME,
    paint: {
      'circle-radius': 7,
      'circle-color': '#2f7bf6',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
    },
  })
  map.addLayer({
    id: L_ON,
    type: 'symbol',
    source: SRC_ON,
    layout: {
      'icon-image': IMG_ON,
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
}

/** Taps within ~22px of a pin or cluster count (44px target), nearest wins. */
function onMapClick(map: MapLike, event: unknown, onPin: (id: string) => void) {
  const point = (event as { point?: { x: number; y: number } } | undefined)?.point
  if (!point || !map.queryRenderedFeatures) return
  const hits = map.queryRenderedFeatures(
    [
      [point.x - 22, point.y - 26],
      [point.x + 22, point.y + 18],
    ],
    { layers: [L_ON, L_PIN, L_CLUSTER] },
  ) as Feature[]
  if (hits.length === 0) return
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
      .then((zoom) => map.easeTo({ center: coords, zoom: zoom + 0.3, duration: 450 }))
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
  onPin,
}: {
  ref: Ref<ResultsMapHandle>
  locale: string
  settings: MapSettings
  places: ResultPlace[]
  resultKey: string
  /** `?place=` deep link: open close on that place instead of framing all. */
  initialSlug: string | null
  selectedId: string | null
  userPos: { lat: number; lon: number } | null
  onPin: (id: string) => void
}) {
  const t = useTranslations()
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLike | null>(null)
  const [styled, setStyled] = useState(false)
  const [failed, setFailed] = useState(false)
  const latest = useRef({ places, selectedId, onPin })
  useLayoutEffect(() => {
    latest.current = { places, selectedId, onPin }
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
    return { top, bottom: Math.min(bot, rect.height * 0.55), left: 40, right: 40 }
  }, [])

  const placeById = useCallback(
    (id: string) => latest.current.places.find((one) => one.id === id) ?? null,
    [],
  )

  useImperativeHandle(
    ref,
    () => ({
      focus(id) {
        const map = mapRef.current
        const place = placeById(id)
        if (!map || !place) return
        map.easeTo({
          center: [place.lon, place.lat],
          zoom: Math.max(map.getZoom(), 11),
          padding: padding(),
          duration: 500,
        })
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
          map.easeTo({ center: [place.lon, place.lat], padding: pad, duration: 500 })
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
        map = createRealMap(engine, box.current, settings, { locale, flat: true, light: true })
        mapRef.current = map
        ;(box.current as HTMLDivElement & { __map?: MapLike }).__map = map
        const m = map
        // Pins go in as soon as the style is parsed (not after every tile:
        // 'load'), so they show while the base map is still streaming in.
        let added = false
        const init = () => {
          if (!live || added) return
          added = true
          addLayers(m, latest.current.places)
          setStyled(true)
        }
        if (m.isStyleLoaded?.()) init()
        else {
          m.once('style.load', init)
          m.once('load', init)
        }
        m.on('click', (event) => onMapClick(m, event, (id) => latest.current.onPin(id)))
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
  useEffect(() => {
    const map = mapRef.current
    if (!styled || !map) return
    const source = map.getSource(SRC) as GeoSource | undefined
    source?.setData(toFeatureCollection(places))
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
      map.fitBounds(bounds, { padding: padding(), maxZoom: 14, duration: first ? 0 : 500 })
    }
  }, [styled, places, resultKey, padding, initialSlug])

  // Selected pin: its own one-feature source, drawn above the clusters.
  useEffect(() => {
    const map = mapRef.current
    if (!styled || !map) return
    const place = selectedId === null ? null : placeById(selectedId)
    const source = map.getSource(SRC_ON) as GeoSource | undefined
    source?.setData(
      place
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { id: place.id },
                geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
              },
            ],
          }
        : { type: 'FeatureCollection', features: [] },
    )
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
