/**
 * Homepage.
 *
 * The client's information architecture, in the client's order, dressed in
 * the photo-led premium style the owner picked:
 *
 *   2  hero (living map)         → /map, /itineraries; each destination card
 *                                  → its activity, /map?place= or /explore?region=
 *   3  short intro               → /about
 *   4  interactive map teaser    → /map
 *   5  find what to do           → /activities?cat=<key>
 *   6  activities & events       → /activities/<slug>, /events
 *   7  itineraries               → /itineraries/<slug>
 *   8  tour packages             → /packages/<slug>
 *   9  driver                    → /driver
 *   10 custom trip               → /custom
 *   11 Bali highlights           → the landmark's activity, else /explore#<slug>
 *   12 reviews                   → the reviewed activity, /reviews
 *   13 articles                  → /blog/<slug>, /blog
 *
 * Rules the client set, which this file keeps:
 *
 *  - "Find what to do" comes before itineraries and packages: most visitors
 *    start by browsing activities.
 *  - The home page is a glimpse. Every section has a button to its own page,
 *    and nothing here stands in for that page — no in-page anchors, no modals,
 *    no inline booking forms (the driver form now lives only on /driver).
 *  - Every card carries an icon and is one link from edge to edge, with no
 *    interactive element nested inside it.
 *
 * Everything shown is real: categories, counts and prices come from the
 * catalogue, the trust row is `trustStats()` (each figure omitted below its
 * meaningful minimum), and reviews are the listed activities' own.
 *
 * The hero is the client's animated "living map" (./_home/living-map-hero.tsx):
 * fixed artwork in public/hero/, translated copy and real links passed in
 * from here.
 *
 * `setRequestLocale` keeps the route statically renderable.
 */

import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { preload } from 'react-dom'

import { Icon, Photo, type IconName } from '@/components/ui'
import { isLocale, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { EVENTS_CATEGORY_KEY } from '@/lib/content/extra-queries'
import { pick, pickOptional } from '@/lib/content/localize'
import {
  listActivities,
  listArticles,
  listCategories,
  listDriverVehicles,
  listItineraries,
  listLandmarks,
  listPackages,
  listRegions,
  reviewsForActivity,
} from '@/lib/content/queries'
import { trustStats } from '@/lib/content/stats'
import type {
  ActivitySummary,
  CategoryRef,
  LandmarkDto,
  MediaDto,
  RegionDto,
  ReviewDto,
} from '@/lib/content/types'
import { listPublishedPlans } from '@/lib/entitlements/plans'

import { pageMetadata } from './_meta'
import { DESTINATION_POINTS, HERO_IMAGE, type DestinationLink } from './_home/living-map-data'
import { LivingMapHero, type LivingMapCopy } from './_home/living-map-hero'
import { imageAt, imagePool } from './_ui/imagery'
import { cheapest, formatPrice } from './_ui/price'
import { CUSTOM_HREF } from './_ui/routes-extra'

type Translator = Awaited<ReturnType<typeof getTranslations>>
type Formatter = Awaited<ReturnType<typeof getFormatter>>

// ---------------------------------------------------------------------------
// Section configuration
// ---------------------------------------------------------------------------

/** Enough of the catalogue to count every category; the query caps at 200. */
const CATALOGUE_LIMIT = 200
const CATEGORY_TILE_COUNT = 8
const ACTIVITY_COUNT = 3
const GLIMPSE_COUNT = 3
const LANDMARK_COUNT = 5
const REVIEW_SOURCE_COUNT = 6
const REVIEW_COUNT = 3

const ACTIVITIES_HREF = '/activities'
const EVENTS_HREF = '/events'
const MAP_HREF = '/map'
const ITINERARIES_HREF = '/itineraries'
const EXPLORE_HREF = '/explore'
const DRIVER_HREF = '/driver'

/** Category keys that are not a "what to do" filter on /activities. */
const NOT_A_TILE = new Set(['all', EVENTS_CATEGORY_KEY])

/**
 * Icon per seeded category key, used when the category row has no icon of its
 * own (Studio can set one, and that always wins).
 */
const CATEGORY_ICON: Record<string, IconName> = {
  adv: 'compass',
  beach: 'wave',
  food: 'utensils',
  cafe: 'coffee',
  nature: 'leaf',
  family: 'users',
  kids: 'users',
  photo: 'camera',
  culture: 'temple',
  marine: 'wave',
  spa: 'sparkle',
  romantic: 'heart',
  shop: 'tag',
  events: 'ticket',
}

/** Section 9 — the checked benefits beside the vehicle types. */
const DRIVER_FEATURES = ['dp_vp1', 'dp_vp2', 'dp_vp3', 'dp_vp5'] as const

const VEHICLE_ICON: Record<string, IconName> = { sedan: 'car', suv: 'suv', van: 'van' }

/**
 * Section 4 — decorative pins on the satellite image, as percentages of its
 * width and height. Rough positions of well-known areas; the real map is one
 * click away, so these only have to read as "Bali, pinned".
 */
const MAP_PINS: readonly { x: number; y: number; kind: 'free' | 'paid' | 'gem' | 'vip' }[] = [
  { x: 55, y: 50, kind: 'free' },
  { x: 51, y: 76, kind: 'paid' },
  { x: 49, y: 62, kind: 'free' },
  { x: 54, y: 37, kind: 'gem' },
  { x: 72, y: 69, kind: 'vip' },
  { x: 77, y: 45, kind: 'paid' },
  { x: 41, y: 31, kind: 'gem' },
]

const LEGEND: readonly { kind: 'free' | 'paid' | 'gem' | 'vip'; label: string; icon: IconName }[] =
  [
    { kind: 'free', label: 'hero_legend_free', icon: 'pin' },
    { kind: 'paid', label: 'hero_legend_paid', icon: 'lock' },
    { kind: 'gem', label: 'hero_legend_gems', icon: 'gem' },
    { kind: 'vip', label: 'hero_legend_vip', icon: 'star' },
  ]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Newest first, across every activity's review set. */
function newestFirst(a: { review: ReviewDto }, b: { review: ReviewDto }): number {
  return b.review.createdAt.localeCompare(a.review.createdAt)
}

function firstGrapheme(value: string): string {
  const first = [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value.trim()),
  ][0]
  return first?.segment.toUpperCase() ?? '?'
}

