/**
 * The activity page body, shared by the public page and the staff preview
 * (drafts, in review). Everything shown is read from the database.
 */

import type { ReactElement } from 'react'
import { getTranslations } from 'next-intl/server'

import { Breadcrumbs, LinkButton, Tag } from '@/components/bt'
import { formatPrice } from '@/components/bt/card'
import { Icon } from '@/components/ui'
import type { IconName } from '@/components/ui/icon'
import type { Locale } from '@/i18n/config'
import { getPathname, Link } from '@/i18n/routing'
import { Markdown } from '@/components/shared/markdown'
import { showsGroupSize } from '@/lib/content/activity-status'
import { pick, pickAlt, pickList, pickOptional } from '@/lib/content/localize'
import {
  itinerariesWithActivity,
  listDriverVehicles,
  packagesWithActivity,
  relatedActivities,
  reviewsForActivity,
} from '@/lib/content/queries'
import { ENTITY_PATHS, type ActivityDetail, type ScopedText } from '@/lib/content/types'

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
import { Gallery, InfoTabs, RelatedRow, SaveButton, SectionNav, ShareButton } from './detail-client'
import { dedupeImages } from '@/lib/content/image-dedupe'
import { JsonLd } from '@/components/seo/json-ld'
import { toMajor } from '@/lib/analytics/pixels'
import { shareUrl } from '@/lib/seo/site-origin'

import '@/styles/bt-activity.css'

const HUB_PATH = ENTITY_PATHS.activity

/** Location map: the illustrated artwork at this scale, centred on the area. */
const MINIMAP_SCALE = 1.15

