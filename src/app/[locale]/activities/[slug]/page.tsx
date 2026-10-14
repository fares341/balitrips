/**
 * Activity detail — v3 screen 06 (design-reference/prototype/activity.html).
 *
 * Gallery, title + facts + share/save, sticky section tabs, then: overview,
 * packages (selectable cards + compare), what's included, cancellation, FAQ,
 * location and real reviews; beside them the sticky booking box (#book) —
 * package, date (or range for a multi-day activity), time, people, add-ons
 * with their rules, driver, live summary — and below, related activities,
 * packages containing this activity and itineraries featuring it.
 *
 * A wrong slug is a 404 (never the first record), every number shown is from
 * the database, and sections without data are left out rather than filled
 * with sample copy.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Breadcrumbs, LinkButton, Stars, Tag } from '@/components/bt'
import { formatPrice } from '@/components/bt/card'
import { ActivityCard } from '@/components/cards'
import { Icon } from '@/components/ui'
import { defaultLocale, isLocale, locales, type Locale } from '@/i18n/config'
import { getPathname, Link } from '@/i18n/routing'
import { pick, pickList, pickOptional } from '@/lib/content/localize'
import {
  getActivityBySlug,
  itinerariesWithActivity,
  listActivities,
  listDriverVehicles,
  packagesWithActivity,
  reviewsForActivity,
  similarActivities,
} from '@/lib/content/queries'
import { ENTITY_PATHS } from '@/lib/content/types'

import { geoToImagePx } from '../../map/geo'
import {
  BookingBox,
  BookingProvider,
  MobileBookBar,
  PackageCards,
  type BookingData,
} from './booking'
import { Gallery, SaveButton, SectionNav, ShareButton } from './detail-client'

import '@/styles/bt-activity.css'

const HUB_PATH = ENTITY_PATHS.activity
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** Location map: the satellite raster at this scale, centred on the area. */
const MINIMAP_SCALE = 1.15

type PageProps = { params: Promise<{ locale: string; slug: string }> }

