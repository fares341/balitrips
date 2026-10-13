/**
 * Homepage.
 *
 * Structured after the reference site the owner chose — one calm, photo-led
 * story instead of thirteen catalogue bands — in our own brand colours:
 *
 *   1 hero: badge, headline, price anchor, one CTA, measured trust row
 *   2 what the map includes (six cards)
 *   3 three ways to plan, on the deep-forest band
 *   4 top-rated experiences (3-up)
 *   5 the island, place by place (photo bento of landmarks)
 *   6 private driver, with the inline booking card
 *   7 trusted by travelers (rating + reviews)
 *   8 questions before you go (FAQ)
 *
 * Everything shown is real: prices are the cheapest published itinerary and
 * plan, the trust row is `trustStats()` (each figure omitted below its
 * meaningful minimum), and reviews are the featured activities' own. Nothing
 * here quotes a platform rating we do not have.
 *
 * Packages, articles and the landmark/collection tab sets left the home page:
 * each is one tap away in the Menu drawer and the footer, and on this page
 * they repeated what the three "ways to plan" cards already say.
 *
 * The hero background is chosen in Studio → Configuration (`home` setting);
 * without one it falls back to published artwork on a forest gradient.
 *
 * `setRequestLocale` keeps the route statically renderable; the config action
 * revalidates it when the hero image changes.
 */

import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { ActivityCard } from '@/components/cards'
import { whatsappLink } from '@/components/layout/contact-config'
import { Accordion, LinkButton } from '@/components/shared'
import { Icon, Photo, type IconName } from '@/components/ui'
import { isLocale, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick, pickOptional } from '@/lib/content/localize'
import {
  listActivities,
  listItineraries,
  listLandmarks,
  listRegions,
  reviewsForActivity,
} from '@/lib/content/queries'
import { homeHeroImage } from '@/lib/content/site-media'
import { trustStats } from '@/lib/content/stats'
import type { MediaDto, ReviewDto } from '@/lib/content/types'
import { listPublishedPlans } from '@/lib/entitlements/plans'

import { pageMetadata } from './_meta'
import { DriverBookingCard, type PickupArea } from './_home/driver-booking-card'
import { imageAt, imagePool } from './_ui/imagery'
import { cheapest, formatPrice } from './_ui/price'
import { CUSTOM_HREF } from './_ui/routes-extra'

type Translator = Awaited<ReturnType<typeof getTranslations>>
type Formatter = Awaited<ReturnType<typeof getFormatter>>

// ---------------------------------------------------------------------------
// Section configuration
// ---------------------------------------------------------------------------

/** Section 2 — what the map gives you. Not a sequence, so not numbered. */
const INCLUDED: readonly { icon: IconName; title: string; body: string }[] = [
  { icon: 'pin', title: 'hero_stat_places', body: 'home_inc1_b' },
  { icon: 'clock', title: 'home_inc2_t', body: 'home_inc2_b' },
  { icon: 'gem', title: 'hero_legend_gems', body: 'home_inc3_b' },
  { icon: 'star', title: 'hero_legend_vip', body: 'home_inc4_b' },
  { icon: 'heart', title: 'sub_map_f4', body: 'home_inc5_b' },
  { icon: 'filter', title: 'home_inc6_t', body: 'home_inc6_b' },
]

/** Section 6 — the checked feature list beside the booking card. */
const DRIVER_FEATURES = ['dp_vp1', 'dp_vp2', 'dp_vp3', 'dp_vp5'] as const

/** Section 8 — question/answer key pairs. */
const FAQ = [1, 2, 3, 4, 5].map((n) => ({ q: `home_faq${n}_q`, a: `home_faq${n}_a` }))

