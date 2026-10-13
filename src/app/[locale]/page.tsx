/**
 * Homepage.
 *
 * A faithful port of design/handoff/sections-bt/page-home.jsx — all thirteen
 * sections, in the README's strict order:
 *
 *   1 hero + 4 stat cards      8 itineraries (4-up)
 *   2 platform intro           9 how it works (--forest)
 *   3 five platform cards     10 landmarks + region chips
 *   4 driver (--forest)       11 travelers love + collection chips
 *   5 activities + 7 chips    12 reviews carousel
 *   6 interactive map teaser  13 articles (3-up)
 *   7 packages (3-up)
 *
 * Everything on the page comes from the content layer. The prototype rendered
 * eleven hard-coded module-scope arrays and built its imagery out of
 * loremflickr search phrases; there is no invented content here and no
 * third-party image.
 *
 * A Server Component throughout. The only client code is the driver booking
 * card and the two chip filters, both of which receive server-rendered markup
 * as props — so all sixty-odd cards on this page stay on the server.
 *
 * `setRequestLocale` keeps the route statically renderable: nothing here reads
 * cookies or headers, so all three locales prerender at build time.
 */

import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import {
  ActivityCard,
  ArticleCard,
  ItineraryCard,
  LandmarkCard,
  PackageCard,
  ReviewCard,
} from '@/components/cards'
import { LinkButton, SectionHead } from '@/components/shared'
import { Icon, Photo, type IconName } from '@/components/ui'
import { isLocale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick } from '@/lib/content/localize'
import {
  listActivities,
  listArticles,
  listCategories,
  listItineraries,
  listLandmarks,
  listPackages,
  listRegions,
  reviewsForActivity,
} from '@/lib/content/queries'
import { trustStats, type TrustStats } from '@/lib/content/stats'
import type { ActivitySummary, CategoryDto, LandmarkDto, ReviewDto } from '@/lib/content/types'

import { pageMetadata } from './_meta'
import { CollectionTabs, type CollectionTab } from './_home/collection-tabs'
import { DriverBookingCard, type PickupArea } from './_home/driver-booking-card'
import { imageAt, imagePool } from './_ui/imagery'
import { CUSTOM_HREF } from './_ui/routes-extra'
import { ServiceCard } from './_ui/service-card'

// ---------------------------------------------------------------------------
// Section configuration, carried over from the handoff
// ---------------------------------------------------------------------------

/** Section 3 — the five platform pillars, in the design's order. */
const PLATFORM_SECTIONS: readonly { icon: IconName; title: string; body: string; href: string }[] =
  [
    { icon: 'car', title: 'navr_driver2', body: 'svc_drv_b', href: '/driver' },
    { icon: 'compass', title: 'svc_act_t', body: 'svc_act_b', href: '/activities' },
    { icon: 'pin', title: 'svc_map_t', body: 'svc_map_b', href: '/map' },
    { icon: 'star', title: 'svc_pkg_t', body: 'svc_pkg_b', href: '/packages' },
    { icon: 'cal', title: 'svc_itin_t', body: 'svc_itin_b', href: '/itineraries' },
  ]

/** Hero — the four kinds of place on the map, in the order a visitor meets them. */
const HERO_LEGEND: readonly { key: string; icon: IconName; tone: string }[] = [
  { key: 'hero_legend_free', icon: 'pin', tone: 'free' },
  { key: 'hero_legend_paid', icon: 'lock', tone: 'paid' },
  { key: 'hero_legend_vip', icon: 'star', tone: 'vip' },
  { key: 'hero_legend_gems', icon: 'gem', tone: 'gem' },
]

/** Section 4 — the 2x2 checked feature list beside the booking card. */
const DRIVER_FEATURES = ['dp_vp1', 'dp_vp2', 'dp_vp3', 'dp_vp5'] as const

/**
 * Section 5 — the seven category chips, by `categories.key`.
 *
 * Preferred order only: `orderedCategories` falls back to the taxonomy's own
 * `sort_order` for any key the database does not carry, so an editor renaming
 * a category degrades to a different chip rather than a missing one.
 */
const ACTIVITY_CHIP_KEYS = ['marine', 'adv', 'culture', 'family', 'spa', 'food', 'romantic']