/** The category's own icon when Studio set one, else the seeded default. */
function categoryIcon(category: CategoryRef): IconName {
  return category.icon ?? CATEGORY_ICON[category.key] ?? 'compass'
}

function inCategory(activity: ActivitySummary, key: string): boolean {
  return activity.categories.some((category) => category.key === key)
}

/**
 * Where a landmark card leads. A landmark has no page of its own: it goes to
 * the activity that sells it when that activity is live, otherwise to its
 * card on /explore (`landmark.href`, which carries the slug as an anchor).
 */
function landmarkHref(landmark: LandmarkDto): string {
  return landmark.activitySlug !== null ? `/activities/${landmark.activitySlug}` : landmark.href
}

/**
 * Where a hero destination card leads, and what its link says. The best real
 * page first: the landmark's bookable activity, then the map opened on the
 * place, then /explore filtered to the region (a region that no longer exists
 * falls back to the whole island rather than a filter /explore would ignore).
 */
function destinationLink(
  link: DestinationLink,
  landmarks: readonly LandmarkDto[],
  regions: readonly RegionDto[],
): { href: string; label: string } {
  const landmark =
    link.landmark === undefined
      ? undefined
      : landmarks.find((candidate) => candidate.slug === link.landmark)
  if (landmark !== undefined) {
    return landmark.activitySlug !== null
      ? { href: landmarkHref(landmark), label: 'lmap_card_activity' }
      : { href: landmark.href, label: 'lmap_card_area' }
  }
  if (link.place !== undefined) {
    return { href: `${MAP_HREF}?place=${encodeURIComponent(link.place)}`, label: 'lmap_card_map' }
  }
  return regions.some((region) => region.key === link.region)
    ? { href: `${EXPLORE_HREF}?region=${encodeURIComponent(link.region)}`, label: 'lmap_card_area' }
    : { href: EXPLORE_HREF, label: 'lmap_card_area' }
}

