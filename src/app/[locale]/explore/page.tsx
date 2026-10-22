/**
 * Explore Bali — v3 screen 13 (design-reference/prototype/explore.html).
 *
 *   banner · one photo card per region → /explore/[region] · "compare areas"
 *   with real counts (activities, open map places, itineraries) · the
 *   landmarks, filterable by region in the URL (?region=)
 *
 * The package's comparison used editorial dot ratings and suggested stays;
 * those are not in the data, so the table shows what is: real counts.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { RegionCard } from '@/components/bt'
import { LandmarkCard } from '@/components/cards'
import { locales, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick } from '@/lib/content/localize'
import { listLandmarks } from '@/lib/content/queries'
import { ENTITY_PATHS, type RegionDto } from '@/lib/content/types'

import { alternatesFor, toLocale } from '../_seo-hreflang'
import { PageBanner } from '../_ui/page-banner'
import { regionHref, regionViews } from './region-data'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

import '@/styles/bt-activity.css'

const EXPLORE_HREF = ENTITY_PATHS.landmark

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

function exploreHref(regionKey: string): string {
  return regionKey === ALL
    ? EXPLORE_HREF
    : `${EXPLORE_HREF}?region=${encodeURIComponent(regionKey)}#landmarks`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: t('navr_explore'),
    description: t('ex4_sub'),
    alternates: alternatesFor(EXPLORE_HREF, locale),
    openGraph: {
      images: [DEFAULT_SHARE_IMAGE],
      type: 'website',
      title: t('ex4_title'),
      description: t('ex4_sub'),
      locale,
    },
  }
}

export default async function ExplorePage({ params, searchParams }: PageProps) {
  const { locale: raw } = await params
  setRequestLocale(raw)

  const locale = toLocale(raw)
  const query = await searchParams

  const [t, views] = await Promise.all([getTranslations({ locale }), regionViews(locale)])
  const regions = views.map((view) => view.region)

  const requested = firstValue(query['region'])
  const activeRegion =
    requested !== undefined && regions.some((region) => region.key === requested) ? requested : ALL
  const landmarks = await listLandmarks({ regionKey: activeRegion })

  return (
    <main>
      <PageBanner
        imageSrc="/brand/aerial-cliff.webp"
        tag={t('navr_explore')}
        title={t('ex4_title')}
        subtitle={t('ex4_sub')}
        breadcrumbLabel={t('c_breadcrumb')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('navr_explore') }]}
      />

      <section className="sec">
        <div className="wrap stack" style={{ gap: 28 }}>
          {views.length > 0 && (
            <ul className="ex-regions" role="list">
              {views.map((view, index) => (
                <li key={view.region.id}>
                  <RegionCard
                    href={regionHref(view.region.key)}
                    image={view.image}
                    name={pick(view.region.label, locale, view.region.key)}
                    tagline={t('ex4_counts', {
                      a: view.activities.length,
                      p: view.placeCount,
                    })}
                    cta={t('ex4_cta')}
                    tall
                    priority={index < 3}
                  />
                </li>
              ))}
            </ul>
          )}

          {views.length > 1 && (
            <div className="stack" style={{ gap: 12 }}>
              <h2 className="h3">{t('ex4_cmp_t')}</h2>
              <div className="cmp-wrap">
                <table className="cmp">
                  <thead>
                    <tr>
                      <th scope="col">{t('ex4_cmp_area')}</th>
                      <th scope="col">{t('sr4_t_activity')}</th>
                      <th scope="col">{t('sr4_t_place')}</th>
                      <th scope="col">{t('sr4_t_itinerary')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {views.map((view) => (
                      <tr key={view.region.id}>
                        <th scope="row">
                          <Link className="link" href={regionHref(view.region.key)}>
                            {pick(view.region.label, locale, view.region.key)}
                          </Link>
                        </th>
                        <td dir="ltr">{view.activities.length}</td>
                        <td dir="ltr">{view.placeCount}</td>
                        <td dir="ltr">{view.itineraries.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <small className="muted">{t('ex4_cmp_note')}</small>
            </div>
          )}
        </div>
      </section>

      <section className="sec bg-ivory2" id="landmarks" aria-labelledby="ex-landmarks">
        <div className="wrap">
          <h2 className="h2" id="ex-landmarks" style={{ marginBottom: 16 }}>
            {t('ex4_landmarks')}
          </h2>
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
              {landmarks.map((landmark) => (
                <LandmarkCard key={landmark.id} landmark={landmark} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

/**
 * Region rail for the landmarks: links (the filter lives in the URL), so
 * the plain chip classes rather than the button `Chip`.
 */
function RegionChips({
  regions,
  activeRegion,
  allLabel,
  locale,
}: {
  regions: readonly RegionDto[]
  activeRegion: string
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