/** Section 6 — the eight map category tiles. */
const MAP_CATEGORIES: readonly { key: string; icon: IconName }[] = [
  { key: 'hm_c1', icon: 'coffee' },
  { key: 'hm_c2', icon: 'coffee' },
  { key: 'hm_c3', icon: 'wave' },
  { key: 'hm_c4', icon: 'pin' },
  { key: 'hm_c5', icon: 'compass' },
  { key: 'hm_c6', icon: 'tag' },
  { key: 'hm_c7', icon: 'sparkle' },
  { key: 'hm_c8', icon: 'route' },
]

/** Section 6 — pin positions on the map teaser, as percentages. */
const MAP_PINS: readonly (readonly [number, number])[] = [
  [22, 30],
  [38, 58],
  [55, 26],
  [68, 64],
  [80, 40],
  [46, 80],
  [88, 72],
  [14, 64],
]

/** Section 9 — the four how-it-works steps. */
const HOW_STEPS: readonly { icon: IconName; key: string }[] = [
  { icon: 'compass', key: 'hw_1' },
  { icon: 'cal', key: 'hw_2' },
  { icon: 'cart', key: 'hw_3' },
  { icon: 'check', key: 'hw_4' },
]

/** Section 11 — the six "travelers love" collections, by `categories.key`. */
const LOVED_KEYS = ['food', 'cafe', 'beach', 'adv', 'family', 'romantic']

/** How many featured activities section 5 shows. */
const FEATURED_ACTIVITY_COUNT = 6

/** How many itineraries the 4-up grid shows before "see all". */
const ITINERARY_PREVIEW_COUNT = 8

/** How many articles the closing 3-up grid shows. */
const ARTICLE_PREVIEW_COUNT = 3

/** How many reviews the carousel holds. */
const REVIEW_COUNT = 9

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a preferred list of category keys against the live taxonomy,
 * padding from `sort_order` when a key is absent.
 */
function orderedCategories(
  all: readonly CategoryDto[],
  preferred: readonly string[],
  count: number,
): CategoryDto[] {
  const byKey = new Map(all.map((category) => [category.key, category]))
  const out: CategoryDto[] = []
  const taken = new Set<string>()

  for (const key of preferred) {
    const found = byKey.get(key)
    if (found === undefined || taken.has(found.key)) continue
    taken.add(found.key)
    out.push(found)
  }

  for (const category of all) {
    if (out.length >= count) break
    // 'all' is a UI sentinel in the design's filter bars, not a real category.
    if (category.key === 'all' || taken.has(category.key)) continue
    taken.add(category.key)
    out.push(category)
  }

  return out.slice(0, count)
}

/** Group landmarks by region key, preserving the query's sort inside a group. */
function groupByRegion(landmarks: readonly LandmarkDto[]): Map<string, LandmarkDto[]> {
  const out = new Map<string, LandmarkDto[]>()
  for (const landmark of landmarks) {
    const key = landmark.region?.key ?? ''
    if (key === '') continue
    const list = out.get(key) ?? []
    list.push(landmark)
    out.set(key, list)
  }
  return out
}

