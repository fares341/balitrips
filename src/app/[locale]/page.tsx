/**
 * Homepage — v3.4 package (design-reference/prototype/home.html, screens 01-home).
 *
 * Sections, each with its data source and its own page:
 *
 *   hero            full-screen video slider (one clip on phones, four side by
 *                   side on desktop; media in _home/hero-media.ts), the place
 *                   name changing with each clip, search → /search?q=,
 *                   "Plan your trip" → /services
 *   planning today  photo + icon cards, one per service page (svc-cards.tsx)
 *   in the mood     free map places by category (listMapPlaces, redacted for
 *                   an anonymous visitor) as photo cards → /places/…
 *   most requested  photo cards of the top activities only (client; events
 *                   excluded); a swipe row on phones/tablets, three per row
 *                   on desktop
 *   who we are      short strip: image marquee + three values → /about
 *   reviews         the top activities' own reviews in two endless rows
 *                   moving in opposite directions (hidden when none)
 *   custom trip     → /custom, /contact (photo: _home/media.ts)
 *   blog            the three latest articles, magazine layout → /blog/…
 *
 * Nothing is invented: every name, price, rating and count comes from the
 * catalogue; a section with nothing real to show is left out. No numbered
 * cards (v3.3).
 *
 * `setRequestLocale` keeps the route statically renderable. The map data is
 * redacted with an empty entitlement set, so only free places (which every
 * visitor may see) are ever rendered here.
 */

import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'

import { LinkButton, SectionHead } from '@/components/bt'
import { ActivityCard, PlaceCard } from '@/components/cards'
import { Icon, Photo, type IconName } from '@/components/ui'
import { isLocale, type Locale } from '@/i18n/config'
import { getPathname, Link } from '@/i18n/routing'
import { EVENTS_CATEGORY_KEY } from '@/lib/content/extra-queries'
import { pick, pickOptional } from '@/lib/content/localize'
import {
  listActivities,
  listHomeActivities,
  listArticles,
  listMapPlaces,
  listMapTaxonomy,
  reviewsForActivity,
} from '@/lib/content/queries'
import type { ActivitySummary, ArticleSummary, ReviewDto } from '@/lib/content/types'
import { buildMapPayload, emptyEntitlements, type MapPlaceForClient } from '@/lib/entitlements'
import { suggestKeys, type SuggestEntry } from '@/lib/search/fuzzy'

import { pageMetadata } from './_meta'
import { AboutSlider } from './_home/about-slider'
import { HERO_CLIPS } from './_home/hero-media'
import { HeroSearch } from './_home/hero-search'
import { HeroVideo } from './_home/hero-video'
import { CUSTOM_TRIP_PHOTO } from './_home/media'
import { MoodTabs, type MoodTab } from './_home/mood-tabs'
import { SvcCards } from './_home/svc-cards'
import { CUSTOM_HREF } from './_ui/routes-extra'

type OpenPlace = Extract<MapPlaceForClient, { locked: false }>

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CATALOGUE_LIMIT = 40
/** Activities the hero search can suggest (names only travel with the page). */
const SUGGEST_ACTIVITY_LIMIT = 120
/** Places per mood tab. */
const MOOD_CARD_COUNT = 4
const MOOD_TAB_LIMIT = 7
/** Cards shown per tab. */
const MR_SHOWN = 6
const REVIEW_SOURCE_COUNT = 8
const REVIEW_COUNT = 10
/** Each marquee half holds at least this many cards so the loop never shows a gap. */
const MARQUEE_MIN = 6
const BLOG_COUNT = 3

