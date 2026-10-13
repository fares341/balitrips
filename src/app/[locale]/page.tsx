/**
 * Homepage — v3 (design-reference/prototype/home.html, screens 01-home).
 *
 * Sections, in the package's order, each with its data source and own page:
 *
 *   hero            4 arched video portals (public/brand/arch-*), search
 *                   → /search?q=&type=, CTAs → /explore, /custom
 *   planning today  6 service tiles → /map, /activities, /itineraries,
 *                   /packages, /driver, /custom
 *   who we are      vertical two-column image slider + 3 values → /about
 *   map teaser      satellite image; pins = free map places (listMapPlaces,
 *                   redacted for an anonymous visitor) → /map?place=;
 *                   category chips (listMapTaxonomy) → /map?cat=; search → /map?q=
 *   in the mood     the same free places grouped by map category (PlaceCard)
 *   activities      listActivities (top, events excluded) → ActivityCard
 *   itineraries     listItineraries → ItineraryCard
 *   packages        listPackages → PackageCard
 *   driver          listDriverVehicles → teaser → /driver?start=&end=&pax=
 *   custom trip     → /custom, /contact
 *   highlights      listRegions + listLandmarks (photo, landmark types)
 *                   → /explore?region=
 *   reviews         the top activities' own reviews (hidden when none)
 *   articles        listArticles → ArticleCard
 *   FAQ + final     existing FAQ copy → /faq, /contact; → /services, /map
 *
 * Nothing is invented: every name, price, rating and count comes from the
 * catalogue; a section with nothing real to show is left out.
 *
 * `setRequestLocale` keeps the route statically renderable. The map data is
 * redacted with an empty entitlement set, so only free places (which every
 * visitor may see) are ever rendered here.
 */

import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { LinkButton, RegionCard, SectionHead } from '@/components/bt'
import {
  ActivityCard,
  ArticleCard,
  ItineraryCard,
  PackageCard,
  PlaceCard,
} from '@/components/cards'
import { Icon, type IconName } from '@/components/ui'
import { isLocale, type Locale } from '@/i18n/config'
import { getPathname, Link } from '@/i18n/routing'
import { EVENTS_CATEGORY_KEY } from '@/lib/content/extra-queries'
import { pick, pickOptional } from '@/lib/content/localize'
import {
  listActivities,
  listArticles,
  listDriverVehicles,
  listItineraries,
  listLandmarks,
  listMapPlaces,
  listMapTaxonomy,
  listPackages,
  listRegions,
  reviewsForActivity,
} from '@/lib/content/queries'
import type { ActivitySummary, ReviewDto } from '@/lib/content/types'
import { buildMapPayload, emptyEntitlements, type MapPlaceForClient } from '@/lib/entitlements'

import { pageMetadata } from './_meta'
import { AboutSlider } from './_home/about-slider'
import { DriverTeaser, type TeaserVehicle } from './_home/driver-teaser'
import { HeroArches, type Arch } from './_home/hero-arches'
import { MoodTabs, type MoodTab } from './_home/mood-tabs'
import { CUSTOM_HREF } from './_ui/routes-extra'

type OpenPlace = Extract<MapPlaceForClient, { locked: false }>

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CATALOGUE_LIMIT = 60
const CARD_COUNT = 4
const ARTICLE_COUNT = 3
const MOOD_TAB_LIMIT = 7
const MAP_PIN_COUNT = 5
const REGION_TILE_LIMIT = 7
const REVIEW_SOURCE_COUNT = 8
const REVIEW_COUNT = 6

const ARCHES: readonly Arch[] = [
  { name: 'Ubud', video: 'arch-ubud', poster: '/brand/rice-walk.jpg' },
  { name: 'Nusa Penida', video: 'arch-penida', poster: '/brand/kelingking.jpg' },
  { name: 'Lempuyang', video: 'arch-lempuyang', poster: '/brand/lempuyang.jpg' },
  { name: 'Uluwatu', video: 'arch-uluwatu', poster: '/brand/cliff-beach.jpg' },
]

