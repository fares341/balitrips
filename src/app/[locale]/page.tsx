/**
 * Homepage — v3, reshaped by client revision 1 ("too long, too distracting").
 *
 * A short page, each section with its data source and own page:
 *
 *   hero            4 arched video portals (public/brand/arch-*), search
 *                   (input + button) → /search?q=, CTAs → /explore, /custom
 *   planning today  6 service tiles → /map, /activities, /itineraries,
 *                   /packages, /driver, /custom
 *   in the mood     free map places by category (listMapPlaces, redacted for
 *                   an anonymous visitor) in compact cards → /places/…
 *   most requested  4 compact cards mixing the top activities (events
 *                   excluded) and packages → their own pages
 *   who we are      short strip: image marquee + three values → /about
 *   reviews         the top activities' own reviews (hidden when none)
 *   custom trip     → /custom, /contact (photo: _home/media.ts)
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

import { CompactCard, LinkButton, SectionHead, Stars, StepCards } from '@/components/bt'
import { FavButton } from '@/components/bt/fav-button'
import { ActivityCompact, PackageCompact } from '@/components/cards'
import { Icon, type IconName } from '@/components/ui'
import { isLocale, type Locale } from '@/i18n/config'
import { getPathname, Link } from '@/i18n/routing'
import { EVENTS_CATEGORY_KEY } from '@/lib/content/extra-queries'
import { pick, pickOptional } from '@/lib/content/localize'
import {
  listActivities,
  listMapPlaces,
  listMapTaxonomy,
  listPackages,
  reviewsForActivity,
} from '@/lib/content/queries'
import {
  entityHref,
  type ActivitySummary,
  type PackageSummary,
  type ReviewDto,
} from '@/lib/content/types'
import { buildMapPayload, emptyEntitlements, type MapPlaceForClient } from '@/lib/entitlements'
import { FEATURES } from '@/lib/features'

import { pageMetadata } from './_meta'
import { AboutSlider } from './_home/about-slider'
import { HeroArches, type Arch } from './_home/hero-arches'
import { CUSTOM_TRIP_PHOTO } from './_home/media'
import { MoodTabs, type MoodTab } from './_home/mood-tabs'
import { PLAN_STEPS } from './_home/plan-steps'
import { ReviewSlider } from './_home/review-slider'
import { CUSTOM_HREF } from './_ui/routes-extra'

type OpenPlace = Extract<MapPlaceForClient, { locked: false }>

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CATALOGUE_LIMIT = 40
/** Places per mood tab. */
const MOOD_CARD_COUNT = 4
const MOOD_TAB_LIMIT = 6
/** "Most requested": this many cards, alternating activity / package. */
const MOST_REQUESTED = 4
const REVIEW_SOURCE_COUNT = 8
const REVIEW_COUNT = 6

const ARCHES: readonly Arch[] = [
  { name: 'Ubud', video: 'arch-ubud', poster: '/brand/rice-walk.jpg' },
  { name: 'Nusa Penida', video: 'arch-penida', poster: '/brand/kelingking.jpg' },
  { name: 'Lempuyang', video: 'arch-lempuyang', poster: '/brand/lempuyang.jpg' },
  { name: 'Uluwatu', video: 'arch-uluwatu', poster: '/brand/cliff-beach.jpg' },
]

/** "What are you planning today?" — one tile per service page. */
const ALL_SERVICES: readonly { href: string; icon: IconName; key: string; tone?: 'orange' }[] = [
  { href: '/packages', icon: 'box', key: 'pkg' },
  { href: '/itineraries', icon: 'doc', key: 'itin' },
  { href: '/driver', icon: 'car', key: 'drv', tone: 'orange' },
  { href: '/activities', icon: 'compass', key: 'act', tone: 'orange' },
  { href: '/map', icon: 'map', key: 'map' },
  { href: CUSTOM_HREF, icon: 'wand', key: 'cust' },
]
const SERVICES = ALL_SERVICES.filter((service) => FEATURES.driver || service.href !== '/driver')

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

type Requested =
  | { kind: 'activity'; activity: ActivitySummary }
  | { kind: 'package'; pkg: PackageSummary }

