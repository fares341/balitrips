/**
 * Itinerary detail.
 *
 * Ported from `ItineraryDetailPage` in
 * design/handoff/sections-bt/page-plans.jsx: hero with the day badge, overview,
 * "who it's for", the day-by-day timeline, recommended stops, and the sticky
 * price + delivery sidebar.
 *
 * Three things the handoff did that are not carried over.
 *
 * 1. **The synthesized day plan.** The prototype had no day table, so it built
 *    the timeline with `acts[i] -> day i+1` and printed a hard-coded
 *    "Free day to explore & relax" — in three inline language literals — for
 *    every day past the end of the activity list. An 8-day plan with 5 linked
 *    activities therefore claimed three rest days nobody had authored, and no
 *    editor could change a word of it. Days are rows now: `dayNumber` is the
 *    day, `activity` is what is booked that day, and a free day carries its own
 *    `title` and `description`. Nothing is invented — a free day with no copy
 *    renders as a bare day label rather than as fabricated prose.
 *
 * 2. **`findItinerary(id) || ITINERARIES[0]`.** Every unknown slug returned 200
 *    with the first itinerary's content: duplicate content for crawlers and,
 *    for a shared link with a typo, the wrong trip at the wrong price. Unknown
 *    slugs are `notFound()`.
 *
 * 3. **`${it.price}` behind a literal `$`.** Money is minor units plus an ISO
 *    code, rendered by `formatMoney`.
 */

import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { HOME_HREF } from '@/components/layout'
import { Breadcrumbs, LinkButton } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { isLocale, locales } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick, pickList, pickOptional } from '@/lib/content/localize'
import { getItineraryBySlug, listItineraries } from '@/lib/content/queries'
import { ENTITY_PATHS, type ActivitySummary } from '@/lib/content/types'
import { formatMoney } from '@/lib/money'
import { alternates } from '../_meta'
import { LinkedPlaces } from './linked-places'

const INDEX_HREF = ENTITY_PATHS.itinerary

/** The four delivery promises in the sidebar, in the design's order. */
const DELIVERY_KEYS = ['id_del1', 'id_del2', 'id_del3', 'id_del4'] as const

/**
 * Where the buy CTA sends the visitor.
 *
 * The cart is server-owned and is being built separately; this is the seam.
 * The selection travels as query parameters so nothing the visitor chose is
 * lost on the way, and a cart that ignores them still opens correctly.
 */
function addToTripHref(slug: string): string {
  const query = new URLSearchParams({ add: 'itinerary', slug })
  return `/cart?${query.toString()}`
}

/**
 * `generateMetadata` and the page body both need the record. React's `cache`
 * collapses them into one query per request instead of two.
 */
const loadItinerary = cache(getItineraryBySlug)

/**
 * Request-rendered: "Places in this itinerary" is redacted per viewer (a
 * subscriber sees the places their plan unlocks, a guest sees free ones), and
 * a cached page cannot be both. Same trade as /map.
 */
export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  const itineraries = await listItineraries()
  return locales.flatMap((locale) =>
    itineraries.map((itinerary) => ({ locale, slug: itinerary.slug })),
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()

  const itinerary = await loadItinerary(slug)
  if (!itinerary) return {}

  const t = await getTranslations({ locale })
  const name = pick(itinerary.name, locale, itinerary.slug)
  const blurb = pickOptional(itinerary.blurb, locale) ?? t('ih_sub')
  const href = `${INDEX_HREF}/${slug}`

  return {
    title: name,
    description: blurb,
    alternates: alternates(href, locale),
    openGraph: {
      type: 'article',
      title: name,
      description: blurb,
      images: itinerary.hero
        ? [
            {
              url: itinerary.hero.url,
              width: itinerary.hero.width,
              height: itinerary.hero.height,
              alt: pick(itinerary.hero.alt, locale, name),
            },
          ]
        : undefined,
    },
  }
}