/** "What are you planning today?" — one tile per service page. */
const SERVICES: readonly { href: string; icon: IconName; key: string; tone?: 'orange' }[] = [
  { href: '/map', icon: 'map', key: 'map' },
  { href: '/activities', icon: 'compass', key: 'act', tone: 'orange' },
  { href: '/itineraries', icon: 'doc', key: 'itin' },
  { href: '/packages', icon: 'box', key: 'pkg' },
  { href: '/driver', icon: 'car', key: 'drv', tone: 'orange' },
  { href: CUSTOM_HREF, icon: 'wand', key: 'cust' },
]

const SLIDER_UP = ['green-dress', 'temple-gate', 'rice-walk', 'swing', 'ulun-danu'].map(
  (name) => `/brand/${name}.jpg`,
)
const SLIDER_DOWN = ['penida-cove', 'kelingking', 'jungle-pool', 'lempuyang', 'beach-palms'].map(
  (name) => `/brand/${name}.jpg`,
)

const VALUES: readonly { icon: IconName; key: string }[] = [
  { icon: 'pin', key: 'v1' },
  { icon: 'chat', key: 'v2' },
  { icon: 'shield', key: 'v3' },
]

const MAP_POINTS = ['p1', 'p2', 'p3', 'p4'] as const

/** Real FAQ copy (shared with /faq). */
const FAQ: readonly { q: string; a: string }[] = [
  { q: 'home_faq1_q', a: 'home_faq1_a' },
  { q: 'home_faq2_q', a: 'home_faq2_a' },
  { q: 'ad_faq1_q', a: 'ad_faq1_a' },
  { q: 'faq_pay_q', a: 'faq_pay_a' },
  { q: 'home_faq4_q', a: 'home_faq4_a' },
]

/**
 * Where a coordinate lands on public/brand/bali-sat.jpg (2048×1399,
 * equirectangular), as percentages — the package's geo→px formula (data.js).
 */
function satPercent(lat: number, lon: number): { x: number; y: number } {
  const x = ((190 + (lon - 114.43) * 485) * 2.048) / 2048
  const y = ((155 + (-lat - 8.07) * 485) * 2.048) / 1399
  return { x: x * 100, y: y * 100 }
}

function inCategory(activity: ActivitySummary, key: string): boolean {
  return activity.categories.some((category) => category.key === key)
}

function isOpen(place: MapPlaceForClient): place is OpenPlace {
  return !place.locked
}