/** Alternate the two lists (activity, package, …), topping up from either. */
function mostRequested(
  activities: readonly ActivitySummary[],
  packages: readonly PackageSummary[],
): Requested[] {
  const out: Requested[] = []
  let a = 0
  let p = 0
  while (out.length < MOST_REQUESTED && (a < activities.length || p < packages.length)) {
    const takeActivity = out.length % 2 === 0 ? a < activities.length : p >= packages.length
    if (takeActivity) {
      const activity = activities[a++]
      if (activity !== undefined) out.push({ kind: 'activity', activity })
    } else {
      const pkg = packages[p++]
      if (pkg !== undefined) out.push({ kind: 'package', pkg })
    }
  }
  return out
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

  const [catalogue, packages, mapPlaces, taxonomy] = await Promise.all([
    listActivities({ sort: 'top', limit: CATALOGUE_LIMIT, locale }),
    listPackages(),
    listMapPlaces(),
    listMapTaxonomy(),
  ])

  // --- most requested (activities without events, then packages) -----------
  const topActivities = catalogue.filter((activity) => !inCategory(activity, EVENTS_CATEGORY_KEY))
  const requested = mostRequested(topActivities, packages)

  // --- reviews ----------------------------------------------------------------
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

  const usedCategories = taxonomy.categories.filter((category) =>
    openPlaces.some((place) => place.categoryKey === category.key),
  )

  const placeCards = (places: readonly OpenPlace[]) => (
    <div className="cc-grid cc-g4">
      {places.slice(0, MOOD_CARD_COUNT).map((place) => (
        <PlaceCompact key={place.id} place={place} locale={locale} />
      ))}
    </div>
  )

  const moodTabs: MoodTab[] = usedCategories.slice(0, MOOD_TAB_LIMIT).map((category) => ({
    key: category.key,
    label: pick(category.label, locale, category.key),
  }))
  const moodPanels: Record<string, ReactNode> = {}
  for (const tab of moodTabs) {
    moodPanels[tab.key] = placeCards(openPlaces.filter((place) => place.categoryKey === tab.key))
  }
  const moodFallback =
    moodTabs.length === 0 && openPlaces.length > 0 ? placeCards(openPlaces) : null

  const searchAction = getPathname({ href: '/search', locale })

  return (
    <main className="home-v3">
      {/* 1 — hero */}
      <section className="hero" aria-labelledby="hero-h">
        <div className="arc" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">{t('hv3_hero_eyebrow')}</span>
            <h1 className="display hero-title" id="hero-h">
              {t.rich('hv3_hero_title', {
                l: (chunks) => <span className="hl">{chunks}</span>,
                em: (chunks) => <em>{chunks}</em>,
              })}
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
          </div>

          <HeroArches
            arches={ARCHES}
            pauseLabel={t('hv3_vid_pause')}
            playLabel={t('hv3_vid_play')}
          />
        </div>

        {/* What are you planning today? — one icon per service page */}
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

      {/* 2 — what are you in the mood for? */}
      {openPlaces.length > 0 && (
        <section className="sec-tight" aria-labelledby="fs-h">
          <div className="wrap">
            <SectionHead
              id="fs-h"
              eyebrow={t('hv3_fs_eyebrow')}
              title={t('hv3_fs_title')}
              action={
                <Link className="link sec-link" href="/map">
                  {t('hv3_fs_onmap')} <Icon name="arrow" size={16} className="flip" />
                </Link>
              }
            />
            {moodFallback ?? (
              <MoodTabs tabs={moodTabs} panels={moodPanels} label={t('hv3_fs_cats')} />
            )}
          </div>
        </section>
      )}

      {/* 3 — most requested (compact) */}
      {requested.length > 0 && (
        <section className="sec-tight bg-ivory2" aria-labelledby="mr-h">
          <div className="wrap">
            <SectionHead id="mr-h" title={t('hv3_mr_title')} lede={t('hv3_mr_lede')} />
            <ul className="cc-scroll" role="list">
              {requested.map((item) => (
                <li key={item.kind === 'activity' ? item.activity.id : item.pkg.id}>
                  {item.kind === 'activity' ? (
                    <ActivityCompact activity={item.activity} layout="tile" fav={false} />
                  ) : (
                    <PackageCompact pkg={item.pkg} layout="tile" fav={false} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 4 — who we are (short strip) */}
      <section className="sec-tight" aria-labelledby="ab-h">
        <div className="wrap about-grid">
          <AboutSlider up={SLIDER_UP} down={SLIDER_DOWN} />
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
                    <Icon name={value.icon} size={18} />
                  </span>
                  <b>{t(`hv3_ab_${value.key}_t`)}</b>
                </li>
              ))}
            </ul>
            <Link className="link about-more" href="/about">
              {t('hv3_ab_more')} <Icon name="arrow" size={16} className="flip" />
            </Link>
          </div>
        </div>
      </section>

      {/* 4b — plan your trip in steps (numbered cards; list in _home/plan-steps.ts) */}
      <section className="sec-tight bg-ivory2" aria-labelledby="st-h">
        <div className="wrap">
          <SectionHead
            id="st-h"
            eyebrow={t('hv3_st_eyebrow')}
            title={t('hv3_st_title')}
            lede={t('hv3_st_lede')}
          />
          <StepCards
            label={t('hv3_st_title')}
            items={PLAN_STEPS.filter((step) => FEATURES.driver || step.href !== '/driver').map(
              (step) => ({
                key: step.key,
                art: step.art,
                href: step.href,
                title: t(`hv3_st_${step.key}_t`),
                body: t(`hv3_st_${step.key}_d`),
              }),
            )}
          />
        </div>
      </section>

      {/* 5 — reviews (real only) */}
      {reviews.length > 0 && (
        <section className="sec-tight" aria-labelledby="rv-h">
          <div className="wrap">
            <SectionHead
              id="rv-h"
              eyebrow={t('hv3_rv_eyebrow')}
              title={t('hv3_rv_title')}
              lede={t('hv3_rv_lede')}
              action={
                <Link className="link sec-link" href="/reviews">
                  {t('hv3_rv_all')} <Icon name="arrow" size={16} className="flip" />
                </Link>
              }
            />
            <ReviewSlider
              label={t('hv3_rv_title')}
              prevLabel={t('hv3_rv_prev')}
              nextLabel={t('hv3_rv_next')}
            >
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
            </ReviewSlider>
          </div>
        </section>
      )}

      {/* 6 — custom trip */}
      <section className="sec-tight" aria-labelledby="ct-h">
        <div className="wrap">
          <div className="ct">
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand photo (CUSTOM_TRIP_PHOTO) */}
            <img src={CUSTOM_TRIP_PHOTO} alt="" loading="lazy" />
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
    </main>
  )
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

/** A free map place as a compact card → its own place page. */
function PlaceCompact({ place, locale }: { place: OpenPlace; locale: Locale }) {
  const category = pickOptional(place.category, locale)
  return (
    <CompactCard
      href={entityHref('place', place.slug)}
      title={pick(place.name, locale, place.slug)}
      description={pickOptional(place.description, locale)}
      image={{ src: place.heroImageUrl }}
      icon="pin"
      badge={category}
      meta={pickOptional(place.regionLabel, locale)}
      end={<Stars value={place.rating} />}
      fav={<FavButton kind="place" refId={place.id} />}
    />
  )
}

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