export default async function ItineraryDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const itinerary = await loadItinerary(slug)
  if (!itinerary) notFound()

  const [t, format] = await Promise.all([getTranslations({ locale }), getFormatter({ locale })])

  const name = pick(itinerary.name, locale, itinerary.slug)
  const blurb = pickOptional(itinerary.blurb, locale)
  const details = pickOptional(itinerary.detailedDescription, locale)
  const audience = pickList(itinerary.audience, locale)

  /**
   * Recommended stops.
   *
   * Derived from the day plan rather than from a second list, so the chips can
   * never disagree with the timeline. Deduplicated: a two-day dive trip that
   * books the same operator twice is one stop, not two identical chips.
   */
  const stops: ActivitySummary[] = []
  const seen = new Set<string>()
  for (const day of itinerary.dayPlans) {
    if (day.activity !== null && !seen.has(day.activity.id)) {
      seen.add(day.activity.id)
      stops.push(day.activity)
    }
  }

  return (
    <main className="bt-detailwrap">
      <div className="wrap">
        <Breadcrumbs
          trail={[
            { label: t('c_home'), href: HOME_HREF },
            { label: t('svc_itin_t'), href: INDEX_HREF },
            { label: name },
          ]}
        />
      </div>

      <div className="wrap bt-detail-grid">
        <div className="bt-detail-main">
          <div className="bt-slider" style={{ borderRadius: 'var(--r-lg)' }}>
            <Photo
              src={itinerary.hero?.url}
              alt={pick(itinerary.hero?.alt, locale)}
              priority
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
            <div className="bt-dt-hero-veil" />
            <div style={{ position: 'absolute', insetInline: 0, bottom: 0, padding: 28 }}>
              <span className="tag" style={{ background: 'var(--orange)', color: '#fff' }}>
                {format.number(itinerary.days)} {t('c_days')}
              </span>
              <h1 style={{ fontSize: 'clamp(26px,4.5vw,40px)', color: '#fff', marginTop: 10 }}>
                {name}
              </h1>
            </div>
          </div>

          {blurb !== null && (
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t('id_overview')}</h2>
              <p className="lede" style={{ fontSize: 16 }}>
                {blurb}
              </p>
            </div>
          )}

          {(itinerary.includesMap || itinerary.isVip) && (
            <div className="row" style={{ gap: 8, marginBlockStart: 12 }}>
              {itinerary.isVip && <span className="tag tag-orange">VIP</span>}
              {itinerary.includesMap && (
                <span className="tag tag-forest">
                  <Icon name="pin" size={13} /> {t('id_includes_map')}
                </span>
              )}
            </div>
          )}

          {details !== null && (
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t('id_details')}</h2>
              <p style={{ fontSize: 15.5, lineHeight: 1.75, whiteSpace: 'pre-line' }}>{details}</p>
            </div>
          )}

          {itinerary.gallery.length > 0 && (
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t('id_gallery')}</h2>
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                }}
              >
                {itinerary.gallery.map((image) => (
                  <div
                    key={image.url}
                    style={{
                      position: 'relative',
                      aspectRatio: '4 / 3',
                      borderRadius: 12,
                      overflow: 'hidden',
                    }}
                  >
                    <Photo
                      src={image.url}
                      alt={pick(image.alt, locale)}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {audience.length > 0 && (
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t('id_audience')}</h2>
              <div className="row" style={{ gap: 8 }}>
                {audience.map((entry) => (
                  <span key={entry} className="tag tag-forest">
                    {entry}
                  </span>
                ))}
              </div>
            </div>
          )}

          {itinerary.dayPlans.length > 0 && (
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t('id_daybyday')}</h2>
              <ol className="bt-timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {itinerary.dayPlans.map((day) => {
                  const dayTitle = pickOptional(day.title, locale)
                  const dayNote = pickOptional(day.description, locale)
                  const activity = day.activity

                  return (
                    <li key={day.id} className="bt-tl-item">
                      <span className="bt-tl-day">
                        {t('dt_day_n')} {format.number(day.dayNumber)}
                      </span>

                      {activity !== null ? (
                        <>
                          {/*
                            A link, not the handoff's `<button onClick={navigate}>`:
                            middle-clickable, crawlable, and it keeps the locale
                            prefix through next-intl's Link.
                          */}
                          <Link href={activity.href} className="bt-tl-card">
                            <Photo
                              src={activity.hero?.url}
                              alt=""
                              radius={10}
                              style={{ width: 56, height: 56, flexShrink: 0 }}
                            />
                            <span style={{ textAlign: 'start', flex: 1, minWidth: 0 }}>
                              <span style={{ fontWeight: 700, fontSize: 14.5, display: 'block' }}>
                                {pick(activity.name, locale, activity.slug)}
                              </span>
                              {pickOptional(activity.area, locale) !== null && (
                                <span className="muted" style={{ fontSize: 12.5 }}>
                                  <Icon name="pin" size={12} color="var(--muted)" />{' '}
                                  {pick(activity.area, locale)}
                                </span>
                              )}
                            </span>
                            <Icon name="chevronr" size={16} color="var(--muted)" className="flip" />
                          </Link>

                          {dayNote !== null && (
                            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                              {dayNote}
                            </p>
                          )}
                        </>
                      ) : (
                        /*
                          The authored free day. Rendered only when an editor
                          actually wrote something — the handoff printed a
                          hard-coded rest-day sentence for every gap in its
                          synthesized plan, which claimed leisure days the
                          traveller had not bought.
                        */
                        (dayTitle !== null || dayNote !== null) && (
                          <div className="bt-tl-rest">
                            {dayTitle !== null && (
                              <strong
                                style={{
                                  display: 'block',
                                  fontStyle: 'normal',
                                  color: 'var(--forest)',
                                  marginBottom: dayNote !== null ? 4 : 0,
                                }}
                              >
                                {dayTitle}
                              </strong>
                            )}
                            {dayNote}
                          </div>
                        )
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>
          )}

          <LinkedPlaces itineraryId={itinerary.id} locale={locale} />

          {stops.length > 0 && (
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t('id_pins')}</h2>
              <div className="row" style={{ gap: 8 }}>
                {stops.map((stop) => (
                  <Link key={stop.id} href={stop.href} className="chip">
                    <Icon name="pin" size={14} color="var(--orange-deep)" />{' '}
                    {pick(stop.name, locale, stop.slug)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="bt-booking" aria-label={t('ih_buy')}>
          <div className="bt-booking-price">
            <span style={{ fontSize: 32, fontWeight: 800, color: 'var(--orange-deep)' }}>
              {formatMoney(itinerary.priceMinor, itinerary.currency, locale)}
            </span>
          </div>

          <div className="bt-summary" style={{ marginTop: 4 }}>
            <div className="bt-summary-t">{t('id_delivery')}</div>
            {DELIVERY_KEYS.map((key) => (
              <div key={key} className="bt-summary-row" style={{ alignItems: 'flex-start' }}>
                <span className="bt-check yes" style={{ marginTop: 2 }}>
                  <Icon name="check" size={13} color="var(--forest)" />
                </span>
                <span style={{ flex: 1, fontSize: 13.5 }}>{t(key)}</span>
              </div>
            ))}
          </div>

          {/*
            One CTA, not the handoff's two. Both of its buttons ran the same
            `addToTrip(mkItinerary(it))` and differed only in whether they
            navigated afterwards; with a server-owned cart the add IS the
            navigation, so a second button would be the same link twice.
          */}
          <LinkButton
            href={addToTripHref(itinerary.slug)}
            variant="orange"
            block
            style={{ marginTop: 14 }}
          >
            {t('ih_buy')}
          </LinkButton>
        </aside>
      </div>
    </main>
  )
}
