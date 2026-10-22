/**
 * Activity detail — v3 screen 06 (design-reference/prototype/activity.html).
 *
 * Client design (phase 1): title, area, real-review rating and headline;
 * quick facts (location, group size, schedule, duration); gallery with
 * thumbnails and a click-to-load video; package cards ("choose the right
 * package") with the chosen package's detail panel, the four boxes
 * (includes / not included / suitable for / important notes) and the add-on
 * cards; description (safe markdown) + highlights + info tabs (important
 * information / cancellation / FAQ); meeting point with Google Maps; what to
 * bring; age & conditions; real reviews. Beside them the sticky booking box
 * (#book) — or a contact panel when the activity is unavailable — and below,
 * similar activities and the map card.
 *
 * A wrong slug is a 404 (never the first record), every number shown is from
 * the database, and sections without data are left out rather than filled
 * with sample copy.
 */

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { notFound, permanentRedirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { Breadcrumbs, LinkButton, Stars, Tag } from '@/components/bt'
import { formatPrice } from '@/components/bt/card'
import { ActivityCard } from '@/components/cards'
import { Icon } from '@/components/ui'
import { defaultLocale, isLocale, locales, type Locale } from '@/i18n/config'
import { getPathname, Link } from '@/i18n/routing'
import { Markdown } from '@/components/shared/markdown'
import { showsGroupSize } from '@/lib/content/activity-status'
import { pick, pickAlt, pickList, pickOptional } from '@/lib/content/localize'
import { markdownToPlain } from '@/lib/content/markdown'
import {
  getActivityBySlug,
  itinerariesWithActivity,
  listActivityPageSlugs,
  listDriverVehicles,
  mergedActivitySlug,
  packagesWithActivity,
  reviewsForActivity,
  similarActivities,
} from '@/lib/content/queries'
import { ENTITY_PATHS } from '@/lib/content/types'

import { ART_H, ART_SMALL_URL, ART_SMALL_W, ART_W, geoToArt } from '../../map/art-warp'
import {
  AddonStrip,
  BookingBox,
  BookingProvider,
  InfoBoxes,
  MobileBookBar,
  PackageCards,
  TierDetail,
  type BookingData,
} from './booking'
import { Gallery, InfoTabs, SaveButton, SectionNav, ShareButton } from './detail-client'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'
import { JsonLd } from '@/components/seo/json-ld'
import { toMajor } from '@/lib/analytics/pixels'
import { shareUrl } from '@/lib/seo/site-origin'

import '@/styles/bt-activity.css'

const HUB_PATH = ENTITY_PATHS.activity
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** Location map: the illustrated artwork at this scale, centred on the area. */
const MINIMAP_SCALE = 1.15

type PageProps = { params: Promise<{ locale: string; slug: string }> }

export async function generateStaticParams() {
  // Listed and link-only (hidden) activities alike: every page that opens.
  const slugs = await listActivityPageSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params
  const lang: Locale = isLocale(locale) ? locale : defaultLocale
  const activity = await getActivityBySlug(slug)
  if (!activity) return {}

  const name = pick(activity.name, lang, activity.slug)
  const description =
    pickOptional(activity.shortDescription, lang) ??
    pickOptional(activity.headline, lang) ??
    (() => {
      const full = pickOptional(activity.description, lang)
      return full ? markdownToPlain(full).slice(0, 300) : null
    })() ??
    pickOptional(activity.area, lang) ??
    name
  const url = (target: Locale) =>
    `${SITE_URL}${getPathname({ href: `${HUB_PATH}/${activity.slug}`, locale: target })}`

  return {
    title: name,
    description,
    // A hidden activity opens by its link only: kept out of search engines too.
    ...(activity.status === 'hidden' ? { robots: { index: false, follow: false } } : {}),
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
      images:
        activity.hero === null
          ? [DEFAULT_SHARE_IMAGE]
          : [
              {
                url: activity.hero.url,
                width: activity.hero.width,
                height: activity.hero.height,
                alt: pickAlt(activity.hero.alt, lang, name),
              },
            ],
    },
  }
}