function firstGrapheme(value: string): string {
  const first = [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value.trim()),
  ][0]
  return first?.segment.toUpperCase() ?? '?'
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const t = await getTranslations({ locale })

  return pageMetadata({
    locale,
    path: '/',
    title: t('hv3_meta_title'),
    description: t('hv3_hero_lede'),
    absoluteTitle: true,
  })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const t = await getTranslations()

  const [
    catalogue,
    itineraries,
    packages,
    landmarks,
    articles,
    vehicles,
    regions,
    mapPlaces,
    taxonomy,
  ] = await Promise.all([
    listActivities({ sort: 'top', limit: CATALOGUE_LIMIT, locale }),
    listItineraries(),
    listPackages(),
    listLandmarks(),
    listArticles({ limit: ARTICLE_COUNT, locale }),
    listDriverVehicles(),
    listRegions(),
    listMapPlaces(),
    listMapTaxonomy(),
  ])

  // --- activities & reviews ------------------------------------------------
  const featured = catalogue
    .filter((activity) => !inCategory(activity, EVENTS_CATEGORY_KEY))
    .slice(0, CARD_COUNT)

  const reviewSources = catalogue.slice(0, REVIEW_SOURCE_COUNT)
  const reviewGroups = await Promise.all(
    reviewSources.map((activity) => reviewsForActivity(activity.id)),
  )
  const reviews = reviewGroups
    .flatMap((group, index) => group.map((review) => ({ review, activity: reviewSources[index] })))
    .filter(
      (entry): entry is { review: ReviewDto; activity: ActivitySummary } =>
        entry.activity !== undefined && pickOptional(entry.review.body, locale) !== null,
    )
    .sort((a, b) => b.review.createdAt.localeCompare(a.review.createdAt))
    .slice(0, REVIEW_COUNT)

  // --- map places (free only: redacted for an anonymous visitor) ------------
  const openPlaces = buildMapPayload(mapPlaces, emptyEntitlements()).places.filter(isOpen)

  const pins = openPlaces
    .filter((place) => place.heroImageUrl !== null)
    .map((place) => ({ place, at: satPercent(place.lat, place.lon) }))
    .filter(({ at }) => at.x > 4 && at.x < 96 && at.y > 4 && at.y < 96)
    .slice(0, MAP_PIN_COUNT)

  const usedCategories = taxonomy.categories.filter((category) =>
    openPlaces.some((place) => place.categoryKey === category.key),
  )

  const moodTabs: MoodTab[] = usedCategories.slice(0, MOOD_TAB_LIMIT).map((category) => ({
    key: category.key,
    label: pick(category.label, locale, category.key),
  }))
  const moodPanels: Record<string, ReactNode> = {}
  for (const tab of moodTabs) {
    moodPanels[tab.key] = (
      <div className="grid fs-grid">
        {openPlaces
          .filter((place) => place.categoryKey === tab.key)
          .slice(0, CARD_COUNT)
          .map((place) => (
            <PlaceCard key={place.id} place={place} showFree={false} />
          ))}
      </div>
    )
  }
  const moodFallback =
    moodTabs.length === 0 && openPlaces.length > 0 ? (
      <div className="grid fs-grid">
        {openPlaces.slice(0, CARD_COUNT).map((place) => (
          <PlaceCard key={place.id} place={place} showFree={false} />
        ))}
      </div>
    ) : null

  // --- regions ---------------------------------------------------------------
  const regionTiles = regions
    .map((region) => {
      const inRegion = landmarks.filter((landmark) => landmark.region?.key === region.key)
      const image =
        inRegion.find((landmark) => landmark.hero !== null)?.hero?.url ??
        catalogue.find((activity) => activity.region?.key === region.key && activity.hero !== null)
          ?.hero?.url ??
        null
      const types = [
        ...new Set(
          inRegion
            .map((landmark) => pickOptional(landmark.type, locale))
            .filter((type): type is string => type !== null),
        ),
      ].slice(0, 2)
      return { region, image, tagline: types.length > 0 ? types.join(' · ') : null }
    })
    .filter((tile) => tile.image !== null)
    .slice(0, REGION_TILE_LIMIT)

  // --- driver ----------------------------------------------------------------
  const teaserVehicles: TeaserVehicle[] = vehicles.map((vehicle) => ({
    vehicleClass: vehicle.vehicleClass,
    label: pick(vehicle.label, locale, vehicle.vehicleClass),
    description: pickOptional(vehicle.description, locale),
    dayRateMinor: vehicle.dayRateMinor,
    currency: vehicle.currency,
    maxPassengers: vehicle.maxPassengers,
  }))

  const searchAction = getPathname({ href: '/search', locale })
  const mapAction = getPathname({ href: '/map', locale })

  return (
    <main className="home-v3">
      {/* 1 — hero */}
      <section className="hero" aria-labelledby="hero-h">
        <div className="arc" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">{t('hv3_hero_eyebrow')}</span>
            <h1 className="display" id="hero-h">
              {t.rich('hv3_hero_title', { em: (chunks) => <em>{chunks}</em> })}
            </h1>
            <p className="lede">{t('hv3_hero_lede')}</p>

            <form className="hsearch" action={searchAction} method="get" role="search">
              <label htmlFor="hq">
                <Icon name="search" size={20} color="var(--forest)" />
                <span className="sr-only">{t('hv3_search_label')}</span>
                <input
                  id="hq"
                  name="q"
                  type="search"
                  placeholder={t('hv3_search_ph')}
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </label>
              <select name="type" aria-label={t('hv3_type_label')} defaultValue="all">
                <option value="all">{t('hv3_type_all')}</option>
                <option value="activities">{t('hv3_type_activities')}</option>
                <option value="places">{t('hv3_type_places')}</option>
                <option value="itineraries">{t('hv3_type_itineraries')}</option>
              </select>
              <button className="btn btn-forest" type="submit">
                {t('hv3_search_btn')}
              </button>
            </form>

            <div className="row">
              <LinkButton href="/explore" size="lg" iconEnd="arrow">
                {t('hv3_cta_explore')}
              </LinkButton>
              <LinkButton href={CUSTOM_HREF} size="lg" variant="ghost">
                {t('hv3_cta_plan')}
              </LinkButton>
            </div>

            <ul className="trust" aria-label={t('hv3_trust_label')}>
              {(['hv3_check_1', 'hv3_check_2', 'hv3_check_3'] as const).map((key) => (
                <li key={key}>
                  <Icon name="check" size={18} stroke={2.2} />
                  {t(key)}
                </li>
              ))}
            </ul>
            <span className="scroll-cue" aria-hidden="true">
              <i />
              {t('hv3_scroll')}
            </span>
          </div>

          <HeroArches
            arches={ARCHES}
            pauseLabel={t('hv3_vid_pause')}
            playLabel={t('hv3_vid_play')}
          />
        </div>

        {/* What are you planning today? */}
        <div className="wrap qd-wrap">
          <div className="qd-head">
            <h2 className="qd-title" id="qd-h">
              {t('hv3_qd_title')}
            </h2>
            <p className="muted">{t('hv3_qd_sub')}</p>
          </div>
          <nav className="qd" aria-labelledby="qd-h">
            {SERVICES.map((service) => (
              <Link key={service.key} href={service.href}>
                <span className={service.tone === 'orange' ? 'ic is-orange' : 'ic'}>
                  <Icon name={service.icon} size={22} />
                </span>
                <span>
                  <span className="qd-t">{t(`hv3_qd_${service.key}`)}</span>
                  <small>{t(`hv3_qd_${service.key}_s`)}</small>
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* 2 — who we are */}
      <section className="sec bg-ivory2" aria-labelledby="ab-h">
        <div className="wrap about-grid">
          <AboutSlider
            up={SLIDER_UP}
            down={SLIDER_DOWN}
            pauseLabel={t('hv3_mq_pause')}
            playLabel={t('hv3_mq_play')}
          />
          <div className="stack about-copy">
            <span className="eyebrow">{t('hv3_ab_eyebrow')}</span>
            <h2 className="h2" id="ab-h">
              {t('hv3_ab_title')}
            </h2>
            <p className="lede">{t('hv3_ab_lede')}</p>
            <ul className="vals">
              {VALUES.map((value) => (
                <li key={value.key}>
                  <span className="ic" aria-hidden="true">
                    <Icon name={value.icon} size={20} />
                  </span>
                  <span>
                    <b>{t(`hv3_ab_${value.key}_t`)}</b>
                    <span className="muted">{t(`hv3_ab_${value.key}_b`)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Link className="link about-more" href="/about">
              {t('hv3_ab_more')} <Icon name="arrow" size={16} className="flip" />
            </Link>
          </div>
        </div>
      </section>

      {/* 3 — interactive map teaser */}
      <section className="sec bg-forest mp-sec" aria-labelledby="mp-h">
        <div className="arc mp-sec-arc" aria-hidden="true" />
        <div className="wrap">
          <SectionHead
            id="mp-h"
            eyebrow={t('hv3_mp_eyebrow')}
            title={t('hv3_mp_title')}
            lede={t('hv3_mp_lede')}
            action={
              <LinkButton href="/map" size="lg">
                {t('hv3_mp_open')}
              </LinkButton>
            }
          />

          <div className="mp">
            <div className="mp-stage" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand artwork, cropped by CSS */}
              <img src="/brand/bali-sat.jpg" alt="" loading="lazy" decoding="async" />
            </div>
            <Link href="/map" className="mp-hit" tabIndex={-1} aria-hidden="true" />
            <div className="mp-stage mp-pins">
              {pins.map(({ place, at }, index) => (
                <Link
                  key={place.id}
                  href={`/map?place=${encodeURIComponent(place.slug)}`}
                  className={index >= 3 ? 'gpin hide-m' : 'gpin'}
                  style={{ left: `${at.x.toFixed(2)}%`, top: `${at.y.toFixed(2)}%` }}
                >
                  <span className="gdot" aria-hidden="true" />
                  <span className="gcard">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 44px thumbnail */}
                    <img src={place.heroImageUrl ?? ''} alt="" loading="lazy" />
                    <span>
                      <b>{pick(place.name, locale, place.slug)}</b>
                      {pickOptional(place.category, locale) !== null && (
                        <small>{pickOptional(place.category, locale)}</small>
                      )}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <span className="mp-arc a1" aria-hidden="true" />
            <span className="mp-arc a2" aria-hidden="true" />

            <div className="mp-ui">
              <form className="mp-search" action={mapAction} method="get" role="search">
                <Icon name="search" size={18} />
                <input
                  name="q"
                  type="search"
                  placeholder={t('hv3_mp_search_ph')}
                  aria-label={t('hv3_mp_search_ph')}
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </form>
              {usedCategories.length > 0 && (
                <nav className="mp-chips" aria-label={t('hv3_mp_cats')}>
                  <Link href="/map" className="on">
                    {t('hv3_mp_all')}
                  </Link>
                  {usedCategories.slice(0, 4).map((category) => (
                    <Link key={category.key} href={`/map?cat=${encodeURIComponent(category.key)}`}>
                      {pick(category.label, locale, category.key)}
                    </Link>
                  ))}
                </nav>
              )}
            </div>
            <div className="mp-cta">
              <Link href="/map" className="btn btn-light">
                <Icon name="map" size={18} />
                {t('hv3_mp_tap')}
              </Link>
            </div>
          </div>

          <ul className="map-points">
            {MAP_POINTS.map((point) => (
              <li key={point}>
                <Icon name="check" size={20} stroke={2} />
                <span>
                  <b>{t(`hv3_mp_${point}_t`)}</b>
                  <span>{t(`hv3_mp_${point}_b`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4 — what are you in the mood for? */}
      {openPlaces.length > 0 && (
        <section className="sec" aria-labelledby="fs-h">
          <div className="wrap">
            <SectionHead
              id="fs-h"
              eyebrow={t('hv3_fs_eyebrow')}
              title={t('hv3_fs_title')}
              lede={t('hv3_fs_lede')}
              action={
                <LinkButton href="/map" variant="ghost">
                  {t('hv3_fs_onmap')}
                </LinkButton>
              }
            />
            {moodFallback ?? (
              <MoodTabs tabs={moodTabs} panels={moodPanels} label={t('hv3_fs_cats')} />
            )}
          </div>
        </section>
      )}

      {/* 5 — activities */}
      {featured.length > 0 && (
        <section className="sec bg-ivory2" aria-labelledby="ac-h">
          <div className="wrap">
            <SectionHead
              id="ac-h"
              eyebrow={t('hv3_ac_eyebrow')}
              title={t('hv3_ac_title')}
              lede={t('hv3_ac_lede')}
              action={
                <LinkButton href="/activities" variant="secondary">
                  {t('hv3_ac_all')}
                </LinkButton>
              }
            />
            <div className="grid g4 home-g4">
              {featured.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 6 — itineraries */}
      {itineraries.length > 0 && (
        <section className="sec" aria-labelledby="it-h">
          <div className="wrap">
            <SectionHead
              id="it-h"
              eyebrow={t('hv3_it_eyebrow')}
              title={t('hv3_it_title')}
              lede={t('hv3_it_lede')}
              action={
                <LinkButton href="/itineraries" variant="ghost">
                  {t('hv3_it_all')}
                </LinkButton>
              }
            />
            <div className="grid g4 home-g4">
              {itineraries.slice(0, CARD_COUNT).map((itinerary) => (
                <ItineraryCard key={itinerary.id} itinerary={itinerary} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 7 — packages */}
      {packages.length > 0 && (
        <section className="sec bg-ivory2" aria-labelledby="pk-h">
          <div className="wrap">
            <SectionHead
              id="pk-h"
              eyebrow={t('hv3_pk_eyebrow')}
              title={t('hv3_pk_title')}
              lede={t('hv3_pk_lede')}
              action={
                <LinkButton href="/packages" variant="ghost">
                  {t('hv3_pk_all')}
                </LinkButton>
              }
            />
            <div className="grid g4 home-g4">
              {packages.slice(0, CARD_COUNT).map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 8 — private driver */}
      <section className="sec" aria-labelledby="dr-h">
        <div className="wrap drv">
          <div className="drv-media">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand photo */}
            <img src="/brand/driver-car.jpg" alt={t('hv3_dr_img_alt')} loading="lazy" />
          </div>
          <div className="stack drv-copy">
            <span className="eyebrow">{t('hv3_dr_eyebrow')}</span>
            <h2 className="h2" id="dr-h">
              {t('hv3_dr_title')}
            </h2>
            <p className="lede">{t('hv3_dr_lede')}</p>
            <DriverTeaser
              vehicles={teaserVehicles}
              action={getPathname({ href: '/driver', locale })}
            />
          </div>
        </div>
      </section>

      {/* 9 — custom trip */}
      <section className="sec-tight" aria-labelledby="ct-h">
        <div className="wrap">
          <div className="ct">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand photo */}
            <img src="/brand/consultant.jpg" alt="" loading="lazy" />
            <div className="ct-copy">
              <span className="eyebrow">{t('hv3_ct_eyebrow')}</span>
              <h2 className="h2" id="ct-h">
                {t('hv3_ct_title')}
              </h2>
              <p>{t('hv3_ct_body')}</p>
              <div className="row">
                <LinkButton href={CUSTOM_HREF}>{t('hv3_ct_request')}</LinkButton>
                <LinkButton href="/contact" variant="glass">
                  {t('hv3_ct_talk')}
                </LinkButton>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 10 — Bali highlights (areas) */}
      {regionTiles.length >= 2 && (
        <section className="sec" aria-labelledby="rg-h">
          <div className="wrap">
            <SectionHead
              id="rg-h"
              eyebrow={t('hv3_rg_eyebrow')}
              title={t('hv3_rg_title')}
              action={
                <LinkButton href="/explore" variant="ghost">
                  {t('hv3_rg_explore')}
                </LinkButton>
              }
            />
            <div className={`reg-grid n${regionTiles.length}`}>
              {regionTiles.map(({ region, image, tagline }, index) => (
                <RegionCard
                  key={region.id}
                  href={`/explore?region=${encodeURIComponent(region.key)}`}
                  image={image}
                  name={pick(region.label, locale, region.key)}
                  tagline={tagline}
                  cta={t('bt_explore_area')}
                  tall={index === 0}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 11 — reviews (real only) */}
      {reviews.length > 0 && (
        <section className="sec bg-ivory2" aria-labelledby="rv-h">
          <div className="wrap">
            <SectionHead
              id="rv-h"
              eyebrow={t('hv3_rv_eyebrow')}
              title={t('hv3_rv_title')}
              action={
                <LinkButton href="/reviews" variant="ghost">
                  {t('hv3_rv_all')}
                </LinkButton>
              }
            />
            <ul className="hscroll rev-list" role="list">
              {reviews.map(({ review, activity }) => (
                <ReviewTile
                  key={review.id}
                  review={review}
                  href={activity.href}
                  about={pick(activity.name, locale, activity.slug)}
                  locale={locale}
                  verifiedLabel={t('hv3_rv_verified')}
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 12 — articles */}
      {articles.length > 0 && (
        <section className="sec" aria-labelledby="ar-h">
          <div className="wrap">
            <SectionHead
              id="ar-h"
              eyebrow={t('hv3_ar_eyebrow')}
              title={t('hv3_ar_title')}
              action={
                <LinkButton href="/blog" variant="ghost">
                  {t('hv3_ar_all')}
                </LinkButton>
              }
            />
            <div className="grid g3 home-g3">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 13 — FAQ + final call to action */}
      <section className="sec bg-ivory2" aria-labelledby="fq-h">
        <div className="wrap fq-wrap">
          <div className="fq-grid">
            <div className="stack">
              <span className="eyebrow">{t('hv3_fq_eyebrow')}</span>
              <h2 className="h2" id="fq-h">
                {t('hv3_fq_title')}
              </h2>
              <p className="muted">{t('hv3_fq_sub')}</p>
              <div className="row">
                <LinkButton href="/faq" variant="ghost" size="sm">
                  {t('hv3_fq_all')}
                </LinkButton>
                <LinkButton href="/contact" variant="ghost" size="sm">
                  {t('hv3_fq_contact')}
                </LinkButton>
              </div>
            </div>
            <div className="acc">
              {FAQ.map((item, index) => (
                <details key={item.q} open={index === 0}>
                  <summary>
                    {t(item.q)}
                    <span className="pm" aria-hidden="true">
                      <Icon name="plus" size={16} stroke={2.2} />
                    </span>
                  </summary>
                  <div className="acc-body">{t(item.a)}</div>
                </details>
              ))}
            </div>
          </div>

          <div className="final">
            <div className="arc" aria-hidden="true" />
            <div className="stack final-in">
              <h2 className="h2">{t('hv3_final_title')}</h2>
              <p>{t('hv3_final_body')}</p>
              <div className="row final-row">
                <LinkButton href="/services" variant="secondary" size="lg">
                  {t('hv3_final_start')}
                </LinkButton>
                <LinkButton href="/map" variant="light" size="lg">
                  {t('hv3_final_map')}
                </LinkButton>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

/** One real review: stars, the activity it is about, the text and the author. */
function ReviewTile({
  review,
  href,
  about,
  locale,
  verifiedLabel,
}: {
  review: ReviewDto
  href: string
  about: string
  locale: Locale
  verifiedLabel: string
}) {
  const body = pickOptional(review.body, locale)
  const country = pickOptional(review.authorCountry, locale)
  const stars = Math.max(0, Math.min(5, Math.round(review.stars)))

  return (
    <li>
      <Link href={href} className="card rev">
        <span className="row between">
          <span className="stars" role="img" aria-label={`${review.stars}/5`}>
            {Array.from({ length: stars }, (_, index) => (
              <svg key={index} width={14} height={14} viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="m12 3.5 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 17l-5.3 2.9 1.2-6-4.5-4.1 6-.7L12 3.5Z"
                  fill="currentColor"
                />
              </svg>
            ))}
          </span>
          <span className="tag tag-palm">{about}</span>
        </span>
        <span className="rev-q">{body}</span>
        <span className="row rev-by">
          <span className="av" aria-hidden="true">
            {firstGrapheme(review.authorName)}
          </span>
          <span>
            <b>{review.authorName}</b>
            {(review.isVerified || country !== null) && (
              <small className="muted">{review.isVerified ? verifiedLabel : country}</small>
            )}
          </span>
        </span>
      </Link>
    </li>
  )
}