const FEATURED_ACTIVITY_COUNT = 6
const EXPERIENCE_COUNT = 3
const BENTO_COUNT = 5
const REVIEW_COUNT = 3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Newest first, across every activity's review set. */
function newestFirst(a: ReviewDto, b: ReviewDto): number {
  return b.createdAt.localeCompare(a.createdAt)
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

  const [regions, featured, itineraries, landmarks, plans, trust, heroImage] = await Promise.all([
    listRegions(),
    listActivities({ sort: 'top', limit: FEATURED_ACTIVITY_COUNT, locale }),
    listItineraries(),
    listLandmarks(),
    listPublishedPlans(),
    trustStats(),
    homeHeroImage(),
  ])

  // Reviews are written about an activity, so the section shows the featured
  // activities' own reviews, newest first.
  const reviewGroups = await Promise.all(
    featured.map((activity) => reviewsForActivity(activity.id)),
  )
  const reviews = reviewGroups.flat().sort(newestFirst).slice(0, REVIEW_COUNT)

  // Editorial imagery borrowed from published records. See ./_ui/imagery.ts.
  const pool = imagePool(landmarks, featured, itineraries)

  const itineraryFrom = cheapest(itineraries)
  const planFrom = cheapest(plans)
  const money = (point: { priceMinor: number; currency: string }) =>
    formatPrice(point.priceMinor, point.currency, locale)

  const pickupAreas: PickupArea[] = regions.map((region) => ({
    key: region.key,
    label: pick(region.label, locale, region.key),
  }))

  const dayCounts = itineraries.map((itinerary) => itinerary.days).filter((days) => days > 0)
  const minDays = dayCounts.length > 0 ? Math.min(...dayCounts) : null
  const maxDays = dayCounts.length > 0 ? Math.max(...dayCounts) : null

  const bento = landmarks.filter((landmark) => landmark.hero !== null).slice(0, BENTO_COUNT)
  const wa = whatsappLink()

  return (
    <main className="bt-home">
      {/* 1 — hero */}
      <section className="bt-phero" aria-labelledby="home-hero">
        <div className="bt-phero-media" aria-hidden="true">
          {heroImage !== null ? (
            <Photo
              src={heroImage.url}
              srcSetAvif={heroImage.srcSetAvif}
              srcSetWebp={heroImage.srcSetWebp}
              sizes="100vw"
              alt=""
              priority
            />
          ) : (
            <Photo src={imageAt(pool, 0)?.url} alt="" priority className="is-artwork" />
          )}
        </div>
        <div
          className={heroImage !== null ? 'bt-phero-veil' : 'bt-phero-veil is-artwork'}
          aria-hidden="true"
        />

        <div className="wrap bt-phero-inner">
          <p className="bt-phero-badge">
            <Icon name="shield" size={16} />
            {t('home_badge')}
          </p>

          <h1 id="home-hero" className="bt-phero-title">
            {t.rich('home_h', { hl: (chunks) => <em className="bt-hl">{chunks}</em> })}
          </h1>

          <p className="bt-phero-sub">{t('home_sub')}</p>

          {(itineraryFrom !== null || planFrom !== null) && (
            <p className="bt-phero-anchor">
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
            </p>
          )}

          <Link href="/map" className="bt-glowcta">
            <Icon name="pin" size={19} />
            {t('hero_cta_1')}
          </Link>

          <TrustRow
            t={t}
            format={format}
            places={trust.places}
            regions={regions.length}
            rating={trust.rating}
            trips={trust.trips}
          />
        </div>

        <a href="#home-included" className="bt-phero-cue">
          <span>{t('c_explore')}</span>
          <Icon name="chevron" size={18} />
        </a>
      </section>

      {/* 2 — what the map includes */}
      <section
        className="bt-band bt-band-ivory"
        aria-labelledby="home-included-h"
        id="home-included"
      >
        <div className="wrap">
          <PremiumHead
            id="home-included-h"
            kicker={t('home_inc_kicker')}
            title={t('home_inc_title')}
            centered
          />
          <ul className="bt-incgrid">
            {INCLUDED.map((item) => (
              <li key={item.body} className="bt-inc">
                <span className="bt-inc-ic" aria-hidden="true">
                  <Icon name={item.icon} size={26} stroke={1.5} />
                </span>
                <h3 className="bt-inc-t">{t(item.title)}</h3>
                <p className="bt-inc-b">{t(item.body)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3 — three ways to plan */}
      <section className="bt-band bt-band-night" aria-labelledby="home-ways">
        <div className="wrap">
          <PremiumHead
            id="home-ways"
            kicker={t('home_ways_kicker')}
            title={t('home_ways_title')}
            centered
            dark
          />
          <div className="bt-ways">
            <WayCard
              href="/map"
              image={imageAt(pool, 1)}
              badge={t('mp_free')}
              badgeTone="brand"
              title={t('svc_map_t')}
              body={t('svc_map_b')}
              facts={[
                ...(trust.places > 0
                  ? [`${format.number(trust.places)} ${t('hero_stat_places')}`]
                  : []),
                `${format.number(regions.length)} ${t('hero_stat_areas')}`,
              ]}
              price={planFrom === null ? null : money(planFrom)}
              t={t}
            />
            <WayCard
              href="/itineraries"
              image={imageAt(pool, 2)}
              badge={t('home_way_pdf')}
              badgeTone="dark"
              title={t('svc_itin_t')}
              body={t('ih_sub')}
              facts={[
                t('home_way_itin_n', { n: itineraries.length }),
                ...(minDays !== null && maxDays !== null
                  ? [
                      minDays === maxDays
                        ? t('c_days_n', { n: minDays })
                        : t('home_days_range', {
                            min: format.number(minDays),
                            max: format.number(maxDays),
                          }),
                    ]
                  : []),
              ]}
              price={itineraryFrom === null ? null : money(itineraryFrom)}
              t={t}
            />
            <WayCard
              href={CUSTOM_HREF}
              image={imageAt(pool, 3)}
              badge={t('home_way_custom_badge')}
              badgeTone="dark"
              title={t('svc_cust_t')}
              body={t('svc_cust_b')}
              facts={[t('home_way_custom_f1')]}
              price={null}
              cta={t('hero_cta_2')}
              t={t}
            />
          </div>
        </div>
      </section>

      {/* 4 — top-rated experiences */}
      {featured.length > 0 && (
        <section className="bt-band bt-band-ivory2" aria-labelledby="home-experiences">
          <div className="wrap">
            <PremiumHead
              id="home-experiences"
              kicker={t('navr_act')}
              title={t('ha_title')}
              action={
                <LinkButton href="/activities" variant="ghost" size="sm" className="bt-seeall">
                  {t('ha_all')}
                </LinkButton>
              }
            />
            <div className="grid bt-grid-3auto">
              {featured.slice(0, EXPERIENCE_COUNT).map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5 — the island, place by place */}
      {bento.length >= 3 && (
        <section className="bt-band bt-band-ivory" aria-labelledby="home-places">
          <div className="wrap">
            <PremiumHead
              id="home-places"
              kicker={t('hl_title')}
              title={t('home_bento_title')}
              action={
                <LinkButton href="/explore" variant="ghost" size="sm" className="bt-seeall">
                  {t('navr_explore')}
                </LinkButton>
              }
            />
            <ul className={`bt-bento n${bento.length}`}>
              {bento.map((landmark, index) => {
                const name = pick(landmark.name, locale, landmark.slug)
                const region =
                  landmark.region === null
                    ? null
                    : pick(landmark.region.label, locale, landmark.region.key)
                return (
                  <li key={landmark.id} className={index === 0 ? 'bt-bento-big' : undefined}>
                    <Link href={landmark.href} className="bt-bento-tile">
                      <Photo
                        src={landmark.hero?.url}
                        srcSetAvif={landmark.hero?.srcSetAvif}
                        srcSetWebp={landmark.hero?.srcSetWebp}
                        sizes={index === 0 ? '(min-width: 900px) 50vw, 100vw' : '25vw'}
                        alt=""
                      />
                      <span className="bt-bento-cap">
                        <strong>{name}</strong>
                        {region !== null && <span>{region}</span>}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}

      {/* 6 — private driver */}
      <section className="bt-band bt-band-ivory2" aria-labelledby="home-driver">
        <div className="wrap bt-hdriver bt-pdriver">
          <div>
            <PremiumHead id="home-driver" kicker={t('navr_driver2')} title={t('hd_title')} />
            <p className="bt-plede">{t('hd_sub')}</p>
            <ul className="bt-pchecks">
              {DRIVER_FEATURES.map((key) => (
                <li key={key}>
                  <span className="bt-pcheck" aria-hidden="true">
                    <Icon name="check" size={14} stroke={2.2} />
                  </span>
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>

          <DriverBookingCard areas={pickupAreas} href="/driver" />
        </div>
      </section>

      {/* 7 — trusted by travelers */}
      {(reviews.length > 0 || trust.rating !== null) && (
        <section className="bt-band bt-band-ivory" aria-labelledby="home-reviews">
          <div className="wrap">
            <PremiumHead
              id="home-reviews"
              kicker={t('ab_trust_t')}
              title={t('hr_title')}
              centered
            />

            {trust.rating !== null && (
              <div className="bt-rsummary">
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
              <ul className="bt-rcards">
                {reviews.map((review) => (
                  <ReviewTile key={review.id} review={review} locale={locale} format={format} />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* 8 — questions before you go */}
      <section className="bt-band bt-band-ivory2" aria-labelledby="home-faq">
        <div className="wrap bt-pfaq">
          <PremiumHead id="home-faq" kicker={t('ad_faq')} title={t('home_faq_title')} centered />
          <Accordion
            className="bt-pacc"
            defaultOpen={-1}
            items={FAQ.map((entry) => ({ id: entry.q, question: t(entry.q), answer: t(entry.a) }))}
          />
          <p className="bt-pfaq-more">
            {t('home_faq_more')}{' '}
            {wa !== null ? (
              <a href={wa} target="_blank" rel="noopener noreferrer">
                {t('wa_chat')}
              </a>
            ) : (
              <Link href="/contact">{t('navr_contact')}</Link>
            )}
          </p>
        </div>
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Fragments
// ---------------------------------------------------------------------------

/**
 * Section heading: a short coloured kicker, then a large headline. Sentence
 * case throughout; Latin gets tight tracking, Arabic none (premium.css).
 */
function PremiumHead({
  id,
  kicker,
  title,
  centered = false,
  dark = false,
  action,
}: {
  id: string
  kicker: string
  title: string
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
      </div>
      {action}
    </div>
  )
}

/**
 * Hero trust row: measured figures only. A figure below its meaningful
 * minimum (`trustStats`) is null and simply not shown.
 */
function TrustRow({
  t,
  format,
  places,
  regions,
  rating,
  trips,
}: {
  t: Translator
  format: Formatter
  places: number
  regions: number
  rating: number | null
  trips: number | null
}) {
  const items: { key: string; value: string; label: string; stars?: number }[] = [
    ...(rating !== null
      ? [
          {
            key: 'rating',
            value: format.number(rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
            label: t('hero_stat_rating'),
            stars: rating,
          },
        ]
      : []),
    ...(places > 0
      ? [{ key: 'places', value: format.number(places), label: t('hero_stat_places') }]
      : []),
    ...(regions > 0
      ? [{ key: 'regions', value: format.number(regions), label: t('hero_stat_areas') }]
      : []),
    ...(trips !== null
      ? [
          {
            key: 'trips',
            value: `${format.number(trips, { notation: 'compact' })}+`,
            label: t('ab_stat4'),
          },
        ]
      : []),
  ]

  if (items.length === 0) return null

  return (
    <dl className="bt-trust">
      {items.map((item) => (
        <div key={item.key} className="bt-trust-i">
          {/* dt first, as <dl> requires; the stylesheet shows the figure on top. */}
          <dt className="bt-trust-l">{item.label}</dt>
          <dd className="bt-trust-v">
            {item.value}
            {item.stars !== undefined && <Stars value={item.stars} light />}
          </dd>
        </div>
      ))}
    </dl>
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

/** One of the three "ways to plan" — a full-bleed photo card. */
function WayCard({
  href,
  image,
  badge,
  badgeTone,
  title,
  body,
  facts,
  price,
  cta,
  t,
}: {
  href: string
  image: MediaDto | null
  badge: string
  badgeTone: 'brand' | 'dark'
  title: string
  body: string
  facts: readonly string[]
  price: string | null
  cta?: string
  t: Translator
}) {
  return (
    <Link href={href} className="bt-way">
      <Photo
        src={image?.url}
        srcSetAvif={image?.srcSetAvif}
        srcSetWebp={image?.srcSetWebp}
        sizes="(min-width: 900px) 33vw, 100vw"
        alt=""
      />
      <span className="bt-way-veil" aria-hidden="true" />
      <span className={`bt-way-badge is-${badgeTone}`}>
        <Icon name="star" size={13} />
        {badge}
      </span>
      <span className="bt-way-body">
        <span className="bt-way-t">{title}</span>
        <span className="bt-way-d">{body}</span>
        <span className="bt-way-foot">
          <span className="bt-way-facts">
            {facts.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </span>
          {price !== null ? (
            <span className="bt-way-price">
              <span>{t('c_from')}</span>
              <strong className="bt-money">{price}</strong>
            </span>
          ) : (
            cta !== undefined && (
              <span className="bt-way-cta">
                {cta}
                <Icon name="arrow" size={16} className="flip" />
              </span>
            )
          )}
        </span>
      </span>
    </Link>
  )
}

function ReviewTile({
  review,
  locale,
  format,
}: {
  review: ReviewDto
  locale: Locale
  format: Formatter
}) {
  const body = pickOptional(review.body, locale)
  const country = pickOptional(review.authorCountry, locale)
  const date = format.dateTime(new Date(review.createdAt), { dateStyle: 'medium' })

  return (
    <li className="bt-rcard">
      <div className="bt-rcard-head">
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
      </div>
      <span className="bt-rcard-stars" role="img" aria-label={`${review.stars}/5`}>
        <Stars value={review.stars} />
      </span>
      {body !== null && <p className="bt-rcard-b">{body}</p>}
    </li>
  )
}