export async function generateStaticParams() {
  const activities = await listActivities({ limit: 200 })
  return activities.map((activity) => ({ slug: activity.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params
  const lang: Locale = isLocale(locale) ? locale : defaultLocale
  const activity = await getActivityBySlug(slug)
  if (!activity) return {}

  const name = pick(activity.name, lang, activity.slug)
  const description =
    pickOptional(activity.description, lang) ?? pickOptional(activity.area, lang) ?? name
  const url = (target: Locale) =>
    `${SITE_URL}${getPathname({ href: `${HUB_PATH}/${activity.slug}`, locale: target })}`

  return {
    title: name,
    description,
    alternates: {
      canonical: url(lang),
      languages: {
        ...Object.fromEntries(locales.map((one) => [one, url(one)])),
        'x-default': url(defaultLocale),
      },
    },
    openGraph: {
      title: name,
      description,
      url: url(lang),
      type: 'article',
      images:
        activity.hero === null
          ? undefined
          : [
              {
                url: activity.hero.url,
                width: activity.hero.width,
                height: activity.hero.height,
                alt: pick(activity.hero.alt, lang, name),
              },
            ],
    },
  }
}

export default async function ActivityDetailPage({ params }: PageProps) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const lang: Locale = isLocale(locale) ? locale : defaultLocale

  const activity = await getActivityBySlug(slug)
  if (!activity) notFound()

  const [t, bundles, itineraries, similar, reviews, vehicles] = await Promise.all([
    getTranslations(),
    packagesWithActivity(activity.id),
    itinerariesWithActivity(activity.id),
    similarActivities(activity.id, 3),
    reviewsForActivity(activity.id),
    listDriverVehicles(),
  ])

  const name = pick(activity.name, lang, activity.slug)
  const area = pickOptional(activity.area, lang)
  const regionName = activity.region ? pick(activity.region.label, lang) : null
  const place = area ?? regionName
  const duration = pickOptional(activity.duration, lang)
  const description = pickOptional(activity.description, lang)
  const included = pickList(activity.included, lang)
  const excluded = pickList(activity.excluded, lang)
  const cancellation = pickOptional(activity.cancellationPolicy, lang)
  const money = (minor: number, currency = activity.currency) => formatPrice(minor, currency, lang)

  const faq = activity.faq
    .map((entry) => ({ q: pick(entry.q, lang), a: pick(entry.a, lang) }))
    .filter((entry) => entry.q !== '' && entry.a !== '')

  const booking: BookingData = {
    activityId: activity.id,
    currency: activity.currency,
    basePriceMinor: activity.priceMinor,
    maxGuests: activity.maxGuests,
    leadTimeHours: activity.leadTimeHours,
    timeSlots: activity.timeSlots.filter((slot) => /^\d{2}:\d{2}$/.test(slot)),
    multiDay: activity.multiDay,
    packages: activity.tiers.map((tier) => ({
      id: tier.id,
      name: pick(tier.name, lang, tier.key),
      tagline: pickOptional(tier.tagline, lang),
      // Packages are priced in the activity's currency; a stray row in
      // another currency would be refused by the server, so it is shown off.
      priceMinor: tier.priceMinor,
      pricing: tier.pricing,
      groupMax: tier.groupMax,
      maxGuests: tier.maxGuests,
      includes: pickList(tier.includes, lang),
      excludes: pickList(tier.excludes, lang),
      includesAddons: tier.includesAddons,
      available: tier.available && tier.currency === activity.currency,
      popular: tier.isPopular,
    })),
    addons: activity.addons.map((addon) => ({
      id: addon.id,
      name: pick(addon.name, lang),
      description: pickOptional(addon.description, lang),
      priceMinor: addon.priceMinor,
      currency: addon.currency,
      pricing: addon.pricing,
      maxQty: addon.maxQty,
      onlyPackages: addon.onlyPackages,
      requiresAddonId: addon.requiresAddonId,
      available: addon.available && addon.currency === activity.currency,
    })),
    vehicles: vehicles.map((v) => ({
      vehicleClass: v.vehicleClass,
      label: pick(v.label, lang, v.vehicleClass),
      dayRateMinor: v.dayRateMinor,
      currency: v.currency,
    })),
  }

  const hasPackages = booking.packages.length > 0
  const sections = [
    { id: 'overview', label: t('act_sec_overview') },
    hasPackages ? { id: 'packages', label: t('act_sec_packages') } : null,
    included.length + excluded.length > 0 ? { id: 'includes', label: t('act_sec_includes') } : null,
    cancellation ? { id: 'cancel', label: t('act_sec_cancel') } : null,
    faq.length > 0 ? { id: 'faq', label: t('act_sec_faq') } : null,
    activity.location ? { id: 'location', label: t('act_sec_location') } : null,
    reviews.length > 0 ? { id: 'reviews', label: t('act_sec_reviews') } : null,
  ].filter((s): s is { id: string; label: string } => s !== null)

  const reviewAverage =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length : null

  const facts: {
    icon: 'clock' | 'cal' | 'users' | 'pin'
    label: string
    value: string
    ltr?: boolean
  }[] = []
  if (duration) facts.push({ icon: 'clock', label: t('act_fact_duration'), value: duration })
  if (booking.timeSlots.length > 0) {
    facts.push({
      icon: 'cal',
      label: t('act_fact_times'),
      value: booking.timeSlots.join(' · '),
      ltr: true,
    })
  }
  facts.push({
    icon: 'users',
    label: t('act_fact_pricing'),
    value: booking.packages.some((p) => p.pricing === 'per_group')
      ? t('act_fact_pricing_mixed')
      : t('act_fact_pricing_person'),
  })
  if (place) facts.push({ icon: 'pin', label: t('act_fact_area'), value: place })

  const pin = activity.location ? geoToImagePx(activity.location.lat, activity.location.lon) : null

  return (
    <main className="act-detail">
      <div className="wrap">
        <Breadcrumbs
          label={t('c_breadcrumb')}
          trail={[
            { label: t('c_home'), href: '/' },
            { label: t('navr_act'), href: HUB_PATH },
            { label: name },
          ]}
        />

        <Gallery
          images={activity.gallery.map((image) => ({
            id: image.id,
            url: image.url,
            alt: pick(image.alt, lang, name),
          }))}
        />

        <div className="ttl">
          <div className="stack ttl-main">
            {activity.categories.length > 0 ? (
              <div className="row" style={{ gap: 6 }}>
                {activity.categories.slice(0, 3).map((category, index) => (
                  <Tag key={category.id} variant={index === 0 ? 'palm' : 'forest'}>
                    {pick(category.label, lang, category.key)}
                  </Tag>
                ))}
              </div>
            ) : null}
            <h1 className="h1">{name}</h1>
            <div className="facts">
              {place ? (
                <span>
                  <Icon name="pin" size={16} /> {place}
                </span>
              ) : null}
              {duration ? (
                <span>
                  <Icon name="clock" size={16} /> {duration}
                </span>
              ) : null}
              {reviewAverage !== null ? (
                <Stars value={reviewAverage} count={reviews.length} />
              ) : null}
            </div>
          </div>
          <div className="row">
            <ShareButton />
            <SaveButton activityId={activity.id} />
          </div>
        </div>

        <BookingProvider data={booking}>
          <div className="act-layout">
            <div className="minw0">
              <SectionNav sections={sections} />

              <section className="blk" id="overview">
                <h2>{t('act_about')}</h2>
                {description ? <p className="act-desc">{description}</p> : null}
                <div className="facts-grid">
                  {facts.map((fact) => (
                    <div key={fact.label} className="panel panel-ivory">
                      <span className="muted">
                        <Icon name={fact.icon} size={15} /> {fact.label}
                      </span>
                      <b
                        className={fact.ltr ? 'num' : undefined}
                        dir={fact.ltr ? 'ltr' : undefined}
                      >
                        {fact.value}
                      </b>
                    </div>
                  ))}
                </div>
              </section>

              {hasPackages ? (
                <section className="blk" id="packages">
                  <PackageCards />
                </section>
              ) : null}

              {included.length + excluded.length > 0 ? (
                <section className="blk" id="includes">
                  <h2>{t('act_inc_t')}</h2>
                  <div className="ie">
                    {included.length > 0 ? (
                      <div className="panel">
                        <b className="ie-h ok">
                          <Icon name="check" size={18} stroke={2.4} /> {t('act_inc')}
                        </b>
                        <ul>
                          {included.map((line) => (
                            <li key={line}>
                              <Icon name="check" size={16} stroke={2} /> {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {excluded.length > 0 ? (
                      <div className="panel">
                        <b className="ie-h no">
                          <Icon name="cross" size={18} stroke={2.4} /> {t('act_exc')}
                        </b>
                        <ul>
                          {excluded.map((line) => (
                            <li key={line} className="muted">
                              <Icon name="cross" size={16} stroke={2} /> {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {cancellation ? (
                <section className="blk" id="cancel">
                  <h2>{t('act_cancel_t')}</h2>
                  <div className="alert alert-warn">
                    <Icon name="info" size={18} />
                    <span>{cancellation}</span>
                  </div>
                  <Link className="link" href="/refund" style={{ alignSelf: 'flex-start' }}>
                    {t('act_cancel_general')}
                  </Link>
                </section>
              ) : null}

              {faq.length > 0 ? (
                <section className="blk" id="faq">
                  <h2>{t('act_faq_t')}</h2>
                  <div className="acc">
                    {faq.map((entry, index) => (
                      <details key={entry.q} open={index === 0}>
                        <summary>
                          {entry.q}
                          <span className="pm" aria-hidden="true">
                            <Icon name="plus" size={16} stroke={2.2} />
                          </span>
                        </summary>
                        <div className="acc-body">{entry.a}</div>
                      </details>
                    ))}
                  </div>
                </section>
              ) : null}

              {pin ? (
                <section className="blk" id="location">
                  <h2>{t('act_loc_t')}</h2>
                  {/* The raster is not mirrored in RTL: positioned left-to-right. */}
                  <div className="minimap" dir="ltr">
                    {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand raster, positioned by CSS */}
                    <img
                      src="/brand/bali-sat.jpg"
                      alt=""
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: 2048 * MINIMAP_SCALE,
                        height: 1399 * MINIMAP_SCALE,
                        insetInlineStart: `calc(50% - ${Math.round(pin.x * MINIMAP_SCALE)}px)`,
                        insetBlockStart: `calc(50% - ${Math.round(pin.y * MINIMAP_SCALE)}px)`,
                      }}
                    />
                    <span className="mk" aria-hidden="true" />
                    <LinkButton
                      href={activity.region ? `/map?region=${activity.region.key}` : '/map'}
                      variant="light"
                      size="sm"
                      icon="map"
                    >
                      {t('act_loc_map')}
                    </LinkButton>
                  </div>
                  <p className="muted">
                    {place ? `${place} — ` : ''}
                    {t('act_loc_note')}
                  </p>
                </section>
              ) : null}

              {reviews.length > 0 && reviewAverage !== null ? (
                <section className="blk" id="reviews" style={{ borderBottom: 0 }}>
                  <h2>{t('act_rev_t')}</h2>
                  <div className="row rev-head">
                    <b className="rev-avg" dir="ltr">
                      {reviewAverage.toFixed(1)}
                    </b>
                    <span className="stack" style={{ gap: 2 }}>
                      <StarRow value={reviewAverage} />
                      <small className="muted">{t('act_rev_count', { n: reviews.length })}</small>
                    </span>
                  </div>
                  <div className="grid g2">
                    {reviews.slice(0, 6).map((review) => (
                      <figure key={review.id} className="panel rev">
                        <StarRow value={review.stars} />
                        {review.body ? <blockquote>{pick(review.body, lang)}</blockquote> : null}
                        <figcaption className="muted">
                          {review.authorName}
                          {review.authorCountry ? ` · ${pick(review.authorCountry, lang)}` : ''}
                          {review.isVerified ? ` · ${t('act_rev_verified')}` : ''}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <aside id="book" aria-label={t('act_book_label')}>
              <BookingBox />
            </aside>
          </div>
          <MobileBookBar />
        </BookingProvider>

        {similar.length > 0 || bundles.length > 0 || itineraries.length > 0 ? (
          <section className="stack act-related">
            {similar.length > 0 ? (
              <>
                <h2 className="h2">{t('act_similar_t')}</h2>
                <div className="grid g3">
                  {similar.map((other) => (
                    <ActivityCard key={other.id} activity={other} />
                  ))}
                </div>
              </>
            ) : null}
            {bundles.length > 0 || itineraries.length > 0 ? (
              <div className="rel-panels">
                {bundles.length > 0 ? (
                  <div className="panel stack">
                    <h3 className="h3">{t('act_rel_pkgs')}</h3>
                    <div className="stack" style={{ gap: 10 }}>
                      {bundles.map((pkg) => (
                        <Link key={pkg.id} className="res" href={pkg.href}>
                          {pkg.hero ? (
                            // eslint-disable-next-line @next/next/no-img-element -- 64px CMS thumbnail
                            <img src={pkg.hero.url} alt="" loading="lazy" />
                          ) : (
                            <span className="res-ph" aria-hidden="true" />
                          )}
                          <span className="res-txt">
                            <b>{pick(pkg.name, lang, pkg.slug)}</b>
                            <small className="muted">
                              {t('act_rel_days', { n: pkg.days })} · {t('act_from_lc')}{' '}
                              <span className="num" dir="ltr">
                                {money(pkg.priceMinor, pkg.currency)}
                              </span>
                            </small>
                          </span>
                          <Icon name="chevronr" size={18} className="flip" />
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
                {itineraries.length > 0 ? (
                  <div className="panel stack">
                    <h3 className="h3">{t('act_rel_itins')}</h3>
                    <div className="stack" style={{ gap: 10 }}>
                      {itineraries.map((itinerary) => (
                        <Link key={itinerary.id} className="res" href={itinerary.href}>
                          {itinerary.hero ? (
                            // eslint-disable-next-line @next/next/no-img-element -- 64px CMS thumbnail
                            <img src={itinerary.hero.url} alt="" loading="lazy" />
                          ) : (
                            <span className="res-ph" aria-hidden="true" />
                          )}
                          <span className="res-txt">
                            <b>{pick(itinerary.name, lang, itinerary.slug)}</b>
                            <small className="muted">
                              PDF ·{' '}
                              <span className="num" dir="ltr">
                                {money(itinerary.priceMinor, itinerary.currency)}
                              </span>
                            </small>
                          </span>
                          <Icon name="chevronr" size={18} className="flip" />
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  )
}

/** Five stars, the first `round(value)` filled (review header and cards). */
function StarRow({ value }: { value: number }) {
  const filled = Math.round(value)
  return (
    <span className="star-row" dir="ltr" aria-label={`${value.toFixed(1)} / 5`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width={14}
          height={14}
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={n <= filled ? 'on' : undefined}
        >
          <path
            d="m12 3.5 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 17l-5.3 2.9 1.2-6-4.5-4.1 6-.7L12 3.5Z"
            fill="currentColor"
          />
        </svg>
      ))}
    </span>
  )
}