/** "What are you planning today?" — one card per service page (no driver: v3.2). */
const SERVICES: readonly { href: string; icon: IconName; image: string; key: string }[] = [
  { href: '/map', icon: 'map', image: '/map/bali-satellite.webp', key: 'map' },
  { href: '/activities', icon: 'compass', image: '/brand/jeep.jpg', key: 'act' },
  { href: '/itineraries', icon: 'doc', image: '/brand/rice-walk.jpg', key: 'itin' },
  { href: '/packages', icon: 'box', image: '/brand/green-dress.jpg', key: 'pkg' },
  { href: CUSTOM_HREF, icon: 'wand', image: '/brand/polaroids.webp', key: 'cust' },
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

/** Repeat a short list until it has at least `min` entries. */
function fill<T>(items: readonly T[], min: number): T[] {
  if (items.length === 0) return []
  const out = [...items]
  while (out.length < min) out.push(...items)
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

  const [catalogue, mapPlaces, taxonomy, articles, allActivities, homePicks] = await Promise.all([
    listActivities({ sort: 'top', limit: CATALOGUE_LIMIT, locale }),
    listMapPlaces(),
    listMapTaxonomy(),
    listArticles({ limit: BLOG_COUNT, locale }),
    listActivities({ sort: 'top', limit: SUGGEST_ACTIVITY_LIMIT, locale }),
    // "Don't miss": the owner's picks (Studio "show on home", in their order),
    // topped up with the best-rated activities. Events stay off this row.
    listHomeActivities({
      limit: MR_SHOWN,
      locale,
      exclude: (activity) => inCategory(activity, EVENTS_CATEGORY_KEY),
    }),
  ])

  // --- most requested: activities only (client) ------------------------------
  const requestedActivities = homePicks

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
  const half = Math.ceil(reviews.length / 2)
  const rowA = fill(reviews, MARQUEE_MIN)
  const rowB = fill([...reviews.slice(half), ...reviews.slice(0, half)], MARQUEE_MIN)
  const reviewTiles = (row: typeof reviews, copy: boolean, keyPrefix: string) =>
    row.map(({ review, activity }, index) => (
      <ReviewTile
        key={`${keyPrefix}-${index}-${review.id}`}
        review={review}
        href={activity.href}
        about={pick(activity.name, locale, activity.slug)}
        locale={locale}
        verifiedLabel={t('hv3_rv_verified')}
        copy={copy}
      />
    ))

  // --- map places (free only: redacted for an anonymous visitor) ------------
  const openPlaces = buildMapPayload(mapPlaces, emptyEntitlements()).places.filter(isOpen)

  const usedCategories = taxonomy.categories.filter((category) =>
    openPlaces.some((place) => place.categoryKey === category.key),
  )

  const placeCards = (places: readonly OpenPlace[]) => (
    <div className="grid fs-grid">
      {places.slice(0, MOOD_CARD_COUNT).map((place) => (
        <PlaceCard key={place.id} place={place} showFree={false} />
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

  // --- hero search suggestions ------------------------------------------------
  // Matched in the browser (hero-search.tsx): every locale's name is a key,
  // so "ubud" and «أوبود» both find it. Only what any visitor may already
  // see: region and type names, published activities, free places.
  const names = (text: Partial<Record<string, string | null>> | null | undefined) =>
    Object.values(text ?? {})
  const regionLabel = new Map(
    taxonomy.regions.map((region) => [region.key, pick(region.label, locale, region.key)]),
  )
  const placeCategoryKeys = new Set(mapPlaces.map((place) => place.categoryKey))
  const suggestions: SuggestEntry[] = [
    ...taxonomy.regions.map((region) => ({
      id: `r:${region.key}`,
      kind: 'region' as const,
      label: pick(region.label, locale, region.key),
      sub: region.parentKey !== null ? (regionLabel.get(region.parentKey) ?? null) : null,
      href: getPathname({ href: { pathname: '/map', query: { region: region.key } }, locale }),
      keys: suggestKeys([...names(region.label), region.key]),
    })),
    ...taxonomy.categories
      .filter((category) => placeCategoryKeys.has(category.key))
      .map((category) => ({
        id: `c:${category.key}`,
        kind: 'category' as const,
        label: pick(category.label, locale, category.key),
        sub: null,
        href: getPathname({ href: { pathname: '/map', query: { cat: category.key } }, locale }),
        keys: suggestKeys([...names(category.label), category.key]),
      })),
    ...allActivities.map((activity) => ({
      id: `a:${activity.id}`,
      kind: 'activity' as const,
      label: pick(activity.name, locale, activity.slug),
      sub:
        activity.region !== null ? pick(activity.region.label, locale, activity.region.key) : null,
      href: getPathname({ href: activity.href, locale }),
      keys: suggestKeys([...names(activity.name), activity.slug]),
    })),
    ...openPlaces.map((place) => ({
      id: `p:${place.id}`,
      kind: 'place' as const,
      label: pick(place.name, locale, place.slug),
      sub: pickOptional(place.regionLabel, locale),
      href: getPathname({ href: `/places/${encodeURIComponent(place.slug)}`, locale }),
      keys: suggestKeys([...names(place.name), place.slug]),
    })),
  ]

  // Hero sentence, word by word (each word rises in after "Bali").
  const words: { text: string; em: boolean }[] = [
    ...t('hv4_sub_a')
      .split(/\s+/)
      .map((text) => ({ text, em: false })),
    ...t('hv4_sub_em')
      .split(/\s+/)
      .map((text) => ({ text, em: true })),
    ...t('hv4_sub_b')
      .split(/\s+/)
      .map((text) => ({ text, em: false })),
  ].filter((word) => word.text !== '')

  return (
    <main className="home-v3">
      {/* 1 — hero: full-screen video slider */}
      <HeroVideo
        labelledBy="hero-h"
        clips={HERO_CLIPS.map((clip) => ({
          id: clip.id,
          webm: clip.webm,
          mp4: clip.mp4,
          poster: clip.poster,
          label: t(clip.label),
          short: t(clip.short),
        }))}
        pauseLabel={t('hv3_vid_pause')}
        playLabel={t('hv3_vid_play')}
        tabsLabel={t('hv4_tabs_label')}
      >
        <h1 className="hv-title" id="hero-h">
          <span className="hv-bali">{t('hv4_bali')}</span>
          <span className="hv-sub">
            {words.map((word, index) => {
              const span = (
                <span key={index} className="w" style={{ '--i': index } as CSSProperties}>
                  {word.text}
                </span>
              )
              return (
                <span key={index}>
                  {index > 0 ? ' ' : null}
                  {word.em ? <em>{span}</em> : span}
                </span>
              )
            })}
          </span>
        </h1>
        <p className="hv-lede">{t('hv4_lede')}</p>
        <HeroSearch
          action={searchAction}
          entries={suggestions}
          labels={{
            label: t('hv3_search_label'),
            placeholder: t('hv4_search_ph'),
            submit: t('hv4_search_btn'),
            searchFor: t('hv5_sg_all', { q: '{q}' }),
            count: t('hv5_sg_count', { n: '{n}' }),
            kinds: {
              region: t('hv5_sg_region'),
              category: t('hv5_sg_category'),
              activity: t('hv5_sg_activity'),
              place: t('hv5_sg_place'),
            },
          }}
        />
        <Link className="hv-link" href="/services">
          {t('hv3_cta_plan')} <Icon name="arrow" size={16} stroke={2.2} className="flip" />
        </Link>
      </HeroVideo>

      {/* 2 — what are you planning today? (icon cards only here: v3.3) */}
      <section className="sec-tight svc-sec" aria-labelledby="qd-h">
        <div className="wrap">
          <div className="svc-head">
            <span className="eyebrow">{t('hv4_svc_eyebrow')}</span>
            <h2 className="h2" id="qd-h">
              {t('hv3_qd_title')}
            </h2>
          </div>
          <SvcCards labelledBy="qd-h">
            {SERVICES.map((service, index) => (
              <Link
                key={service.key}
                href={service.href}
                className="ncard"
                style={{ '--i': index } as CSSProperties}
              >
                <span className="nc-ph" aria-hidden="true">
                  <span className="clip">
                    {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand photo */}
                    <img src={service.image} alt="" loading="lazy" />
                  </span>
                  <span className="nc-ic">
                    <Icon name={service.icon} size={24} stroke={1.7} />
                  </span>
                </span>
                <span className="nc-b">
                  <b className="nc-t">{t(`hv4_svc_${service.key}_t`)}</b>
                  <span className="nc-d">{t(`hv4_svc_${service.key}_d`)}</span>
                  <span className="nc-go">
                    {t(`hv4_svc_${service.key}_go`)}{' '}
                    <Icon name="arrow" size={14} stroke={2.2} className="flip" />
                  </span>
                </span>
              </Link>
            ))}
          </SvcCards>
        </div>
      </section>

      {/* 3 — what are you in the mood for? */}
      {openPlaces.length > 0 && (
        <section className="sec" aria-labelledby="fs-h">
          <div className="wrap">
            <SectionHead
              id="fs-h"
              eyebrow={t('hv3_fs_eyebrow')}
              title={t('hv3_fs_title')}
              lede={t('hv4_fs_lede')}
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

      {/* 4 — most requested: activities only (client) */}
      {requestedActivities.length > 0 && (
        <section className="sec-tight bg-ivory2 mr-sec" aria-labelledby="mr-h">
          <div className="wrap">
            <SectionHead
              id="mr-h"
              eyebrow={t('hv4_mr_eyebrow')}
              title={t('hv4_mr_title')}
              action={
                <LinkButton href="/activities" variant="ghost">
                  {t('hv4_mr_all_act')}
                </LinkButton>
              }
            />
            <div className="mr-panel">
              <div className="mr-row">
                {requestedActivities.map((activity) => (
                  <div key={activity.id} className="mr-item">
                    <ActivityCard activity={activity} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 5 — who we are (short strip) */}
      <section className="sec" aria-labelledby="ab-h">
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
                  <span>
                    <b>{t(`hv3_ab_${value.key}_t`)}</b>
                    <span className="muted">{t(`hv4_ab_${value.key}_d`)}</span>
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

      {/* 6 — reviews: two endless rows, opposite directions (real reviews only) */}
      {reviews.length > 0 && (
        <section className="sec bg-ivory2 rv-sec" aria-labelledby="rv-h">
          <div className="wrap">
            <SectionHead
              id="rv-h"
              eyebrow={t('hv3_rv_eyebrow')}
              title={t('hv3_rv_title')}
              action={
                <Link className="link sec-link" href="/reviews">
                  {t('hv3_rv_all')} <Icon name="arrow" size={16} className="flip" />
                </Link>
              }
            />
          </div>
          <div className="rmarq" role="region" aria-label={t('hv4_rv_label')}>
            <ul className="rm-track" role="list">
              {reviewTiles(rowA, false, 'a')}
              {reviewTiles(rowA, true, 'a2')}
            </ul>
          </div>
          <div className="rmarq rev2" aria-hidden="true">
            <ul className="rm-track" role="list">
              {reviewTiles(rowB, true, 'b')}
              {reviewTiles(rowB, true, 'b2')}
            </ul>
          </div>
        </section>
      )}

      {/* 7 — custom trip */}
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

      {/* 8 — blog: three real articles, magazine layout */}
      {articles.length > 0 && (
        <section className="sec" aria-labelledby="bl-h">
          <div className="wrap">
            <SectionHead
              id="bl-h"
              eyebrow={t('hv4_bl_eyebrow')}
              title={t('hv4_bl_title')}
              action={
                <LinkButton href="/blog" variant="ghost">
                  {t('hv4_bl_all')}
                </LinkButton>
              }
            />
            <div className="blog">
              {articles.map((article, index) => (
                <BlogPost key={article.id} article={article} locale={locale} lead={index === 0} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

/** One article as a photo tile with its category and title → its own page. */
function BlogPost({
  article,
  locale,
  lead,
}: {
  article: ArticleSummary
  locale: Locale
  lead: boolean
}) {
  const title = pick(article.title, locale, article.slug)
  const excerpt = pickOptional(article.excerpt, locale)
  const category = article.category
    ? pick(article.category.label, locale, article.category.key)
    : null
  const date =
    article.publishedAt === null
      ? null
      : new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(new Date(article.publishedAt))
  return (
    <Link href={article.href} className="post">
      <Photo
        src={article.hero?.url}
        alt=""
        srcSetAvif={article.hero?.srcSetAvif}
        srcSetWebp={article.hero?.srcSetWebp}
        sizes={lead ? '(min-width: 760px) 640px, 100vw' : '(min-width: 760px) 480px, 100vw'}
      />
      <span className="pb">
        <span className="pm">
          {category !== null && <span className="tag">{category}</span>}
          {date !== null && <span dir="ltr">{date}</span>}
        </span>
        <h3>{title}</h3>
        {excerpt !== null && <span className="px">{excerpt}</span>}
      </span>
    </Link>
  )
}

/** One real review: stars, the activity it is about, the text and the author. */
function ReviewTile({
  review,
  href,
  about,
  locale,
  verifiedLabel,
  copy = false,
}: {
  review: ReviewDto
  href: string
  about: string
  locale: Locale
  verifiedLabel: string
  /** A marquee duplicate: hidden from assistive tech and out of the tab order. */
  copy?: boolean
}) {
  const body = pickOptional(review.body, locale)
  const country = pickOptional(review.authorCountry, locale)
  const stars = Math.max(0, Math.min(5, Math.round(review.stars)))

  return (
    <li aria-hidden={copy || undefined} inert={copy || undefined}>
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
