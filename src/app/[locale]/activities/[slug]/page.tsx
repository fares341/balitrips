/**
 * Activity detail.
 *
 * Ported from `ActivityDetailPage` in
 * design/handoff/sections-bt/page-activities.jsx — the densest view in the
 * product: a slider, the editorial body, and a sticky booking engine, followed
 * by the contextual commerce rail (packages containing this activity,
 * itineraries featuring it, similar activities, reviews of it).
 *
 * Three structural corrections to the handoff:
 *
 *  1. **A wrong slug is a 404.** `findActivity(params.id) || ACTIVITIES[0]`
 *     answered every bad URL with 200 and the first record in the array —
 *     duplicate content for a crawler, and a booking form for the wrong tour
 *     for a human.
 *  2. **The page has a URL.** `navigate("activity", {id})` pushed `#activity`,
 *     so all fifteen activities shared one address. The route is
 *     `/activities/[slug]`, prerendered per locale, with canonical and
 *     hreflang for all three.
 *  3. **The cross-sell rails are queries, not array slices.** "Similar" took
 *     the first three entries in declaration order, so it was identical on
 *     every page; reviews were filtered by tag overlap with a
 *     `slice(0, 3)` fallback, which displayed other activities' reviews as if
 *     they belonged to this one.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ActivityCard, ItineraryCard, PackageCard, ReviewCard } from '@/components/cards'
import { Accordion, Breadcrumbs, Rating, Tag } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { defaultLocale, isLocale, locales, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
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

import { ActivityTiers } from './activity-tiers'
import { BookingEngine } from './booking-engine'
import { TierSelectionProvider } from './tier-selection'
import { ImageSlider } from './image-slider'

const HUB_PATH = ENTITY_PATHS.activity

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/** Category chips shown beside the title, as in the design. */
const MAX_CATEGORY_TAGS = 3

type PageProps = {
  params: Promise<{ locale: string; slug: string }>
}

/**
 * Prerender every published activity, once per locale.
 *
 * `listActivities` caps at 200 rows; beyond that, `dynamicParams` (on by
 * default) renders the tail on first request and caches it, so the catalogue
 * can outgrow this number without anything breaking.
 */