export default async function ActivityDetailPage({ params }: PageProps) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const lang: Locale = isLocale(locale) ? locale : defaultLocale

  // An activity folded into another one as a package: its old link lands there.
  const mergedInto = await mergedActivitySlug(slug)
  if (mergedInto !== null) {
    permanentRedirect(getPathname({ href: `${HUB_PATH}/${mergedInto}`, locale: lang }))
  }

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
  const headline = pickOptional(activity.headline, lang)
  const highlights = pickList(activity.highlights, lang)
  const included = pickList(activity.included, lang)
  const excluded = pickList(activity.excluded, lang)
  const importantNotes = pickList(activity.importantNotes, lang)
  const whatToBring = pickList(activity.whatToBring, lang)
  const ageConditions = pickList(activity.ageConditions, lang)
  // Site-wide default (client, Oct 2026) when the activity has its own none.
  const cancellation = pickOptional(activity.cancellationPolicy, lang) ?? t('cancel_default')
  const meetingAddress = pickOptional(activity.meeting.address, lang)
  const meetingTime = pickOptional(activity.meeting.timeNote, lang)
  const money = (minor: number, currency = activity.currency) => formatPrice(minor, currency, lang)

  const faq = activity.faq
    .map((entry) => ({ q: pick(entry.q, lang), a: pick(entry.a, lang) }))
    .filter((entry) => entry.q !== '' && entry.a !== '')

  const timeSlots = activity.timeSlots.filter((slot) => /^\d{2}:\d{2}$/.test(slot))
  const schedule = timeSlots.length > 0 ? timeSlots.join(' · ') : meetingTime

  const booking: BookingData = {
    activityId: activity.id,
    name,
    bookable: activity.bookable,
    currency: activity.currency,
    basePriceMinor: activity.priceMinor,
    maxGuests: activity.maxGuests,
    minGuests: activity.minGuests,
    leadTimeHours: activity.leadTimeHours,
    timeSlots,
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
      minGuests: tier.minGuests,
      includes: pickList(tier.includes, lang),
      excludes: pickList(tier.excludes, lang),
      includesAddons: tier.includesAddons,
      available: tier.available && tier.currency === activity.currency,
      popular: tier.isPopular,
      features: pickList(tier.features, lang),
      highlights: pickList(tier.highlights, lang),
      details: pickList(tier.details, lang),
      notes: pickList(tier.notes, lang),
      includedActivities: tier.includedActivities.map((inc) => ({
        id: inc.id,
        name: pick(inc.name, lang, inc.slug),
        href: inc.href,
        duration: pickOptional(inc.duration, lang),
        timeSlots: inc.timeSlots.filter((slot) => /^\d{2}:\d{2}$/.test(slot)),
        timing: inc.timing,
      })),
      childPriceMinor: tier.pricing === 'per_person' ? tier.childPriceMinor : null,
      seasons: tier.seasons,
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
      required: addon.required,
      imageUrl: addon.image?.url ?? null,
      unitLabel: pickOptional(addon.unitLabel, lang),
    })),
    vehicles: vehicles.map((v) => ({
      vehicleClass: v.vehicleClass,
      label: pick(v.label, lang, v.vehicleClass),
      dayRateMinor: v.dayRateMinor,
      currency: v.currency,
    })),
    childAges: activity.childAges,
    info: {
      instantConfirmation: activity.instantConfirmation,
      freeCancellationHours: activity.freeCancellationHours,
      place,
      duration,
      included,
      excluded,
      suitableFor: pickList(activity.suitableFor, lang),
      importantNotes,
    },
  }

  const hasPackages = booking.packages.length > 0
  const hasMeeting =
    meetingAddress !== null || meetingTime !== null || activity.meeting.mapUrl !== null
  const hasPractical = hasMeeting || whatToBring.length > 0 || ageConditions.length > 0
  const sections = [
    hasPackages ? { id: 'packages', label: t('act_sec_packages') } : null,
    { id: 'overview', label: t('act_sec_overview') },
    { id: 'details', label: t('act_sec_details') },
    hasPractical ? { id: 'meeting', label: t('act_sec_meeting') } : null,
    reviews.length > 0 ? { id: 'reviews', label: t('act_sec_reviews') } : null,
  ].filter((s): s is { id: string; label: string } => s !== null)

  const reviewAverage =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length : null

  // Quick facts under the title: location, group size, schedule, duration.
  const min = Math.max(1, activity.minGuests)
  const quick: {
    icon: 'pin' | 'users' | 'cal' | 'clock'
    label: string
    value: string
    ltr?: boolean
  }[] = []
  if (place) quick.push({ icon: 'pin', label: t('act_qf_location'), value: place })
  // A cap left at the column default is not a fact the owner gave: not shown.
  if (showsGroupSize(activity.maxGuests, min)) {
    quick.push({
      icon: 'users',
      label: t('act_qf_group'),
      value:
        min > 1
          ? t('act_qf_group_v', { min, max: activity.maxGuests })
          : t('act_qf_group_upto', { max: activity.maxGuests }),
    })
  }
  quick.push({
    icon: 'cal',
    label: t('act_qf_schedule'),
    value: schedule ?? t('act_qf_flexible'),
    ltr: timeSlots.length > 0,
  })
  if (duration) quick.push({ icon: 'clock', label: t('act_qf_duration'), value: duration })

  const infoTabs = [
    importantNotes.length > 0 || activity.leadTimeHours > 0
      ? {
          id: 'info',
          title: t('act_tab_info'),
          content: (
            <ul className="ilist">
              {importantNotes.map((line) => (
                <li key={line}>{line}</li>
              ))}
              {activity.leadTimeHours > 0 ? (
                <li>{t('act_info_lead', { n: activity.leadTimeHours })}</li>
              ) : null}
              {min > 1 ? <li>{t('act_info_min', { n: min })}</li> : null}
              <li>{t('act_info_max', { n: activity.maxGuests })}</li>
            </ul>
          ),
        }
      : null,
    cancellation || activity.freeCancellationHours !== null
      ? {
          id: 'cancel',
          title: t('act_tab_cancel'),
          content: (
            <div className="stack" style={{ gap: 10 }}>
              {activity.freeCancellationHours !== null ? (
                <p className="ok-line">
                  <Icon name="shield" size={18} />{' '}
                  {t('act_detail_free_cancel', { n: activity.freeCancellationHours })}
                </p>
              ) : null}
              {cancellation ? <p className="pre">{cancellation}</p> : null}
              <Link className="link" href="/refund" style={{ alignSelf: 'flex-start' }}>
                {t('act_cancel_general')}
              </Link>
            </div>
          ),
        }
      : null,
    faq.length > 0
      ? {
          id: 'faq',
          title: t('act_tab_faq'),
          content: (
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
          ),
        }
      : null,
  ].filter((tab): tab is { id: string; title: string; content: ReactElement } => tab !== null)

  const galleryImages = activity.gallery.map((image) => ({
    id: image.id,
    url: image.url,
    alt: pickAlt(image.alt, lang, name),
    srcSetAvif: image.srcSetAvif,
    srcSetWebp: image.srcSetWebp,
  }))

  // Position on the illustrated artwork (the small copy's pixels).
  const pin = activity.location
    ? (([x, y]) => ({
        x: (Math.max(0, Math.min(ART_W, x)) * ART_SMALL_W) / ART_W,
        y: (Math.max(0, Math.min(ART_H, y)) * ART_SMALL_W) / ART_W,
      }))(geoToArt(activity.location.lon, activity.location.lat))
    : null
  const mapHref = activity.region ? `/map?region=${activity.region.key}` : '/map'

  // L17/L18: structured data and og:type=product. React hoists the <meta>
  // into <head>; Next's typed openGraph has no 'product' type.
  const ldDescription =
    pickOptional(activity.shortDescription, lang) ?? pickOptional(activity.headline, lang) ?? name
  const productLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['Product', 'TouristTrip'],
    name,
    description: ldDescription,
    url: shareUrl(getPathname({ href: `${HUB_PATH}/${activity.slug}`, locale: lang })),
    ...(activity.hero ? { image: shareUrl(activity.hero.url) } : {}),
    brand: { '@type': 'Brand', name: 'Bali Trips' },
    offers: {
      '@type': 'Offer',
      price: toMajor(activity.priceMinor, activity.currency),
      priceCurrency: activity.currency,
      availability: 'https://schema.org/InStock',
    },
    ...(reviewAverage !== null
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Math.round(reviewAverage * 10) / 10,
            reviewCount: reviews.length,
          },
        }
      : {}),
  }

  return (
    <main className="act-detail act2">
      <meta property="og:type" content="product" />
      <JsonLd data={productLd} />
      <div className="wrap">
        <Breadcrumbs
          label={t('c_breadcrumb')}
          trail={[
            { label: t('c_home'), href: '/' },
            { label: t('navr_act'), href: HUB_PATH },
            { label: name },
          ]}
        />

        <header className="ttl">
          <div className="stack ttl-main">
            {activity.categories.length > 0 || activity.tags.length > 0 ? (
              <div className="row" style={{ gap: 6 }}>
                {activity.mostPopular ? (
                  <Tag variant="sun" icon="star">
                    {t('act_badge_popular')}
                  </Tag>
                ) : null}
                {activity.categories.slice(0, 2).map((category, index) => (
                  <Tag key={category.id} variant={index === 0 ? 'palm' : 'forest'}>
                    {pick(category.label, lang, category.key)}
                  </Tag>
                ))}
                {activity.tags.slice(0, 3).map((tag) => (
                  <Tag key={tag.id}>{pick(tag.label, lang, tag.key)}</Tag>
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
              {reviewAverage !== null ? (
                <Stars value={reviewAverage} count={reviews.length} />
              ) : null}
            </div>
            {headline ? <p className="lede act-lede">{headline}</p> : null}
          </div>
          <div className="row">
            <ShareButton />
            <SaveButton activityId={activity.id} />
          </div>
        </header>

        <ul className="qfacts" aria-label={t('act_sec_details')}>
          {quick.map((fact) => (
            <li key={fact.label}>
              <Icon name={fact.icon} size={18} />
              <span>
                <small className="muted">{fact.label}</small>
                <b className={fact.ltr ? 'num' : undefined} dir={fact.ltr ? 'ltr' : undefined}>
                  {fact.value}
                </b>
              </span>
            </li>
          ))}
        </ul>

        <Gallery
          images={galleryImages}
          mobileHero={
            activity.mobileHero
              ? {
                  id: activity.mobileHero.id,
                  url: activity.mobileHero.url,
                  alt: '',
                  srcSetAvif: activity.mobileHero.srcSetAvif,
                  srcSetWebp: activity.mobileHero.srcSetWebp,
                }
              : null
          }
          video={
            activity.video
              ? { provider: activity.video.provider, embedUrl: activity.video.embedUrl }
              : null
          }
        />

        {!activity.bookable ? (
          <div className="alert alert-warn act-off" role="status">
            <Icon name="info" size={18} />
            <span>
              <b>{t('act_unavailable_t')}</b> {t('act_unavailable_b')}
            </span>
          </div>
        ) : null}

        <BookingProvider data={booking}>
          <div className="act-layout">
            <div className="minw0">
              <SectionNav sections={sections} />

              {hasPackages ? (
                <section className="blk" id="packages">
                  <PackageCards />
                </section>
              ) : null}

              <section className="blk" id="overview">
                <TierDetail schedule={schedule} />
                <InfoBoxes />
                <AddonStrip />
              </section>

              <section className="blk" id="details">
                <h2>{t('act_about')}</h2>
                {description ? <Markdown source={description} className="act-desc" /> : null}
                {highlights.length > 0 ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <h3 className="h3">{t('act_highlights_t')}</h3>
                    <ul className="hlist">
                      {highlights.map((line) => (
                        <li key={line}>
                          <Icon name="sparkle" size={16} /> {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {infoTabs.length > 0 ? (
                  <InfoTabs label={t('act_tabs_label')} tabs={infoTabs} />
                ) : null}
              </section>

              {hasPractical ? (
                <section className="blk" id="meeting">
                  {hasMeeting ? (
                    <div className="panel meet">
                      <span className="meet-ill" aria-hidden="true">
                        <Icon name="pin" size={24} />
                      </span>
                      <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                        <h2 className="h3">{t('act_meet_t')}</h2>
                        {meetingAddress ? <p className="pre">{meetingAddress}</p> : null}
                        {meetingTime ? (
                          <p className="muted">
                            <Icon name="clock" size={15} /> {t('act_meet_time')}: {meetingTime}
                          </p>
                        ) : null}
                        {activity.meeting.mapUrl ? (
                          <a
                            className="btn btn-ghost btn-sm meet-btn"
                            href={activity.meeting.mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Icon name="map" size={16} /> {t('act_meet_map')}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {whatToBring.length > 0 || ageConditions.length > 0 ? (
                    <div className="iboxes">
                      {whatToBring.length > 0 ? (
                        <div className="panel ibox ibox-info">
                          <b className="ibox-h">
                            <Icon name="suitcase" size={18} /> {t('act_bring_t')}
                          </b>
                          <ul>
                            {whatToBring.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {ageConditions.length > 0 ? (
                        <div className="panel ibox ibox-warn">
                          <b className="ibox-h">
                            <Icon name="user" size={18} /> {t('act_age_t')}
                          </b>
                          <ul>
                            {ageConditions.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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

        <section className="stack act-related">
          <div className="rel-top">
            {similar.length > 0 ? (
              <div className="stack" style={{ gap: 16, minWidth: 0 }}>
                <h2 className="h2">{t('act_similar_t')}</h2>
                <div className="grid g3">
                  {similar.map((other) => (
                    <ActivityCard key={other.id} activity={other} />
                  ))}
                </div>
              </div>
            ) : null}
            <div className="panel map-card">
              {pin ? (
                // The artwork is not mirrored in RTL: positioned left-to-right.
                <div className="minimap" dir="ltr">
                  {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand raster, positioned by CSS */}
                  <img
                    src={ART_SMALL_URL}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: ART_SMALL_W * MINIMAP_SCALE,
                      height: Math.round((ART_SMALL_W * ART_H) / ART_W) * MINIMAP_SCALE,
                      insetInlineStart: `calc(50% - ${Math.round(pin.x * MINIMAP_SCALE)}px)`,
                      insetBlockStart: `calc(50% - ${Math.round(pin.y * MINIMAP_SCALE)}px)`,
                    }}
                  />
                  <span className="mk" aria-hidden="true" />
                </div>
              ) : null}
              <div className="stack" style={{ gap: 8 }}>
                <h3 className="h3">{t('act_map_card_t')}</h3>
                <p className="muted">
                  {place ? t('act_map_card_b', { area: place }) : t('act_map_card_b_any')}
                </p>
                <LinkButton href={mapHref} variant="secondary" size="sm" icon="map">
                  {t('act_map_card_btn')}
                </LinkButton>
              </div>
            </div>
          </div>
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
