/**
 * Activities hub.
 *
 * Ported from `ActivitiesPage` in design/handoff/sections-bt/page-activities.jsx.
 *
 * The handoff held the category and the sort in `React.useState`, which made
 * the whole page a client component and made the filtered view unaddressable:
 * "adventures, cheapest first" was not a URL, so it could not be shared,
 * bookmarked, linked to from an article, or indexed. Both live in the query
 * string here and the filtering happens in Postgres, so the chips are plain
 * anchors and the page needs no JavaScript at all to work.
 *
 * The one cost is that reading `searchParams` opts this route out of static
 * prerendering — it is request-rendered. That is inherent to a shareable
 * filtered list and is scoped to this page; every other route in the tree,
 * including the detail pages below it, stays static.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { ActivityCard } from '@/components/cards'
import { Breadcrumbs } from '@/components/shared'
import { Icon } from '@/components/ui'
import { defaultLocale, isLocale, locales, type Locale } from '@/i18n/config'
import { getPathname, Link } from '@/i18n/routing'
import { pick } from '@/lib/content/localize'
import { listActivities, listCategories } from '@/lib/content/queries'
import { ENTITY_PATHS, type ActivitySort, type CategoryDto } from '@/lib/content/types'

const HUB_PATH = ENTITY_PATHS.activity

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** The design's "no filter" sentinel. `listActivities` understands it too. */
const ALL = 'all'

const SORTS = ['top', 'price', 'region'] as const

/** Label key per sort. Kept beside the union so a new sort cannot ship untranslated. */
const SORT_LABEL: Record<ActivitySort, string> = {
  top: 'ah_sort_top',
  price: 'ah_sort_price',
  region: 'ah_sort_region',
}

type SearchParams = Record<string, string | string[] | undefined>

type PageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

/** `?cat=a&cat=b` is not a thing this page supports; take the first value. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function toSort(value: string | undefined): ActivitySort | null {
  if (value === undefined) return null
  return (SORTS as readonly string[]).includes(value) ? (value as ActivitySort) : null
}

/**
 * Canonical URL for one filter combination.
 *
 * Defaults are omitted rather than serialised, so `/activities`,
 * `/activities?cat=all` and `/activities?sort=` are not three URLs for one
 * page. Order is fixed for the same reason.
 */
function hubHref(categoryKey: string, sort: ActivitySort | null): string {
  const query = new URLSearchParams()
  if (categoryKey !== ALL) query.set('cat', categoryKey)
  if (sort !== null) query.set('sort', sort)
  const search = query.toString()
  return search === '' ? HUB_PATH : `${HUB_PATH}?${search}`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  const lang = isLocale(locale) ? locale : defaultLocale
  const t = await getTranslations({ locale: lang })

  const url = (target: Locale) => `${SITE_URL}${getPathname({ href: HUB_PATH, locale: target })}`

  return {
    title: t('ah_title'),
    description: t('ah_sub'),
    alternates: {
      canonical: url(lang),
      languages: {
        ...Object.fromEntries(locales.map((one) => [one, url(one)])),
        'x-default': url(defaultLocale),
      },
    },
    openGraph: {
      title: t('ah_title'),
      description: t('ah_sub'),
      url: url(lang),
      type: 'website',
    },
  }
}

export default async function ActivitiesPage({ params, searchParams }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  const lang: Locale = isLocale(locale) ? locale : defaultLocale
  const query = await searchParams

  const [t, format, categories] = await Promise.all([
    getTranslations(),
    getFormatter(),
    listCategories(),
  ])

  // An unknown ?cat= is treated as no filter rather than as an empty result:
  // a stale link from an old category should show the catalogue, not a dead
  // end that also reads as a soft 404 to a crawler.
  const requested = firstValue(query.cat)
  const activeCategory =
    requested !== undefined && categories.some((category) => category.key === requested)
      ? requested
      : ALL

  const activeSort = toSort(firstValue(query.sort))

  const activities = await listActivities({
    categoryKey: activeCategory,
    sort: activeSort,
    locale: lang,
  })

  return (
    <main>
      <div className="bt-banner" style={{ background: 'var(--forest)' }}>
        <div className="bt-banner-veil" />
        <div className="wrap bt-banner-inner">
          <Breadcrumbs
            light
            label={t('c_breadcrumb')}
            trail={[{ label: t('c_home'), href: '/' }, { label: t('navr_act') }]}
          />
          <span
            className="tag"
            style={{ background: 'var(--orange)', color: '#fff', width: 'fit-content' }}
          >
            {t('ev_eyebrow')}
          </span>
          <h1 className="bt-banner-title">{t('ah_title')}</h1>
          <p className="bt-banner-sub">{t('ah_sub')}</p>
        </div>
      </div>

      <section className="bg-ivory" style={{ paddingBlock: '32px 64px' }}>
        <div className="wrap">
          <FilterBar
            categories={categories}
            activeCategory={activeCategory}
            activeSort={activeSort}
            allLabel={t('map_f_all')}
            sortLabel={(sort) => t(SORT_LABEL[sort])}
            locale={lang}
          />

          <p
            className="muted"
            style={{ fontSize: 13.5, fontWeight: 600, margin: '18px 0 20px' }}
            aria-live="polite"
          >
            {format.number(activities.length)} {t('ah_count')}
          </p>

          {activities.length === 0 ? (
            <p className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>
              {t('ah_none')}
            </p>
          ) : (
            <div className="grid bt-grid-3auto">
              {activities.map((activity, index) => (
                <ActivityCard key={activity.id} activity={activity} priority={index < 3} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

/**
 * Filter + sort rail.
 *
 * Ported from `FilterBar` in design/handoff/bt-ui.jsx, with the buttons turned
 * into links. `Chip` from '@/components/shared' is deliberately not used: it
 * renders a `<button>` with `aria-pressed`, which is the right control for
 * client-side state and the wrong one for a navigation that changes the URL.
 * The classes are identical, so the two look the same.
 */
function FilterBar({
  categories,
  activeCategory,
  activeSort,
  allLabel,
  sortLabel,
  locale,
}: {
  categories: CategoryDto[]
  activeCategory: string
  activeSort: ActivitySort | null
  allLabel: string
  sortLabel: (sort: ActivitySort) => string
  locale: Locale
}) {
  const chips = [
    { key: ALL, label: allLabel },
    ...categories.map((category) => ({
      key: category.key,
      label: pick(category.label, locale, category.key),
    })),
  ]

  return (
    <div className="bt-filterbar">
      <div className="bt-filterchips">
        {chips.map((chip) => {
          const isActive = chip.key === activeCategory
          return (
            <Link
              key={chip.key}
              href={hubHref(chip.key, activeSort)}
              className={isActive ? 'chip active' : 'chip'}
              style={{ minHeight: 44 }}
              aria-current={isActive ? 'true' : undefined}
            >
              {chip.label}
            </Link>
          )
        })}
      </div>

      <div className="bt-filtersort">
        <Icon name="filter" size={16} color="var(--muted)" />
        {SORTS.map((sort) => {
          const isActive = sort === activeSort
          return (
            <Link
              key={sort}
              // Clicking the active sort clears it, as in the handoff.
              href={hubHref(activeCategory, isActive ? null : sort)}
              className={isActive ? 'chip orange active' : 'chip orange'}
              style={{ minHeight: 44 }}
              aria-current={isActive ? 'true' : undefined}
            >
              {sortLabel(sort)}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
