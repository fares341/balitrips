'use client'

/**
 * The activities toolbar + results (prototype activities.html `F`, `list()`,
 * `render()`): search, sort, "more filters" (area, max price per person),
 * grid/list, category chips with counts, active-filter chips, the result
 * count, the skeleton between filter changes and the empty state.
 *
 * State changes come only from event handlers (no effects), and each one
 * mirrors the filters into the URL with `history.replaceState`, so the view
 * is shareable without a navigation per keystroke.
 */

import { useMemo, useRef, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { Button, EmptyState, LinkButton } from '@/components/bt'
import { formatPrice } from '@/components/bt/card'
import { CardSkeleton } from '@/components/bt/states'
import { ActivityCard } from '@/components/cards/activity-card'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { pick, searchableText } from '@/lib/content/localize'
import type { ActivitySummary } from '@/lib/content/types'
import { minorUnitExponent } from '@/lib/money'

import { ACTIVITY_SORTS, type ExplorerSort } from './explorer-contract'

export type ExplorerFilters = {
  cat: string
  region: string
  /** Max price per person, minor units. Null = no limit. */
  max: number | null
  sort: ExplorerSort
  q: string
  view: 'grid' | 'list'
}

const SORT_LABEL: Record<ExplorerSort, string> = {
  rating: 'act_sort_rating',
  'price-asc': 'act_sort_price_asc',
  'price-desc': 'act_sort_price_desc',
  region: 'act_sort_region',
}

/** Handoff motion spec: filters → skeleton → results, 260ms. */
const SKELETON_MS = 260

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

export function ActivitiesExplorer({
  activities,
  categories,
  regions,
  initial,
}: {
  activities: ActivitySummary[]
  categories: { key: string; label: string }[]
  regions: { key: string; label: string }[]
  initial: ExplorerFilters
}) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const format = useFormatter()

  const [filters, setFilters] = useState<ExplorerFilters>(initial)
  const [pending, setPending] = useState(false)
  const [moreOpen, setMoreOpen] = useState(initial.region !== 'all' || initial.max !== null)
  const [draftQ, setDraftQ] = useState(initial.q)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The price slider works in the catalogue's main currency (the first one).
  const currency = activities[0]?.currency ?? 'USD'
  const unit = 10 ** minorUnitExponent(currency)
  const step = 5 * unit
  const priced = activities.filter((a) => a.currency === currency).map((a) => a.priceMinor)
  const priceCeil = priced.length ? Math.ceil(Math.max(...priced) / step) * step : step
  const priceFloor = priced.length ? Math.floor(Math.min(...priced) / step) * step : 0
  const money = (minor: number) => formatPrice(minor, currency, locale)

  function apply(patch: Partial<ExplorerFilters>, skeleton = true) {
    const next = { ...filters, ...patch }
    setFilters(next)

    const params = new URLSearchParams()
    if (next.cat !== 'all') params.set('cat', next.cat)
    if (next.region !== 'all') params.set('region', next.region)
    if (next.max !== null) params.set('max', String(next.max))
    if (next.sort !== 'rating') params.set('sort', next.sort)
    if (next.q !== '') params.set('q', next.q)
    if (next.view === 'list') params.set('view', 'list')
    const search = params.toString()
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}`,
    )

    if (!skeleton || reducedMotion()) return
    setPending(true)
    if (pendingTimer.current) clearTimeout(pendingTimer.current)
    pendingTimer.current = setTimeout(() => setPending(false), SKELETON_MS)
  }

  function resetAll() {
    setDraftQ('')
    apply({ cat: 'all', region: 'all', max: null, q: '' })
  }

  const counts = useMemo(() => {
    const out = new Map<string, number>()
    for (const a of activities)
      for (const c of a.categories) out.set(c.key, (out.get(c.key) ?? 0) + 1)
    return out
  }, [activities])

  const results = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    const list = activities.filter(
      (a) =>
        (filters.cat === 'all' || a.categories.some((c) => c.key === filters.cat)) &&
        (filters.region === 'all' || a.region?.key === filters.region) &&
        (filters.max === null || a.currency !== currency || a.priceMinor <= filters.max) &&
        (q === '' ||
          `${searchableText(a.name, locale)} ${searchableText(a.blurb ?? null, locale)} ${searchableText(a.area, locale)}`
            .toLowerCase()
            .includes(q)),
    )
    const name = (a: ActivitySummary) => pick(a.name, locale, a.slug)
    const regionName = (a: ActivitySummary) => (a.region ? pick(a.region.label, locale) : '')
    const by: Record<ExplorerSort, (a: ActivitySummary, b: ActivitySummary) => number> = {
      rating: (a, b) =>
        (b.rating ?? -1) - (a.rating ?? -1) ||
        b.reviewCount - a.reviewCount ||
        name(a).localeCompare(name(b), locale),
      'price-asc': (a, b) => a.priceMinor - b.priceMinor,
      'price-desc': (a, b) => b.priceMinor - a.priceMinor,
      region: (a, b) => regionName(a).localeCompare(regionName(b), locale),
    }
    return [...list].sort(by[filters.sort])
  }, [activities, filters, currency, locale])

  const regionLabel = regions.find((r) => r.key === filters.region)?.label
  const active: { key: 'region' | 'max' | 'q'; label: string }[] = []
  if (filters.region !== 'all' && regionLabel) active.push({ key: 'region', label: regionLabel })
  if (filters.max !== null) active.push({ key: 'max', label: `≤ ${money(filters.max)}` })
  if (filters.q !== '') active.push({ key: 'q', label: `“${filters.q}”` })

  return (
    <>
      <div className="act-toolbar">
        <div className="wrap stack" style={{ gap: 10 }}>
          <div className="tb-row">
            <label className="msearch">
              <Icon name="search" size={18} />
              <span className="sr-only">{t('act_search_label')}</span>
              <input
                type="search"
                value={draftQ}
                placeholder={t('act_search_ph')}
                onChange={(event) => {
                  const value = event.target.value
                  setDraftQ(value)
                  if (typingTimer.current) clearTimeout(typingTimer.current)
                  typingTimer.current = setTimeout(() => apply({ q: value.trim() }), 220)
                }}
              />
            </label>
            <select
              className="select tb-sort"
              aria-label={t('act_sort_label')}
              value={filters.sort}
              onChange={(event) => apply({ sort: event.target.value as ExplorerSort })}
            >
              {ACTIVITY_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {t(SORT_LABEL[sort])}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              icon="filter"
              aria-expanded={moreOpen}
              aria-controls="act-more"
              onClick={() => setMoreOpen((open) => !open)}
            >
              {t('act_more_filters')}
            </Button>
            <div className="seg" role="group" aria-label={t('act_view_label')}>
              <button
                type="button"
                aria-pressed={filters.view === 'grid'}
                aria-label={t('act_view_grid')}
                onClick={() => apply({ view: 'grid' }, false)}
              >
                <Icon name="grid" size={16} />
              </button>
              <button
                type="button"
                aria-pressed={filters.view === 'list'}
                aria-label={t('act_view_list')}
                onClick={() => apply({ view: 'list' }, false)}
              >
                <Icon name="list" size={16} />
              </button>
            </div>
          </div>

          <div className="chips scroll" role="group" aria-label={t('act_cats_label')}>
            {[{ key: 'all', label: t('act_cat_all') }, ...categories].map((chip) => {
              const count = chip.key === 'all' ? activities.length : (counts.get(chip.key) ?? 0)
              if (chip.key !== 'all' && count === 0) return null
              return (
                <button
                  key={chip.key}
                  type="button"
                  className="chip"
                  aria-pressed={filters.cat === chip.key}
                  onClick={() => apply({ cat: chip.key })}
                >
                  {chip.label}{' '}
                  <span className="ct" dir="ltr">
                    {format.number(count)}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="act-more" id="act-more" hidden={!moreOpen}>
            <div className="field">
              <label htmlFor="act-f-region">{t('act_f_region')}</label>
              <select
                id="act-f-region"
                className="select"
                value={filters.region}
                onChange={(event) => apply({ region: event.target.value })}
              >
                <option value="all">{t('act_f_region_all')}</option>
                {regions.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="act-f-price">
                {t('act_f_price')}:{' '}
                <span className="range-out" dir="ltr">
                  {money(filters.max ?? priceCeil)}
                </span>
              </label>
              <input
                id="act-f-price"
                type="range"
                min={priceFloor}
                max={priceCeil}
                step={step}
                value={filters.max ?? priceCeil}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  apply({ max: value >= priceCeil ? null : value })
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <section className="sec-tight">
        <div className="wrap stack" style={{ gap: 16 }}>
          <div className="row between">
            <p className="muted" aria-live="polite" style={{ margin: 0 }}>
              <b className="num" style={{ color: 'var(--forest)' }}>
                {format.number(results.length)}
              </b>{' '}
              {t('act_count')}
            </p>
            {active.length > 0 && (
              <div className="active-f">
                {active.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    aria-label={`${t('act_remove')} ${chip.label}`}
                    onClick={() => {
                      if (chip.key === 'q') setDraftQ('')
                      apply(
                        chip.key === 'region'
                          ? { region: 'all' }
                          : chip.key === 'max'
                            ? { max: null }
                            : { q: '' },
                      )
                    }}
                  >
                    <span dir="auto">{chip.label}</span>{' '}
                    <Icon name="cross" size={14} stroke={2.2} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            className={filters.view === 'list' ? 'grid g3 act-grid list-view' : 'grid g3 act-grid'}
            aria-busy={pending || undefined}
          >
            {pending ? (
              [0, 1, 2].map((n) => (
                <CardSkeleton key={n} label={n === 0 ? t('bt_loading') : undefined} />
              ))
            ) : results.length === 0 ? (
              <EmptyState
                as="h3"
                icon="search"
                title={t('act_empty_t')}
                text={t('act_empty_b')}
                style={{ gridColumn: '1 / -1' }}
                action={
                  <div className="row" style={{ justifyContent: 'center' }}>
                    <Button variant="forest" onClick={resetAll}>
                      {t('act_clear_all')}
                    </Button>
                    <LinkButton href="/custom" variant="ghost">
                      {t('act_request_custom')}
                    </LinkButton>
                  </div>
                }
              />
            ) : (
              results.map((activity, index) => (
                <ActivityCard key={activity.id} activity={activity} priority={index < 3} />
              ))
            )}
          </div>
        </div>
      </section>
    </>
  )
}
