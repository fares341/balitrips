/**
 * Activities hub — v3 screen 05 (design-reference/prototype/activities.html).
 *
 * Banner, the three "how to choose" steps, a sticky toolbar (search, sort,
 * more filters, grid/list) with category chips, the card grid and the
 * "want a full program?" panel (the "need a driver?" one while the driver
 * service is on, lib/features.ts).
 *
 * Filtering is live on the client, as in the prototype (skeleton, then the
 * results — 260ms, instant with reduced motion), over the full published
 * catalogue rendered here. The filter state is mirrored into the query
 * string (`?cat=&region=&budget=&sort=&q=&view=`) and read back on the server,
 * so a filtered view is still a shareable, server-rendered URL.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Breadcrumbs, LinkButton } from '@/components/bt'
import { defaultLocale, isLocale, locales, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { parseBudgetTier } from '@/lib/budget-tier'
import { pick } from '@/lib/content/localize'
import { listActivities, listCategories } from '@/lib/content/queries'
import { ENTITY_PATHS } from '@/lib/content/types'
import { FEATURES } from '@/lib/features'

import { ActivitiesExplorer, type ExplorerFilters } from './activities-explorer'
import { ACTIVITY_SORTS, type ExplorerSort } from './explorer-contract'
import { CUSTOM_HREF } from '../_ui/routes-extra'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

import '@/styles/bt-activity.css'

const HUB_PATH = ENTITY_PATHS.activity

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

type SearchParams = Record<string, string | string[] | undefined>

type PageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  const lang = isLocale(locale) ? locale : defaultLocale
  const t = await getTranslations({ locale: lang })

  const url = (target: Locale) => `${SITE_URL}${getPathname({ href: HUB_PATH, locale: target })}`

  return {
    title: t('act_hub_title'),
    description: t('act_hub_sub'),
    alternates: {
      canonical: url(lang),
      languages: {
        ...Object.fromEntries(locales.map((one) => [one, url(one)])),
        'x-default': url(defaultLocale),
      },
    },
    openGraph: {
      images: [DEFAULT_SHARE_IMAGE],
      title: t('act_hub_title'),
      description: t('act_hub_sub'),
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

  const [t, categories, activities] = await Promise.all([
    getTranslations(),
    listCategories(),
    listActivities({ limit: 200, locale: lang }),
  ])

  // Only the areas that actually have activities, in label order.
  const regionMap = new Map<string, { key: string; label: string }>()
  for (const activity of activities) {
    if (activity.region) {
      regionMap.set(activity.region.key, {
        key: activity.region.key,
        label: pick(activity.region.label, lang, activity.region.key),
      })
    }
  }
  const regions = [...regionMap.values()].sort((a, b) => a.label.localeCompare(b.label, lang))

  // An unknown value in a stale link means "no filter", never an empty page.
  const cat = firstValue(query.cat)
  const region = firstValue(query.region)
  const sort = firstValue(query.sort)
  const initial: ExplorerFilters = {
    cat: cat !== undefined && categories.some((c) => c.key === cat) ? cat : 'all',
    region: region !== undefined && regionMap.has(region) ? region : 'all',
    budget: parseBudgetTier(query.budget),
    sort: (ACTIVITY_SORTS as readonly string[]).includes(sort ?? '')
      ? (sort as ExplorerSort)
      : 'rating',
    q: (firstValue(query.q) ?? '').slice(0, 80),
    view: firstValue(query.view) === 'list' ? 'list' : 'grid',
  }

  return (
    <main className="act-hub">
      <section className="banner">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative banner, CSS-cropped */}
        <img className="bg" src="/brand/jeep.webp" alt="" style={{ objectPosition: '50% 60%' }} />
        <div className="wrap">
          <Breadcrumbs
            light
            label={t('c_breadcrumb')}
            trail={[{ label: t('c_home'), href: '/' }, { label: t('navr_act') }]}
          />
          <span className="eyebrow" style={{ color: 'var(--palm)' }}>
            {t('act_hub_eyebrow')}
          </span>
          <h1>{t('act_hub_title')}</h1>
          <p>{t('act_hub_sub')}</p>
        </div>
      </section>

      <section className="sec-tight">
        <div className="wrap stack" style={{ gap: 16 }}>
          <h2 className="h3">{t('act_how_t')}</h2>
          <ol className="how3">
            {([1, 2, 3] as const).map((n) => (
              <li key={n}>
                <span className="n" dir="ltr">
                  {n}
                </span>
                <span>
                  <b>{t(`act_how${n}_t`)}</b>
                  <span className="muted">{t(`act_how${n}_b`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <ActivitiesExplorer
        activities={activities}
        // The taxonomy's own "all" row is a list sentinel; the explorer adds its own chip.
        categories={categories
          .filter((c) => c.key !== 'all')
          .map((c) => ({ key: c.key, label: pick(c.label, lang, c.key) }))}
        regions={regions}
        initial={initial}
      />

      <section className="sec-tight">
        <div className="wrap">
          <div className="panel row between act-driver-cta">
            {FEATURES.driver ? (
              <>
                <div className="stack" style={{ gap: 6, maxWidth: 620 }}>
                  <b className="h3" style={{ color: 'var(--forest)' }}>
                    {t('act_driver_t')}
                  </b>
                  <span className="muted">{t('act_driver_b')}</span>
                </div>
                <div className="row">
                  <LinkButton href="/driver" variant="forest">
                    {t('act_driver_cta')}
                  </LinkButton>
                  <LinkButton href="/packages" variant="ghost">
                    {t('act_driver_pkgs')}
                  </LinkButton>
                </div>
              </>
            ) : (
              <>
                {/* v3.2: the driver panel became "Want a full program?" */}
                <div className="stack" style={{ gap: 6, maxWidth: 620 }}>
                  <b className="h3" style={{ color: 'var(--forest)' }}>
                    {t('act_prog_t')}
                  </b>
                  <span className="muted">{t('act_prog_b')}</span>
                </div>
                <div className="row">
                  <LinkButton href={CUSTOM_HREF} variant="forest">
                    {t('svc_cust_t')}
                  </LinkButton>
                  <LinkButton href="/packages" variant="ghost">
                    {t('act_driver_pkgs')}
                  </LinkButton>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