/** Newest first, across every activity's review set. */
function newestFirst(a: ReviewDto, b: ReviewDto): number {
  return b.createdAt.localeCompare(a.createdAt)
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

  const [regions, categories, featured, packages, itineraries, landmarks, articles, trust] =
    await Promise.all([
      listRegions(),
      listCategories(),
      listActivities({ sort: 'top', limit: FEATURED_ACTIVITY_COUNT, locale }),
      listPackages(),
      listItineraries(),
      listLandmarks(),
      listArticles({ limit: ARTICLE_PREVIEW_COUNT, locale }),
      trustStats(),
    ])

  const lovedCategories = orderedCategories(categories, LOVED_KEYS, 6)

  const [lovedLists, reviewGroups] = await Promise.all([
    Promise.all(
      lovedCategories.map((category) =>
        listActivities({ categoryKey: category.key, sort: 'top', limit: 3, locale }),
      ),
    ),
    // Reviews are written about an activity, so the homepage carousel is the
    // union of the featured activities' own reviews. The handoff filtered a
    // shared pool by tag and fell back to `slice(0, 3)`, which displayed
    // reviews of one experience underneath another.
    Promise.all(featured.map((activity) => reviewsForActivity(activity.id))),
  ])

  const reviews = reviewGroups.flat().sort(newestFirst).slice(0, REVIEW_COUNT)

  const chipCategories = orderedCategories(categories, ACTIVITY_CHIP_KEYS, 7)

  const landmarksByRegion = groupByRegion(landmarks)

  // Editorial imagery: hero photographs borrowed from published records, most
  // on-topic list first. See ./_ui/imagery.ts.
  const pool = imagePool(landmarks, featured, packages, itineraries, articles)

  const pickupAreas: PickupArea[] = regions.map((region) => ({
    key: region.key,
    label: pick(region.label, locale, region.key),
  }))

  return (
    <main>
      <HeroSection
        image={imageAt(pool, 0)}
        regionCount={regions.length}
        trust={trust}
        t={t}
        formatNumber={(value, options) => format.number(value, options)}
      />

      {/* 2 — platform intro */}
      <section className="bg-ivory" aria-labelledby="home-intro">
        <div className="wrap bt-home-intro">
          <h2 id="home-intro" className="section-title">
            {t('ab_hero_t')}
          </h2>
          <p className="lede">{t('about_p1')}</p>
        </div>
      </section>

      {/* 3 — the five platform sections */}
      <section className="bg-ivory-2">
        <div className="wrap">
          <SectionHead title={t('hs_title')} />
          <div className="bt-fivegrid">
            {PLATFORM_SECTIONS.map((section, index) => (
              <ServiceCard
                key={section.href}
                icon={section.icon}
                title={t(section.title)}
                body={t(section.body)}
                image={imageAt(pool, index + 1)}
                href={section.href}
                cta={t('c_more')}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 4 — driver, with the inline booking card */}
      <section className="bg-forest" aria-labelledby="home-driver">
        <div className="wrap bt-hdriver">
          <div>
            <div className="eyebrow" style={{ color: 'var(--palm)' }}>
              <span
                aria-hidden="true"
                style={{ width: 18, height: 2, background: 'var(--palm)', borderRadius: 2 }}
              />
              {t('navr_driver2')}
            </div>
            <h2
              id="home-driver"
              className="section-title"
              style={{ color: 'var(--ivory)', marginTop: 12 }}
            >
              {t('hd_title')}
            </h2>
            <p className="lede" style={{ marginTop: 14 }}>
              {t('hd_sub')}
            </p>
            <div className="bt-driverteaser-feats">
              {DRIVER_FEATURES.map((key) => (
                <span key={key} className="bt-dtf">
                  <Icon name="check" size={15} color="var(--palm)" /> {t(key)}
                </span>
              ))}
            </div>
          </div>

          <DriverBookingCard areas={pickupAreas} href="/driver" />
        </div>
      </section>

      {/* 5 — activities & events */}
      <section className="bg-ivory">
        <div className="wrap">
          <SectionHead
            title={t('ha_title')}
            action={<SeeAll href="/activities" label={t('ha_all')} />}
          />

          <div
            className="bt-filterchips"
            style={{ marginBottom: 28 }}
            role="group"
            aria-label={t('ev_eyebrow')}
          >
            {chipCategories.map((category) => (
              <Link
                key={category.key}
                href={`/activities?cat=${encodeURIComponent(category.key)}`}
                className="chip"
                style={{ minHeight: 44 }}
              >
                {category.icon !== null && (
                  <Icon name={category.icon} size={15} color="var(--forest)" />
                )}
                {pick(category.label, locale, category.key)}
              </Link>
            ))}
          </div>

          <ActivityGrid activities={featured} empty={t('ah_none')} />
        </div>
      </section>

      {/* 6 — interactive map teaser */}
      <section className="bg-ivory-2">
        <div className="wrap">
          <SectionHead title={t('hm_title')} subtitle={t('hm_sub')} />

          {/*
            A link, not the handoff's <button onClick={navigate}> — the map is
            the product's headline feature and this is the largest call to
            action on the page.
          */}
          <Link href="/map" className="bt-bigmap" aria-label={t('hm_cta')}>
            <Photo
              src={imageAt(pool, 6)?.url}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
            <span className="bt-bigmap-veil" />
            <span className="bt-bigmap-pins" aria-hidden="true">
              {MAP_PINS.map(([x, y], index) => (
                <span
                  key={`${x}-${y}`}
                  className="bt-bigmap-pin"
                  style={{
                    // Logical inset so the constellation mirrors under RTL,
                    // matching the negative inline margin in components.css.
                    insetInlineStart: `${x}%`,
                    top: `${y}%`,
                    animationDelay: `${index * 0.25}s`,
                  }}
                >
                  <Icon name="pin" size={16} color="#fff" />
                </span>
              ))}
            </span>
            <span className="bt-bigmap-cta">
              <span className="btn btn-orange" style={{ pointerEvents: 'none' }}>
                <Icon name="pin" size={18} color="#fff" /> {t('hm_cta')}
              </span>
            </span>
          </Link>

          <div className="bt-mapcats">
            {MAP_CATEGORIES.map((category) => (
              <Link key={category.key} href="/map" className="bt-mapcat">
                <Icon name={category.icon} size={19} color="var(--forest)" />
                <span>{t(category.key)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 7 — ready packages */}
      <section className="bg-ivory">
        <div className="wrap">
          <SectionHead
            title={t('hp_title')}
            action={<SeeAll href="/packages" label={t('c_seeall')} />}
          />
          {packages.length === 0 ? (
            <EmptyRow>{t('ah_none')}</EmptyRow>
          ) : (
            <div className="grid bt-grid-3auto">
              {packages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 8 — itineraries */}
      <section className="bg-ivory-2">
        <div className="wrap">
          <SectionHead
            title={t('hi_title')}
            action={<SeeAll href="/itineraries" label={t('hi_all')} />}
          />
          {itineraries.length === 0 ? (
            <EmptyRow>{t('ah_none')}</EmptyRow>
          ) : (
            <div className="grid bt-grid-4">
              {itineraries.slice(0, ITINERARY_PREVIEW_COUNT).map((itinerary) => (
                <ItineraryCard key={itinerary.id} itinerary={itinerary} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 9 — how it works */}
      <section className="bg-forest" aria-labelledby="home-how">
        <div className="wrap">
          <div className="center" style={{ marginBottom: 40 }}>
            <h2 id="home-how" className="section-title" style={{ color: 'var(--ivory)' }}>
              {t('hw_title')}
            </h2>
          </div>
          <ol className="bt-howgrid" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {HOW_STEPS.map((step, index) => (
              <li key={step.key} className="bt-howstep">
                <span className="bt-howstep-n" aria-hidden="true">
                  {format.number(index + 1)}
                </span>
                <span className="bt-howstep-ic">
                  <Icon name={step.icon} size={24} color="var(--palm)" />
                </span>
                <span className="bt-howstep-t">{t(step.key)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 10 — landmarks, filtered by region */}
      <section className="bg-ivory">
        <div className="wrap">
          <SectionHead title={t('hl_title')} />
          <CollectionTabs
            idPrefix="home-landmarks"
            empty={<EmptyRow>{t('ah_none')}</EmptyRow>}
            tabs={[
              { key: 'all', label: t('hl_allregions') },
              ...regions.map(
                (region): CollectionTab => ({
                  key: region.key,
                  label: pick(region.label, locale, region.key),
                }),
              ),
            ]}
            panels={{
              all: <LandmarkGrid landmarks={landmarks} empty={t('ah_none')} />,
              ...Object.fromEntries(
                regions.map((region) => [
                  region.key,
                  <LandmarkGrid
                    key={region.key}
                    landmarks={landmarksByRegion.get(region.key) ?? []}
                    empty={t('ah_none')}
                  />,
                ]),
              ),
            }}
          />
        </div>
      </section>

      {/* 11 — travelers love */}
      <section className="bg-ivory-2">
        <div className="wrap">
          <SectionHead title={t('hv_title')} />
          <CollectionTabs
            idPrefix="home-loved"
            empty={<EmptyRow>{t('ah_none')}</EmptyRow>}
            tabs={lovedCategories.map(
              (category): CollectionTab => ({
                key: category.key,
                label: pick(category.label, locale, category.key),
                icon: category.icon,
              }),
            )}
            panels={Object.fromEntries(
              lovedCategories.map((category, index) => [
                category.key,
                <ActivityGrid
                  key={category.key}
                  activities={lovedLists[index] ?? []}
                  empty={t('ah_none')}
                />,
              ]),
            )}
          />
        </div>
      </section>

      {/* 12 — reviews */}
      <section className="bg-ivory">
        <div className="wrap">
          <SectionHead title={t('hr_title')} />
          {reviews.length === 0 ? (
            <EmptyRow>{t('ah_none')}</EmptyRow>
          ) : (
            <div className="hscroll" style={{ gap: 16 }}>
              {reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 13 — articles */}
      <section className="bg-ivory-2">
        <div className="wrap">
          <SectionHead
            title={t('hb_title')}
            action={<SeeAll href="/blog" label={t('c_seeall')} />}
          />
          {articles.length === 0 ? (
            <EmptyRow>{t('ah_none')}</EmptyRow>
          ) : (
            <div className="grid bt-grid-3auto">
              {articles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Sections and shared fragments
// ---------------------------------------------------------------------------

type FormatNumber = (value: number, options?: Intl.NumberFormatOptions) => string

/**
 * Section 1 — hero.
 *
 * The stat figures are measured (src/lib/content/stats.ts); one below its
 * meaningful minimum is omitted instead of shown as a design claim. Rendered
 * through the locale formatter, so Arabic gets Arabic-Indic digits.
 */
function HeroSection({
  image,
  regionCount,
  trust,
  t,
  formatNumber,
}: {
  image: ReturnType<typeof imageAt>
  regionCount: number
  trust: TrustStats
  t: (key: string) => string
  formatNumber: FormatNumber
}) {
  const stats: readonly { value: string; label: string }[] = [
    ...(trust.places > 0 ? [{ value: formatNumber(trust.places), label: t('ab_stat1') }] : []),
    { value: formatNumber(regionCount), label: t('ab_stat2') },
    ...(trust.rating !== null
      ? [
          {
            value: `${formatNumber(trust.rating, { maximumFractionDigits: 1 })}★`,
            label: t('ab_stat3'),
          },
        ]
      : []),
    ...(trust.trips !== null
      ? [{ value: formatNumber(trust.trips, { notation: 'compact' }), label: t('ab_stat4') }]
      : []),
  ]

  return (
    <section className="bt-hero" aria-labelledby="home-hero">
      <Photo
        src={image?.url}
        alt=""
        priority
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <div className="bt-hero-veil" aria-hidden="true" />

      <div className="wrap bt-hero-inner">
        <p className="bt-hero-kicker">{t('hero_kicker')}</p>

        <h1 id="home-hero" className="display bt-hero-title">
          <span>{t('hero_title_1')}</span> <span>{t('hero_title_2')}</span>
        </h1>

        <p className="bt-hero-sub">{t('hero_sub')}</p>

        <div className="bt-hero-ctas">
          <LinkButton href="/map" variant="orange" size="lg">
            <Icon name="pin" size={19} /> {t('hero_cta_1')}
          </LinkButton>
          <LinkButton href={CUSTOM_HREF} variant="light" size="lg">
            <Icon name="sparkle" size={19} color="var(--forest)" /> {t('hero_cta_2')}
          </LinkButton>
        </div>
      </div>

      {/*
        The map legend is the hero's signature: the four kinds of pin the
        product is built on, each a way into the map. The measured stats sit
        beside it as a quiet ledger instead of four glass tiles.
      */}
      <div className="bt-hero-foot">
        <div className="wrap bt-hero-foot-inner">
          <nav className="bt-hero-legend" aria-labelledby="home-hero-legend">
            <span id="home-hero-legend" className="bt-hero-legend-t">
              {t('hero_legend_t')}
            </span>
            <ul>
              {HERO_LEGEND.map((item) => (
                <li key={item.key}>
                  <Link href="/map" className="bt-hero-legend-item">
                    <span className={`bt-legend-pin ${item.tone}`} aria-hidden="true">
                      <Icon name={item.icon} size={14} />
                    </span>
                    {t(item.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {stats.length > 0 && (
            <dl className="bt-hero-ledger">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt>{stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </section>
  )
}

function ActivityGrid({
  activities,
  empty,
}: {
  activities: readonly ActivitySummary[]
  empty: string
}) {
  if (activities.length === 0) return <EmptyRow>{empty}</EmptyRow>

  return (
    <div className="grid bt-grid-3auto">
      {activities.map((activity) => (
        <ActivityCard key={activity.id} activity={activity} />
      ))}
    </div>
  )
}

function LandmarkGrid({ landmarks, empty }: { landmarks: readonly LandmarkDto[]; empty: string }) {
  if (landmarks.length === 0) return <EmptyRow>{empty}</EmptyRow>

  return (
    <div className="grid bt-grid-3auto">
      {landmarks.map((landmark) => (
        <LandmarkCard key={landmark.id} landmark={landmark} />
      ))}
    </div>
  )
}

/**
 * "See all" in a section head's trailing slot: one style for every band, so
 * the way out of a preview always looks the same.
 */
function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <LinkButton href={href} variant="ghost" size="sm" className="bt-seeall">
      {label}
    </LinkButton>
  )
}

/**
 * Empty state.
 *
 * The handoff rendered an empty grid when a filter matched nothing, which on a
 * page of full sections reads as a rendering failure rather than a result.
 */
function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="bt-empty">{children}</p>
}
