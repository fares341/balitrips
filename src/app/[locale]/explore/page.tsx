/**
 * Explore Bali — landmarks by region.
 *
 * Ported from `ExplorePage` in design/handoff/sections-bt/page-explore.jsx.
 *
 * The handoff held the active region in `React.useState`, which made the
 * filtered view unaddressable: "Explore Bali, Ubud only" was not a URL, so it
 * could not be shared, bookmarked, linked from an article or indexed. The
 * region lives in the query string here and the filtering happens in Postgres,
 * so the chips are plain anchors and the page works with JavaScript disabled.
 *
 * Reading `searchParams` opts this route out of static prerendering — that is
 * inherent to a shareable filtered list and is scoped to this page.
 *
 * Each card links to the activity that sells the landmark; `LandmarkCard`
 * already falls back to the map when there is no *published* activity behind
 * it, rather than the handoff's link straight to `l.actId`, which pointed at
 * detail pages for records that may since have been unpublished.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { LandmarkCard } from '@/components/cards'
import { LinkButton, SectionHead } from '@/components/shared'
import { Icon } from '@/components/ui'
import { locales, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick } from '@/lib/content/localize'
import { listLandmarks, listRegions } from '@/lib/content/queries'
import { ENTITY_PATHS, type RegionDto } from '@/lib/content/types'

import { alternatesFor, toLocale } from '../_seo-hreflang'
import { imagePool } from '../_ui/imagery'
import { PageBanner } from '../_ui/page-banner'

const EXPLORE_HREF = ENTITY_PATHS.landmark

const MAP_HREF = ENTITY_PATHS.place

/** The design's "no filter" sentinel. `listLandmarks` understands it too. */
const ALL = 'all'

type SearchParams = Record<string, string | string[] | undefined>

type PageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

/** `?region=a&region=b` is legal in a URL and meaningless here; take the first. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Canonical URL for one region filter.
 *
 * The default is omitted rather than serialised, so `/explore` and
 * `/explore?region=all` are not two URLs for one page.
 */
function exploreHref(regionKey: string): string {
  return regionKey === ALL
    ? EXPLORE_HREF
    : `${EXPLORE_HREF}?region=${encodeURIComponent(regionKey)}`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: t('navr_explore'),
    description: t('ex_sub'),
    // Always the unfiltered page: a region view is a facet of this one, not a
    // page of its own, and letting each `?region=` self-canonicalise would put
    // nine near-duplicate URLs into the index.
    alternates: alternatesFor(EXPLORE_HREF, locale),
    openGraph: {
      type: 'website',
      title: t('ex_title'),
      description: t('ex_sub'),
      locale,
    },
  }
}

export default async function ExplorePage({ params, searchParams }: PageProps) {
  const { locale: raw } = await params
  setRequestLocale(raw)

  const locale = toLocale(raw)
  const query = await searchParams

  const [t, regions] = await Promise.all([getTranslations({ locale }), listRegions()])

  // An unknown ?region= is treated as no filter rather than as an empty
  // result: a stale link from a renamed region should show the island, not a
  // dead end that also reads as a soft 404 to a crawler.
  const requested = firstValue(query['region'])
  const activeRegion =
    requested !== undefined && regions.some((region) => region.key === requested) ? requested : ALL

  const landmarks = await listLandmarks({ regionKey: activeRegion })

  const pool = imagePool(landmarks)

  return (
    <main>
      <PageBanner
        image={pool[0] ?? null}
        tag={t('navr_explore')}
        title={t('ex_title')}
        subtitle={t('ex_sub')}
        breadcrumbLabel={t('c_breadcrumb')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('navr_explore') }]}
      />

      <section className="bg-ivory">
        <div className="wrap">
          <RegionChips
            regions={regions}
            activeRegion={activeRegion}
            allLabel={t('hl_allregions')}
            locale={locale}
          />

          {landmarks.length === 0 ? (
            <p className="muted center" style={{ paddingBlock: 40, margin: 0 }}>
              {t('ah_none')}
            </p>
          ) : (
            <div className="grid bt-grid-3auto">
              {landmarks.map((landmark, index) => (
                <LandmarkCard key={landmark.id} landmark={landmark} priority={index < 3} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-ivory-2" aria-labelledby="explore-map">
        <div className="wrap">
          <SectionHead id="explore-map" eyebrow={t('map_eyebrow')} title={t('hm_title')} centered />
          <div className="center">
            {/* A link, not the handoff's `<button onClick={navigate}>`. */}
            <LinkButton href={MAP_HREF} variant="orange">
              <Icon name="pin" size={18} color="#fff" /> {t('hm_cta')}
            </LinkButton>
          </div>
        </div>
      </section>
    </main>
  )
}

/**
 * Region rail.
 *
 * `Chip` from '@/components/shared' is deliberately not used: it renders a
 * `<button>` with `aria-pressed`, which is the right control for client-side
 * state and the wrong one for a navigation that changes the URL. The classes
 * are identical, so the two look the same.
 */
function RegionChips({
  regions,
  activeRegion,
  allLabel,
  locale,
}: {
  regions: readonly RegionDto[]
  activeRegion: string
  /** Label of the "no filter" chip, and the accessible name of the rail. */
  allLabel: string
  locale: Locale
}) {
  const chips = [
    { key: ALL, label: allLabel },
    ...regions.map((region) => ({
      key: region.key,
      label: pick(region.label, locale, region.key),
    })),
  ]

  return (
    <nav className="bt-filterchips" style={{ marginBottom: 26 }} aria-label={allLabel}>
      {chips.map((chip) => {
        const isActive = chip.key === activeRegion
        return (
          <Link
            key={chip.key}
            href={exploreHref(chip.key)}
            className={isActive ? 'chip active' : 'chip'}
            style={{ minHeight: 44 }}
            aria-current={isActive ? 'page' : undefined}
          >
            {chip.label}
          </Link>
        )
      })}
    </nav>
  )
}