export async function ActivityView({
  activity,
  lang,
  preview = false,
}: {
  activity: ActivityDetail
  lang: Locale
  /** Staff preview of a page that is not public yet: a banner says so. */
  preview?: boolean
}) {
  const [t, bundles, itineraries, related, reviews, vehicles] = await Promise.all([
    getTranslations(),
    packagesWithActivity(activity.id),
    itinerariesWithActivity(activity.id),
    relatedActivities(activity.id, activity.relatedIds, 8),
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
  /** Activity lines with the package each one is tied to (null = every package). */
  const scoped = (lines: readonly ScopedText[]) =>
    lines
      .map((line) => ({ text: pick(line, lang), pkg: line.pkg ?? null }))
      .filter((line) => line.text !== '')
  const whatToBring = pickList(activity.whatToBring, lang)
  const ageConditions = pickList(activity.ageConditions, lang)
  // Site-wide default (client, Oct 2026) when the activity has its own none.
  const cancellation = pickOptional(activity.cancellationPolicy, lang) ?? t('cancel_default')
  const meetingAddress = pickOptional(activity.meeting.address, lang)
  const meetingTime = pickOptional(activity.meeting.timeNote, lang)
  const money = (minor: number, currency = activity.currency) => formatPrice(minor, currency, lang)

  const faq = activity.faq
    .map((entry) => ({ q: pick(entry.q, lang), a: pick(entry.a, lang), pkg: entry.pkg ?? null }))
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
    minAdvanceDays: activity.minAdvanceDays,
    bookingCutoff: activity.bookingCutoff,
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
      compareAtPriceMinor: tier.compareAtPriceMinor,
      badge:
        tier.badgeLabel !== null || tier.badgeColor !== null
          ? { label: pickOptional(tier.badgeLabel, lang), color: tier.badgeColor }
          : null,
      imageUrl: tier.image?.url ?? null,
      duration: pickOptional(tier.duration, lang),
      description: pickOptional(tier.description, lang),
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
      priceTiers: addon.priceTiers,
      incompatibleWith: addon.incompatibleWith,
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
      included: scoped(activity.included),
      excluded: scoped(activity.excluded),
      suitableFor: scoped(activity.suitableFor),
      importantNotes: scoped(activity.importantNotes),
      heroUrl: activity.hero?.url ?? null,
      // The activity's own policy, first line, as the short note on the package card.
      cancelShort: (() => {
        const own = pickOptional(activity.cancellationPolicy, lang)
        const first = own?.split(/\r?\n/)[0]?.trim() ?? ''
        return first === '' ? null : first.length > 60 ? `${first.slice(0, 57)}…` : first
      })(),
    },
  }

  const hasPackages = booking.packages.length > 0

  const reviewAverage =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length : null

  // Quick facts beside the gallery: location, group size, schedule, duration.
  // A fact without data is left out (never «flexible» made up for it).
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
      value: t('act_qf_group_v', { min, max: activity.maxGuests }),
    })
  }
  if (schedule) {
    quick.push({
      icon: 'cal',
      label: t('act_qf_schedule'),
      value: schedule,
      ltr: timeSlots.length > 0,
    })
  }
  if (duration) quick.push({ icon: 'clock', label: t('act_qf_duration'), value: duration })

  const packageName = new Map(booking.packages.map((p) => [p.id, p.name]))

  // «معلومات مهمة»: the description, then four cards — more information,
  // ages & conditions, what to bring, meeting point. Empty cards are left out.
  const moreInfo = [
    ...(activity.leadTimeHours > 0 ? [t('act_info_lead', { n: activity.leadTimeHours })] : []),
    ...(min > 1 ? [t('act_info_min', { n: min })] : []),
    ...(showsGroupSize(activity.maxGuests, min)
      ? [t('act_info_max', { n: activity.maxGuests })]
      : []),
  ]
  const hasMeeting =
    meetingAddress !== null || meetingTime !== null || activity.meeting.mapUrl !== null
  const infoCards: { key: string; icon: IconName; title: string; body: ReactElement }[] = []
  if (moreInfo.length > 0) {
    infoCards.push({
      key: 'more',
      icon: 'info',
      title: t('act_more_info_t'),
      body: <CheckList items={moreInfo} />,
    })
  }
  if (ageConditions.length > 0) {
    infoCards.push({
      key: 'age',
      icon: 'users',
      title: t('act_age_t'),
      body: <CheckList items={ageConditions} />,
    })
  }
  if (whatToBring.length > 0) {
    infoCards.push({
      key: 'bring',
      icon: 'bag',
      title: t('act_bring_t'),
      body: <CheckList items={whatToBring} />,
    })
  }
  if (hasMeeting) {
    infoCards.push({
      key: 'meet',
      icon: 'pin',
      title: t('act_meet_t'),
      body: (
        <div className="stack" style={{ gap: 8 }}>
          {meetingAddress ? <p className="pre">{meetingAddress}</p> : null}
          {meetingTime ? (
            <p className="muted">
              <Icon name="clock" size={15} /> {t('act_meet_time')}: {meetingTime}
            </p>
          ) : null}
          {activity.meeting.mapUrl ? (
            <a
              className="btn btn-outline btn-sm"
              href={activity.meeting.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="pin" size={16} /> {t('act_meet_map')}
            </a>
          ) : null}
        </div>
      ),
    })
  }

  const infoTabs = [
    description || highlights.length > 0 || infoCards.length > 0
      ? {
          id: 'info',
          title: t('act_tab_info'),
          content: (
            <div className="stack" style={{ gap: 16 }}>
              {description ? <Markdown source={description} className="act-desc" /> : null}
              {highlights.length > 0 ? (
                <ul className="hlist">
                  {highlights.map((line) => (
                    <li key={line}>
                      <Icon name="sparkle" size={16} /> {line}
                    </li>
                  ))}
                </ul>
              ) : null}
              {infoCards.length > 0 ? (
                <div className={`icards n${infoCards.length}`}>
                  {infoCards.map((card) => (
                    <div key={card.key} className="icard">
                      <b className="icard-h">
                        <Icon name={card.icon} size={18} /> {card.title}
                      </b>
                      {card.body}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ),
        }
      : null,
    {
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
          <p className="pre">{cancellation}</p>
          <Link className="link" href="/refund" style={{ alignSelf: 'flex-start' }}>
            {t('act_cancel_general')}
          </Link>
        </div>
      ),
    },
    faq.length > 0
      ? {
          id: 'faq',
          title: t('act_tab_faq'),
          content: (
            <div className="acc">
              {faq.map((entry, index) => (
                <details key={`${index}-${entry.q}`} open={index === 0}>
                  <summary>
                    {entry.q}
                    {entry.pkg && packageName.has(entry.pkg) ? (
                      <small className="faq-pkg">{packageName.get(entry.pkg)}</small>
                    ) : null}
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

  // Each picture once (merged activities gathered every source's photos).
  const galleryImages = dedupeImages(activity.gallery).map((image) => ({
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
  // into <head>; Next's typed openGraph has no 'product' type. No rating is
  // claimed unless real published reviews exist.
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
      availability: activity.bookable
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
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

  const lede = pickOptional(activity.shortDescription, lang) ?? headline

  return (
    <main className="act-detail act2 act3">
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

        {preview ? (
          <div className="alert alert-warn act-off" role="status">
            <Icon name="eye" size={18} />
            <span>
              <b>{t('act_preview_t')}</b> {t('act_preview_b', { status: activity.status })}
            </span>
          </div>
        ) : null}

        <section className="ahero">
          <header className="ahero-info">
            {activity.mostPopular ? (
              <Tag variant="sun" icon="star">
                {t('act_badge_popular')}
              </Tag>
            ) : null}
            <h1 className="h1">{name}</h1>
            {place ? (
              <p className="ahero-place">
                <Icon name="pin" size={16} /> {place}
              </p>
            ) : null}
            {reviewAverage !== null ? (
              <p className="ahero-rating">
                <Icon name="star" size={16} />
                <b dir="ltr">{reviewAverage.toFixed(1)}</b>
                <span className="muted">{t('act_rev_count_paren', { n: reviews.length })}</span>
              </p>
            ) : null}
            {lede ? <p className="lede act-lede">{lede}</p> : null}
            {quick.length > 0 ? (
              <ul className={`qfacts2 n${quick.length}`} aria-label={t('act_sec_details')}>
                {quick.map((fact) => (
                  <li key={fact.label}>
                    <Icon name={fact.icon} size={22} />
                    <b className={fact.ltr ? 'num' : undefined} dir={fact.ltr ? 'ltr' : undefined}>
                      {fact.value}
                    </b>
                    <small className="muted">{fact.label}</small>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="row ahero-actions">
              <ShareButton />
              <SaveButton activityId={activity.id} />
            </div>
          </header>
          <div className="ahero-gal">
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
          </div>
        </section>

        {!activity.bookable ? (
          <div className="alert alert-warn act-off" role="status">
            <Icon name="info" size={18} />
            <span>
              <b>{t('act_unavailable_t')}</b> {t('act_unavailable_b')}
            </span>
          </div>
        ) : null}

        <SectionNav
          label={t('act_sections')}
          sections={[
            ...(hasPackages ? [{ id: 'packages', label: t('act_nav_packages') }] : []),
            { id: 'overview', label: t('act_sec_overview') },
            ...(infoTabs.length > 0 ? [{ id: 'details', label: t('act_sec_details') }] : []),
          ]}
        />

        <BookingProvider data={booking}>
          {hasPackages ? (
            <section className="blk3" id="packages">
              <PackageCards />
            </section>
          ) : null}

          <section className="blk3" id="overview">
            <TierDetail schedule={schedule} />
            <InfoBoxes />
            <AddonStrip />
          </section>

          <section className="blk3 booksec" id="book" aria-label={t('act_book_label')}>
            <BookingBox />
          </section>

          <section className="blk3" id="details">
            {infoTabs.length > 0 ? <InfoTabs label={t('act_tabs_label')} tabs={infoTabs} /> : null}
          </section>

          {reviews.length > 0 && reviewAverage !== null ? (
            <section className="blk3" id="reviews">
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
          <MobileBookBar />
        </BookingProvider>

        <section className={related.length > 0 ? 'arel' : 'arel arel-solo'}>
          {related.length > 0 ? (
            <RelatedRow
              title={t('act_similar_t')}
              items={related.map((other) => ({
                id: other.id,
                href: other.href,
                name: pick(other.name, lang, other.slug),
                area:
                  pickOptional(other.area, lang) ??
                  (other.region ? pick(other.region.label, lang) : null),
                price: other.priceMinor > 0 ? money(other.priceMinor, other.currency) : null,
                imageUrl: other.hero?.url ?? null,
                unavailable: other.unavailable === true,
              }))}
            />
          ) : null}
          <div className="panel map-card2">
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
            <div className="map-card2-foot">
              <span className="muted">
                {place ? t('act_map_card_b', { area: place }) : t('act_map_card_b_any')}
              </span>
              <div className="row" style={{ gap: 8 }}>
                {activity.meeting.mapUrl ? (
                  <a
                    className="btn btn-outline btn-sm"
                    href={activity.meeting.mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Icon name="pin" size={16} /> {t('act_map_google')}
                  </a>
                ) : null}
                <LinkButton href={mapHref} variant="secondary" size="sm" icon="map">
                  {t('act_map_card_btn')}
                </LinkButton>
              </div>
            </div>
          </div>
        </section>

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
      </div>
    </main>
  )
}

/** A list with green ticks (the information cards). */
function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="clist">
      {items.map((line) => (
        <li key={line}>
          <Icon name="check" size={15} stroke={2.4} />
          <span>{line}</span>
        </li>
      ))}
    </ul>
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