export async function generateStaticParams() {
  const activities = await listActivities({ limit: 200 })
  return activities.map((activity) => ({ slug: activity.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params
  const lang: Locale = isLocale(locale) ? locale : defaultLocale

  const activity = await getActivityBySlug(slug)
  // No metadata for a page that is about to 404 — the title would otherwise
  // describe a record the visitor never sees.
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

  const [t, packages, itineraries, similar, reviews, vehicles] = await Promise.all([
    getTranslations(),
    packagesWithActivity(activity.id),
    itinerariesWithActivity(activity.id),
    similarActivities(activity.id, 3),
    reviewsForActivity(activity.id),
    listDriverVehicles(),
  ])

  const name = pick(activity.name, lang, activity.slug)
  const area = pickOptional(activity.area, lang)
  const duration = pickOptional(activity.duration, lang)
  const description = pickOptional(activity.description, lang)
  const included = pickList(activity.included, lang)
  const excluded = pickList(activity.excluded, lang)

  const cancellation = pickOptional(activity.cancellationPolicy, lang) ?? t('ad_cancel_b')

  /**
   * FAQ.
   *
   * Falls back to the three site-level questions from the design when the
   * record carries none. These are about the *booking process* — confirmation,
   * weather rescheduling, suitability — so they are true of every activity.
   * `included` / `excluded` deliberately do NOT fall back the same way: those
   * are itemised commercial promises ("hotel pickup & drop-off"), and printing
   * a default set under an activity that does not offer them is a promise the
   * operator has to honour or refund.
   */
  const faq =
    activity.faq.length > 0
      ? activity.faq.map((entry, index) => ({
          id: `faq-${index}`,
          question: pick(entry.q, lang),
          answer: pick(entry.a, lang),
        }))
      : ([1, 2, 3] as const).map((index) => ({
          id: `faq-default-${index}`,
          question: t(`ad_faq${index}_q`),
          answer: t(`ad_faq${index}_a`),
        }))

  const sliderImages = activity.gallery.map((image) => ({
    id: image.id,
    url: image.url,
    alt: pick(image.alt, lang, name),
  }))

  return (
    <main className="bt-detailwrap">
      <div className="wrap">
        <Breadcrumbs
          label={t('c_breadcrumb')}
          trail={[
            { label: t('c_home'), href: '/' },
            { label: t('navr_act'), href: HUB_PATH },
            { label: name },
          ]}
        />
      </div>

      <TierSelectionProvider>
        <div className="wrap bt-detail-grid">
          <div className="bt-detail-main">
          <ImageSlider images={sliderImages} fallbackAlt={name} />

          <div className="bt-detail-head">
            {activity.categories.length > 0 && (
              <div className="row" style={{ gap: 8 }}>
                {activity.categories.slice(0, MAX_CATEGORY_TAGS).map((category) => (
                  <Tag key={category.id} variant="forest">
                    {pick(category.label, lang, category.key)}
                  </Tag>
                ))}
              </div>
            )}

            <h1 style={{ fontSize: 'clamp(28px,5vw,42px)', marginTop: 12 }}>{name}</h1>

            <div className="bt-detail-meta">
              {activity.rating !== null && (
                <Rating value={activity.rating} count={activity.reviewCount} />
              )}
              {area !== null && (
                <span>
                  <Icon name="pin" size={15} color="var(--muted)" /> {area}
                </span>
              )}
              {duration !== null && (
                <span>
                  <Icon name="clock" size={15} color="var(--muted)" /> {duration}
                </span>
              )}
            </div>
          </div>

          {description !== null && (
            <section className="bt-detail-block">
              <h2 className="bt-detail-h">{t('ad_about')}</h2>
              <p className="lede" style={{ fontSize: 16 }}>
                {description}
              </p>
            </section>
          )}

          {activity.gallery.length > 0 && (
            <section className="bt-detail-block">
              <h2 className="bt-detail-h">{t('ad_gallery')}</h2>
              <div className="bt-gallery-grid">
                {activity.gallery.map((image) => (
                  // Decorative here: the same images carry their alt text in
                  // the slider directly above.
                  <Photo
                    key={image.id}
                    src={image.url}
                    alt=""
                    radius={12}
                    style={{ height: 120 }}
                  />
                ))}
              </div>
            </section>
          )}

          {(included.length > 0 || excluded.length > 0) && (
            <div className="bt-incexc">
              {included.length > 0 && (
                <section>
                  <h2 className="bt-detail-h">{t('ad_inc')}</h2>
                  <ul className="bt-checklist">
                    {included.map((line) => (
                      <li key={line}>
                        <span className="bt-check yes" aria-hidden="true">
                          <Icon name="check" size={14} color="var(--forest)" />
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {excluded.length > 0 && (
                <section>
                  <h2 className="bt-detail-h">{t('ad_exc')}</h2>
                  <ul className="bt-checklist">
                    {excluded.map((line) => (
                      <li key={line}>
                        <span className="bt-check no" aria-hidden="true">
                          <Icon name="cross" size={13} color="var(--orange-deep)" />
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          <section className="bt-detail-block">
            <h2 className="bt-detail-h">{t('ad_cancel')}</h2>
            <div className="bt-cancel">
              <Icon name="shield" size={20} color="var(--forest)" />
              <p className="muted" style={{ margin: 0, fontSize: 14.5 }}>
                {cancellation}
              </p>
            </div>
          </section>

            <section className="bt-detail-block">
              <h2 className="bt-detail-h">{t('ad_faq')}</h2>
              <Accordion items={faq} />
            </section>
          </div>

          <BookingEngine
            activityId={activity.id}
            priceMinor={activity.priceMinor}
            currency={activity.currency}
            timeSlots={activity.timeSlots}
            maxGuests={activity.maxGuests}
            leadTimeHours={activity.leadTimeHours}
            vehicles={vehicles}
          />
        </div>

        {/*
          Full width, outside the two-column grid.
          Inside it the cards shared a ~763px main column beside the 360px
          booking sidebar, so a 4-across row resolved to 3 columns and wrapped
          the fourth onto a second row by itself — an 810px grid with a visible
          hole where a 400px one should be. It stays within the provider, so
          choosing a tier still reaches the booking box above it.
        */}
        <div className="wrap">
          <ActivityTiers
            tiers={activity.tiers}
            area={pickOptional(activity.area, lang)}
            duration={pickOptional(activity.duration, lang)}
            timeSlots={activity.timeSlots}
            maxGuests={activity.maxGuests}
            hero={activity.hero}
          />
        </div>
      </TierSelectionProvider>

      <div className="wrap">
        {packages.length > 0 && (
          <section className="bt-related">
            <h2 className="bt-related-h">{t('ad_bundles')}</h2>
            <div className="grid bt-grid-3auto">
              {packages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          </section>
        )}

        {itineraries.length > 0 && (
          <section className="bt-related">
            <h2 className="bt-related-h">{t('ad_initin')}</h2>
            <div className="grid bt-grid-3auto">
              {itineraries.map((itinerary) => (
                <ItineraryCard key={itinerary.id} itinerary={itinerary} />
              ))}
            </div>
          </section>
        )}

        {similar.length > 0 && (
          <section className="bt-related">
            <h2 className="bt-related-h">{t('ad_similar')}</h2>
            <div className="grid bt-grid-3auto">
              {similar.map((other) => (
                <ActivityCard key={other.id} activity={other} />
              ))}
            </div>
          </section>
        )}

        {reviews.length > 0 && (
          <section className="bt-related">
            <h2 className="bt-related-h">{t('ad_revtitle')}</h2>
            <div className="hscroll" style={{ gap: 16 }}>
              {reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