/** "Discover the magic of the <hl>Island of the Gods</hl>" → plain and accent runs. */
function titleRuns(raw: unknown): LivingMapCopy['title'] {
  const source = typeof raw === 'string' ? raw : ''
  const runs: { text: string; accent: boolean }[] = []
  let last = 0
  for (const match of source.matchAll(/<hl>(.*?)<\/hl>/g)) {
    const at = match.index ?? 0
    if (at > last) runs.push({ text: source.slice(last, at), accent: false })
    runs.push({ text: match[1] ?? '', accent: true })
    last = at + match[0].length
  }
  if (last < source.length) runs.push({ text: source.slice(last), accent: false })
  return runs
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
    title: `${t('hero_title_1')} ${t('hero_title_2')} · Bali Trips`,
    description: t('hero_sub'),
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
  const format = await getFormatter()

  const [
    regions,
    catalogue,
    categories,
    itineraries,
    packages,
    landmarks,
    articles,
    vehicles,
    plans,
    trust,
  ] = await Promise.all([
    listRegions(),
    listActivities({ sort: 'top', limit: CATALOGUE_LIMIT, locale }),
    listCategories(),
    listItineraries(),
    listPackages(),
    listLandmarks(),
    listArticles({ limit: GLIMPSE_COUNT, locale }),
    listDriverVehicles(),
    listPublishedPlans(),
    trustStats(),
  ])

  const events = catalogue.filter((activity) => inCategory(activity, EVENTS_CATEGORY_KEY))
  const featured = catalogue
    .filter((activity) => !inCategory(activity, EVENTS_CATEGORY_KEY))
    .slice(0, ACTIVITY_COUNT)

  // Section 5: only categories that actually have something to show.
  const tiles = categories
    .filter((category) => !NOT_A_TILE.has(category.key))
    .map((category) => ({
      category,
      count: catalogue.filter((activity) => inCategory(activity, category.key)).length,
    }))
    .filter((tile) => tile.count > 0)
    .slice(0, CATEGORY_TILE_COUNT)

  // Section 12: reviews are written about an activity, so the section shows
  // the top activities' own reviews, newest first, each linked to its activity.
  const reviewSources = catalogue.slice(0, REVIEW_SOURCE_COUNT)
  const reviewGroups = await Promise.all(
    reviewSources.map((activity) => reviewsForActivity(activity.id)),
  )
  const reviews = reviewGroups
    .flatMap((group, index) => group.map((review) => ({ review, activity: reviewSources[index] })))
    .filter(
      (entry): entry is { review: ReviewDto; activity: ActivitySummary } =>
        entry.activity !== undefined,
    )
    .sort(newestFirst)
    .slice(0, REVIEW_COUNT)

  // Editorial imagery borrowed from published records. See ./_ui/imagery.ts.
  const pool = imagePool(landmarks, catalogue, itineraries, packages)

  const itineraryFrom = cheapest(itineraries)
  const planFrom = cheapest(plans)
  const money = (point: { priceMinor: number; currency: string }) =>
    formatPrice(point.priceMinor, point.currency, locale)

  const highlights = landmarks.filter((landmark) => landmark.hero !== null).slice(0, LANDMARK_COUNT)
  const driverFrom = cheapest(
    vehicles.map((vehicle) => ({ priceMinor: vehicle.dayRateMinor, currency: vehicle.currency })),
  )

  // Section 2: the hero's map is the LCP image. Preload the very file its
  // <img> will choose (same srcset/sizes), at high priority.
  preload(HERO_IMAGE.map, {
    as: 'image',
    fetchPriority: 'high',
    imageSrcSet: HERO_IMAGE.mapSrcSet,
    imageSizes: HERO_IMAGE.sizes,
  })

  const heroCopy: LivingMapCopy = {
    eyebrow: t('lmap_eyebrow'),
    title: titleRuns(t.raw('lmap_title')),
    sub: t('lmap_sub'),
    primary: t('hero_cta_1'),
    secondary: t('lmap_cta_itin'),
    primaryShort: t('navr_map'),
    secondaryShort: t('navr_itin'),
    mapAlt: t('lmap_map_alt'),
    nav: t('lmap_nav'),
    prev: t('lmap_prev'),
    next: t('lmap_next'),
    pause: t('lmap_pause'),
    play: t('lmap_play'),
    // Placeholders filled on the client as the slide changes.
    count: t('lmap_count', { n: '{n}', total: '{total}' }),
  }

  const heroDestinations = DESTINATION_POINTS.map((point) => {
    const link = destinationLink(point.link, landmarks, regions)
    return {
      id: point.id,
      x: point.x,
      y: point.y,
      name: t(`lmap_d_${point.id}_name`),
      latin: t(`lmap_d_${point.id}_latin`),
      tag: t(`lmap_d_${point.id}_tag`),
      desc: t(`lmap_d_${point.id}_desc`),
      href: link.href,
      linkLabel: t(link.label),
    }
  })

  // The old hero's price anchor and rating, as one quiet line.
  const heroFacts =
    itineraryFrom !== null || planFrom !== null || trust.rating !== null ? (
      <>
        {itineraryFrom !== null && (
          <span>
            {t.rich('home_from_itin', {
              price: money(itineraryFrom),
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </span>
        )}
        {planFrom !== null && (
          <span>
            {t.rich('home_from_plan', {
              price: money(planFrom),
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </span>
        )}
        {trust.rating !== null && (
          <span>
            <strong>
              {format.number(trust.rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              <span aria-hidden="true"> ★</span>
            </strong>{' '}
            {t('hero_stat_rating')}
          </span>
        )}
      </>
    ) : undefined

  return (
    <main className="bt-home">
      {/* 2 — hero: the living map */}
      <LivingMapHero
        copy={heroCopy}
        destinations={heroDestinations}
        primaryHref={MAP_HREF}
        secondaryHref={ITINERARIES_HREF}
        facts={heroFacts}
      />

      {/* 3 — short intro */}
      <section className="bt-band bt-band-ivory" aria-labelledby="home-intro">
        <div className="wrap bt-hintro">
          <PremiumHead id="home-intro" kicker={t('about_eyebrow')} title={t('about_title')} />
          <div className="bt-hintro-body">
            <p className="bt-plede">{t('home_intro_b')}</p>
            <SectionLink href="/about" label={t('home_intro_cta')} />
          </div>
        </div>
      </section>

      {/* 4 — interactive map */}
      <section className="bt-band bt-band-night" aria-labelledby="home-map">
        <div className="wrap bt-hmap">
          <div className="bt-hmap-copy">
            <PremiumHead id="home-map" kicker={t('navr_map')} title={t('hm_title')} dark />
            <p className="bt-hmap-sub">{t('home_map_b')}</p>
            <p className="bt-hmap-legend-t">{t('hero_legend_t')}</p>
            <ul className="bt-hmap-legend">
              {LEGEND.map((item) => (
                <li key={item.kind}>
                  <span className={`bt-legend-pin ${item.kind}`} aria-hidden="true">
                    <Icon name={item.icon} size={13} stroke={2} />
                  </span>
                  {t(item.label)}
                </li>
              ))}
            </ul>
            <Link href={MAP_HREF} className="bt-glowcta bt-hmap-cta">
              <Icon name="pin" size={19} />
              {t('hm_cta')}
            </Link>
          </div>

          {/* The image is the second way in, for pointer users; keyboard users
              already have the button above, so it stays out of the tab order. */}
          <Link href={MAP_HREF} className="bt-hmap-art" tabIndex={-1} aria-label={t('hm_cta')}>
            <Photo src="/map/bali-satellite.webp" alt="" sizes="(min-width: 980px) 55vw, 100vw" />
            <span className="bt-hmap-pins" aria-hidden="true">
              {MAP_PINS.map((pin) => (
                <span
                  key={`${pin.x}-${pin.y}`}
                  className={`bt-hmap-pin ${pin.kind}`}
                  style={{ insetInlineStart: `${pin.x}%`, top: `${pin.y}%` }}
                />
              ))}
            </span>
            <span className="bt-hmap-chip">
              <Icon name="search" size={16} />
              {t('home_map_chip')}
            </span>
          </Link>
        </div>
      </section>

      {/* 5 — find what to do */}
      {tiles.length > 0 && (
        <section className="bt-band bt-band-ivory2" aria-labelledby="home-find">
          <div className="wrap">
            <PremiumHead
              id="home-find"
              kicker={t('home_find_k')}
              title={t('home_find_t')}
              sub={t('ev_sub')}
              action={<SectionLink href={ACTIVITIES_HREF} label={t('home_find_all')} />}
            />
            <ul className="bt-hcats" role="list">
              {tiles.map(({ category, count }) => (
                <li key={category.id}>
                  <Link
                    href={`${ACTIVITIES_HREF}?cat=${encodeURIComponent(category.key)}`}
                    className="bt-hcat"
                  >
                    <span className="bt-hcat-ic" aria-hidden="true">
                      <Icon name={categoryIcon(category)} size={24} stroke={1.6} />
                    </span>
                    <span className="bt-hcat-t">{pick(category.label, locale, category.key)}</span>
                    <span className="bt-hcat-n">{t('home_cat_n', { n: count })}</span>
                    <Icon name="arrow" size={18} className="flip bt-hcat-go" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 6 — activities & events */}
      {(featured.length > 0 || events.length > 0) && (
        <section className="bt-band bt-band-ivory" aria-labelledby="home-activities">
          <div className="wrap">
            <PremiumHead
              id="home-activities"
              kicker={t('navr_act')}
              title={t('ha_title')}
              sub={t('ah_sub')}
              action={<SectionLink href={ACTIVITIES_HREF} label={t('ha_all')} />}
            />
            <ul className="bt-hgrid n4" role="list">
              {featured.map((activity) => {
                const category = activity.categories[0]
                return (
                  <li key={activity.id}>
                    <GlimpseCard
                      href={activity.href}
                      image={activity.hero}
                      icon={category !== undefined ? categoryIcon(category) : 'compass'}
                      tag={
                        category !== undefined ? pick(category.label, locale, category.key) : null
                      }
                      title={pick(activity.name, locale, activity.slug)}
                      facts={[
                        pickOptional(activity.area, locale),
                        pickOptional(activity.duration, locale),
                      ]}
                      price={money(activity)}
                      rating={
                        activity.rating !== null
                          ? format.number(activity.rating, { maximumFractionDigits: 1 })
                          : null
                      }
                      t={t}
                    />
                  </li>
                )
              })}
              <li>
                <Link href={EVENTS_HREF} className="bt-hevents">
                  <span className="bt-hevents-ic" aria-hidden="true">
                    <Icon name="ticket" size={26} stroke={1.6} />
                  </span>
                  <span className="bt-hevents-t">{t('evp_title')}</span>
                  <span className="bt-hevents-b">{t('home_events_b')}</span>
                  {events.length > 0 && (
                    <span className="bt-hevents-n">{t('home_events_n', { n: events.length })}</span>
                  )}
                  <span className="bt-hevents-go">
                    {t('home_events_cta')}
                    <Icon name="arrow" size={16} className="flip" />
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </section>
      )}

      {/* 7 — itineraries */}
      {itineraries.length > 0 && (
        <section className="bt-band bt-band-ivory2" aria-labelledby="home-itineraries">
          <div className="wrap">
            <PremiumHead
              id="home-itineraries"
              kicker={t('navr_itin')}
              title={t('hi_title')}
              sub={t('ih_sub')}
              action={<SectionLink href="/itineraries" label={t('hi_all')} />}
            />
            <ul className="bt-hgrid" role="list">
              {itineraries.slice(0, GLIMPSE_COUNT).map((itinerary) => (
                <li key={itinerary.id}>
                  <GlimpseCard
                    href={itinerary.href}
                    image={itinerary.hero}
                    icon="route"
                    tag={t('c_days_n', { n: itinerary.days })}
                    title={pick(itinerary.name, locale, itinerary.slug)}
                    facts={[
                      itinerary.spots !== null ? t('hi_spots_n', { n: itinerary.spots }) : null,
                      itinerary.regions.length > 0
                        ? format.list(
                            itinerary.regions.map((region) =>
                              pick(region.label, locale, region.key),
                            ),
                          )
                        : null,
                    ]}
                    price={money(itinerary)}
                    rating={null}
                    t={t}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 8 — tour packages */}
      {packages.length > 0 && (
        <section className="bt-band bt-band-ivory" aria-labelledby="home-packages">
          <div className="wrap">
            <PremiumHead
              id="home-packages"
              kicker={t('navr_packages')}
              title={t('hp_title')}
              sub={t('ph_sub')}
              action={<SectionLink href="/packages" label={t('home_pkg_all')} />}
            />
            <ul className="bt-hgrid" role="list">
              {packages.slice(0, GLIMPSE_COUNT).map((pkg) => (
                <li key={pkg.id}>
                  <GlimpseCard
                    href={pkg.href}
                    image={pkg.hero}
                    icon="gem"
                    tag={t('c_days_n', { n: pkg.days })}
                    title={pick(pkg.name, locale, pkg.slug)}
                    facts={[
                      `${t('ph_maxg')} ${format.number(pkg.maxGuests)} ${t('ph_guests')}`,
                      pkg.driverIncluded ? t('home_pkg_driver') : null,
                    ]}
                    price={money(pkg)}
                    rating={null}
                    t={t}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 9 — driver */}
      <section className="bt-band bt-band-night" aria-labelledby="home-driver">
        <div className="wrap bt-hdrv">
          <div>
            <PremiumHead id="home-driver" kicker={t('navr_driver')} title={t('hd_title')} dark />
            <p className="bt-hmap-sub">{t('svc_drv_b')}</p>
            <ul className="bt-pchecks bt-hdrv-checks">
              {DRIVER_FEATURES.map((key) => (
                <li key={key}>
                  <span className="bt-pcheck" aria-hidden="true">
                    <Icon name="check" size={14} stroke={2.2} />
                  </span>
                  {t(key)}
                </li>
              ))}
            </ul>
            <Link href={DRIVER_HREF} className="bt-glowcta bt-hdrv-cta">
              <Icon name="car" size={19} />
              {driverFrom !== null
                ? t('home_driver_cta_from', { price: money(driverFrom) })
                : t('home_driver_cta')}
            </Link>
          </div>

          {vehicles.length > 0 && (
            <ul className="bt-hveh" role="list">
              {vehicles.map((vehicle) => (
                <li key={vehicle.id}>
                  <Link href={DRIVER_HREF} className="bt-hveh-card">
                    <span className="bt-hveh-ic" aria-hidden="true">
                      <Icon name={VEHICLE_ICON[vehicle.vehicleClass] ?? 'car'} size={26} />
                    </span>
                    <span className="bt-hveh-body">
                      <span className="bt-hveh-t">
                        {pick(vehicle.label, locale, vehicle.vehicleClass)}
                      </span>
                      <span className="bt-hveh-d">
                        <Icon name="users" size={14} />
                        {t('home_veh_pax', {
                          min: vehicle.minPassengers,
                          max: vehicle.maxPassengers,
                        })}
                      </span>
                    </span>
                    <span className="bt-hveh-price">
                      <span>{t('c_from')}</span>
                      <strong className="bt-money">
                        {formatPrice(vehicle.dayRateMinor, vehicle.currency, locale)}
                      </strong>
                      <span>{t('dp_perday')}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* 10 — custom trip */}
      <section className="bt-band bt-band-ivory2" aria-labelledby="home-custom">
        <div className="wrap">
          <Link href={CUSTOM_HREF} className="bt-hcustom">
            <Photo
              src={imageAt(pool, 3)?.url}
              srcSetAvif={imageAt(pool, 3)?.srcSetAvif}
              srcSetWebp={imageAt(pool, 3)?.srcSetWebp}
              sizes="100vw"
              alt=""
            />
            <span className="bt-hcustom-veil" aria-hidden="true" />
            <span className="bt-hcustom-body">
              <span className="bt-hcustom-ic" aria-hidden="true">
                <Icon name="sparkle" size={24} />
              </span>
              <span className="bt-hcustom-k">{t('svc_cust_t')}</span>
              <h2 id="home-custom" className="bt-hcustom-t">
                {t('home_custom_t')}
              </h2>
              <span className="bt-hcustom-b">{t('home_custom_b')}</span>
              <span className="bt-hcustom-cta">
                {t('hero_cta_2')}
                <Icon name="arrow" size={18} className="flip" />
              </span>
            </span>
          </Link>
        </div>
      </section>

      {/* 11 — Bali highlights */}
      {highlights.length >= 3 && (
        <section className="bt-band bt-band-ivory" aria-labelledby="home-places">
          <div className="wrap">
            <PremiumHead
              id="home-places"
              kicker={t('home_lm_k')}
              title={t('hl_title')}
              action={<SectionLink href="/explore" label={t('navr_explore')} />}
            />
            <ul className={`bt-bento n${highlights.length}`} role="list">
              {highlights.map((landmark, index) => {
                const name = pick(landmark.name, locale, landmark.slug)
                const type = pickOptional(landmark.type, locale)
                const region =
                  landmark.region === null
                    ? null
                    : pick(landmark.region.label, locale, landmark.region.key)
                return (
                  <li key={landmark.id} className={index === 0 ? 'bt-bento-big' : undefined}>
                    <Link href={landmarkHref(landmark)} className="bt-bento-tile">
                      <Photo
                        src={landmark.hero?.url}
                        srcSetAvif={landmark.hero?.srcSetAvif}
                        srcSetWebp={landmark.hero?.srcSetWebp}
                        sizes={index === 0 ? '(min-width: 900px) 50vw, 100vw' : '25vw'}
                        alt=""
                      />
                      <span className="bt-bento-ic" aria-hidden="true">
                        <Icon name="temple" size={18} />
                      </span>
                      <span className="bt-bento-cap">
                        <strong>{name}</strong>
                        {(type ?? region) !== null && (
                          <span>{[type, region].filter(Boolean).join(' · ')}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}

      {/* 12 — reviews */}
      {(reviews.length > 0 || trust.rating !== null) && (
        <section className="bt-band bt-band-ivory2" aria-labelledby="home-reviews">
          <div className="wrap">
            <PremiumHead
              id="home-reviews"
              kicker={t('ab_trust_t')}
              title={t('hr_title')}
              action={<SectionLink href="/reviews" label={t('home_rv_all')} />}
            />

            {trust.rating !== null && (
              <div className="bt-rsummary bt-hrsummary">
                <span className="bt-rsummary-v">
                  {format.number(trust.rating, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </span>
                <span>
                  <Stars value={trust.rating} />
                  <span className="bt-rsummary-l">{t('hero_stat_rating')}</span>
                </span>
              </div>
            )}

            {reviews.length > 0 && (
              <ul className="bt-rcards" role="list">
                {reviews.map(({ review, activity }) => (
                  <ReviewTile
                    key={review.id}
                    review={review}
                    href={activity.href}
                    about={pick(activity.name, locale, activity.slug)}
                    locale={locale}
                    format={format}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* 13 — articles */}
      {articles.length > 0 && (
        <section className="bt-band bt-band-ivory" aria-labelledby="home-articles">
          <div className="wrap">
            <PremiumHead
              id="home-articles"
              kicker={t('navr_blog')}
              title={t('hb_title')}
              sub={t('bh_sub')}
              action={<SectionLink href="/blog" label={t('home_blog_all')} />}
            />
            <ul className="bt-hgrid" role="list">
              {articles.map((article) => (
                <li key={article.id}>
                  <GlimpseCard
                    href={article.href}
                    image={article.hero}
                    icon="book"
                    tag={
                      article.category !== null
                        ? pick(article.category.label, locale, article.category.key)
                        : null
                    }
                    title={pick(article.title, locale, article.slug)}
                    facts={[pickOptional(article.excerpt, locale)]}
                    price={null}
                    rating={null}
                    cta={t('bh_read')}
                    t={t}
                  />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

/**
 * Section heading: a short coloured kicker, a large headline, an optional
 * one-line standfirst, and the section's "view all" link. Sentence case
 * throughout; Latin gets tight tracking, Arabic none (premium.css).
 */
function PremiumHead({
  id,
  kicker,
  title,
  sub,
  centered = false,
  dark = false,
  action,
}: {
  id: string
  kicker: string
  title: string
  sub?: string
  centered?: boolean
  dark?: boolean
  action?: ReactNode
}) {
  const className = ['bt-phead', centered ? 'is-center' : null, dark ? 'is-dark' : null]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={className}>
      <div>
        <p className="bt-phead-k">{kicker}</p>
        <h2 id={id} className="bt-phead-t">
          {title}
        </h2>
        {sub !== undefined && <p className="bt-phead-s">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

/** The section's own-page button: a quiet outlined pill with an arrow. */
function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="bt-hsee">
      {label}
      <Icon name="arrow" size={16} className="flip" />
    </Link>
  )
}

/** Five stars, filled to the value. Decorative — the number beside it is read. */
function Stars({ value, light = false }: { value: number; light?: boolean }) {
  const percent = (Math.min(5, Math.max(0, value)) / 5) * 100
  return (
    <span className={light ? 'bt-stars is-light' : 'bt-stars'} aria-hidden="true">
      <span className="bt-stars-track">★★★★★</span>
      <span className="bt-stars-fill" style={{ width: `${percent}%` }}>
        ★★★★★
      </span>
    </span>
  )
}

/**
 * The home page's one card: a photo, an icon chip, a title, two facts and a
 * price (or a read-more line). The whole card is a single link — nothing
 * inside it is interactive, so there is one tab stop and one target.
 */
function GlimpseCard({
  href,
  image,
  icon,
  tag,
  title,
  facts,
  price,
  rating,
  cta,
  t,
}: {
  href: string
  image: MediaDto | null
  icon: IconName
  tag: string | null
  title: string
  facts: readonly (string | null)[]
  price: string | null
  rating: string | null
  cta?: string
  t: Translator
}) {
  const shown = facts.filter((fact): fact is string => fact !== null && fact !== '')
  return (
    <Link href={href} className="bt-gcard">
      <span className="bt-gcard-media">
        <Photo
          src={image?.url}
          srcSetAvif={image?.srcSetAvif}
          srcSetWebp={image?.srcSetWebp}
          sizes="(min-width: 980px) 33vw, (min-width: 640px) 50vw, 100vw"
          alt=""
        />
        {tag !== null && <span className="bt-gcard-tag">{tag}</span>}
        {rating !== null && (
          <span className="bt-gcard-rate">
            <span aria-hidden="true">★</span> {rating}
          </span>
        )}
      </span>
      <span className="bt-gcard-ic" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <span className="bt-gcard-body">
        <span className="bt-gcard-t">{title}</span>
        {shown.length > 0 && (
          <span className="bt-gcard-facts">
            {shown.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </span>
        )}
        <span className="bt-gcard-foot">
          {price !== null ? (
            <span className="bt-gcard-price">
              <span>{t('c_from')}</span>
              <strong className="bt-money">{price}</strong>
            </span>
          ) : (
            <span />
          )}
          <span className="bt-gcard-go">
            {cta ?? t('c_view')}
            <Icon name="arrow" size={15} className="flip" />
          </span>
        </span>
      </span>
    </Link>
  )
}

function ReviewTile({
  review,
  href,
  about,
  locale,
  format,
}: {
  review: ReviewDto
  href: string
  about: string
  locale: Locale
  format: Formatter
}) {
  const body = pickOptional(review.body, locale)
  const country = pickOptional(review.authorCountry, locale)
  const date = format.dateTime(new Date(review.createdAt), { dateStyle: 'medium' })

  return (
    <li>
      <Link href={href} className="bt-rcard bt-hrcard">
        <span className="bt-rcard-head">
          <span className="bt-rcard-av" aria-hidden="true">
            {firstGrapheme(review.authorName)}
          </span>
          <span>
            <strong>{review.authorName}</strong>
            <span className="bt-rcard-meta">
              {date}
              {country !== null && <span> · {country}</span>}
            </span>
          </span>
          <span className="bt-hrcard-q" aria-hidden="true">
            <Icon name="quote" size={22} />
          </span>
        </span>
        <span className="bt-rcard-stars" role="img" aria-label={`${review.stars}/5`}>
          <Stars value={review.stars} />
        </span>
        {body !== null && <span className="bt-rcard-b">{body}</span>}
        <span className="bt-hrcard-about">
          <Icon name="compass" size={15} />
          {about}
        </span>
      </Link>
    </li>
  )
}
