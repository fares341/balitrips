/**
 * Itinerary detail.
 *
 * Ported from `ItineraryDetailPage` in
 * design/handoff/sections-bt/page-plans.jsx: hero with the day badge, overview,
 * "who it's for", the day-by-day timeline, recommended stops, and the sticky
 * price sidebar.
 *
 * Presented in the reference site's detail layout: a full-bleed photo hero
 * with the title and price line, a white bar straddling its edge (the two
 * delivery promises, price and buy button), a strip of key facts read from
 * the row, then — after the plan — what's included, a short FAQ and an
 * "ask an expert" contact block. No date/guest search: an itinerary is a
 * download, not a dated booking.
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
 *    code, rendered by `formatPrice` (`formatMoney` minus zero cents).
 */

import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { HOME_HREF } from '@/components/layout'
import { CONTACT_EMAIL, WHATSAPP_DISPLAY, whatsappLink } from '@/components/layout/contact-config'
import { Accordion, Breadcrumbs, LinkButton } from '@/components/shared'
import { Icon, Photo, type IconName } from '@/components/ui'
import { isLocale, locales } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { can } from '@/lib/auth/roles'
import { getUser } from '@/lib/auth/session'
import { ownsItinerary } from '@/lib/content/extra-queries'
import { pick, pickList, pickOptional } from '@/lib/content/localize'
import { getItineraryBySlug, listItineraries } from '@/lib/content/queries'
import { ENTITY_PATHS, type ActivitySummary } from '@/lib/content/types'
import { alternates } from '../_meta'
import { formatPrice } from '../../_ui/price'
import { LinkedPlaces } from './linked-places'

const INDEX_HREF = ENTITY_PATHS.itinerary

/** The four delivery promises, in the design's order — the inclusions list. */
const DELIVERY_KEYS = ['id_del1', 'id_del2', 'id_del3', 'id_del4'] as const

/** The two promises in the hero's trust bar, beside the price. */
const TRUST_KEYS: readonly { icon: IconName; key: string }[] = [
  { icon: 'check', key: 'id_del1' },
  { icon: 'whatsapp', key: 'id_del4' },
]

/** Question/answer key pairs for the FAQ block; the map answer depends on the row. */
const FAQ_KEYS = [
  { q: 'home_faq2_q', a: 'home_faq2_a' },
  { q: 'it_faq_change_q', a: 'it_faq_change_a' },
  { q: 'it_faq_driver_q', a: 'it_faq_driver_a' },
] as const

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
   * The day-by-day plan IS the product. Buyers (a settled, unrefunded order
   * line) and staff see all of it; everyone else sees day 1 in full and only
   * the remaining days' numbers and authored titles. The split happens here on
   * the server — the hidden days' activities and notes are never rendered, so
   * they never reach the RSC payload.
   */
  const viewer = await getUser()
  const fullPlan =
    viewer !== null &&
    (can(viewer.role, 'content.read') || (await ownsItinerary(viewer.id, itinerary.id)))
  const orderedDays = [...itinerary.dayPlans].sort((a, b) => a.dayNumber - b.dayNumber)
  const openDays = fullPlan ? orderedDays : orderedDays.slice(0, 1)
  const lockedDays = fullPlan
    ? []
    : orderedDays.slice(1).map((day) => ({
        id: day.id,
        dayNumber: day.dayNumber,
        title: pickOptional(day.title, locale),
      }))

  /**
   * Recommended stops.
   *
   * Derived from the day plan rather than from a second list, so the chips can
   * never disagree with the timeline. Deduplicated: a two-day dive trip that
   * books the same operator twice is one stop, not two identical chips.
   */
  const stops: ActivitySummary[] = []
  const seen = new Set<string>()
  for (const day of openDays) {
    if (day.activity !== null && !seen.has(day.activity.id)) {
      seen.add(day.activity.id)
      stops.push(day.activity)
    }
  }

  const regionNames = itinerary.regions.map((region) => pick(region.label, locale, region.key))
  const tripType = pickOptional(itinerary.tripType, locale)
  const price = formatPrice(itinerary.priceMinor, itinerary.currency, locale)
  const wa = whatsappLink(`${t('it_wa_prefix')} ${name}`)

  /**
   * Key facts, all read from the row. A fact the record does not carry is
   * left out rather than shown as a placeholder.
   */
  const facts: { icon: IconName; text: string }[] = [
    { icon: 'cal', text: t('c_days_n', { n: itinerary.days }) },
    ...(itinerary.spots !== null
      ? [{ icon: 'pin' as const, text: t('hi_spots_n', { n: itinerary.spots }) }]
      : []),
    { icon: 'pdf', text: t('it_fact_pdf') },
    ...(itinerary.includesMap ? [{ icon: 'route' as const, text: t('id_includes_map') }] : []),
    ...(itinerary.isVip ? [{ icon: 'star' as const, text: t('it_fact_vip') }] : []),
    ...(regionNames.length > 0
      ? [{ icon: 'globe' as const, text: new Intl.ListFormat(locale).format(regionNames) }]
      : []),
    ...(tripType !== null ? [{ icon: 'users' as const, text: tripType }] : []),
  ]

  const faq = [
    ...FAQ_KEYS.map((entry) => ({ id: entry.q, question: t(entry.q), answer: t(entry.a) })),
    {
      id: 'it_faq_map',
      question: t('it_faq_map_q'),
      answer: t(itinerary.includesMap ? 'it_faq_map_yes' : 'it_faq_map_no'),
    },
  ]

  return (
    <main className="bt-detailwrap bt-itin">
      <section className="bt-ihero" aria-labelledby="itin-title">
        <div className="bt-ihero-media" aria-hidden="true">
          <Photo
            src={itinerary.hero?.url}
            srcSetAvif={itinerary.hero?.srcSetAvif}
            srcSetWebp={itinerary.hero?.srcSetWebp}
            sizes="100vw"
            alt=""
            priority
          />
        </div>
        <div className="bt-ihero-veil" aria-hidden="true" />

        <div className="wrap bt-ihero-inner">
          <Breadcrumbs
            light
            label={t('c_breadcrumb')}
            trail={[
              { label: t('c_home'), href: HOME_HREF },
              { label: t('svc_itin_t'), href: INDEX_HREF },
              { label: name },
            ]}
          />

          <div className="bt-ihero-chips">
            <span className="bt-ihero-chip is-brand">{t('c_days_n', { n: itinerary.days })}</span>
            {itinerary.isVip && <span className="bt-ihero-chip">VIP</span>}
            {itinerary.includesMap && (
              <span className="bt-ihero-chip">
                <Icon name="pin" size={13} /> {t('id_includes_map')}
              </span>
            )}
          </div>

          <h1 id="itin-title" className="bt-ihero-title">
            {name}
          </h1>

          <p className="bt-ihero-line">
            <span>
              <strong className="bt-money">{price}</strong> / {t('sub_once')}
            </span>
            {itinerary.spots !== null && <span>{t('hi_spots_n', { n: itinerary.spots })}</span>}
          </p>
        </div>

        {/* The bar the reference site uses for its date search, carrying
            what this product actually has: the promises, the price and the
            one action. */}
        <div className="wrap">
          <div className="bt-ibar">
            <ul className="bt-ibar-trust">
              {TRUST_KEYS.map((item) => (
                <li key={item.key}>
                  <span className="bt-ibar-ic" aria-hidden="true">
                    <Icon name={item.icon} size={17} />
                  </span>
                  {t(item.key)}
                </li>
              ))}
            </ul>
            <div className="bt-ibar-buy">
              <span className="bt-ibar-price">
                <strong className="bt-money">{price}</strong>
                <span>{t('sub_once')}</span>
              </span>
              <LinkButton href={addToTripHref(itinerary.slug)} variant="orange">
                {t('ih_buy')}
              </LinkButton>
            </div>
          </div>
        </div>
      </section>

      <div className="wrap">
        <ul className="bt-ifacts">
          {facts.map((fact) => (
            <li key={fact.text}>
              <span className="bt-ifacts-ic" aria-hidden="true">
                <Icon name={fact.icon} size={20} stroke={1.6} />
              </span>
              {fact.text}
            </li>
          ))}
        </ul>
      </div>

      <div className="wrap bt-detail-grid">
        <div className="bt-detail-main">
          {blurb !== null && (
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t('id_overview')}</h2>
              <p className="lede" style={{ fontSize: 16 }}>
                {blurb}
              </p>
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
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
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

          {orderedDays.length > 0 && (
            <div className="bt-detail-block">
              <h2 className="bt-detail-h">{t('id_daybyday')}</h2>
              <ol className="bt-timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {openDays.map((day) => {
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
                {lockedDays.map((day) => (
                  <li key={day.id} className="bt-tl-item" aria-disabled="true">
                    <span className="bt-tl-day">
                      {t('dt_day_n')} {format.number(day.dayNumber)}
                    </span>
                    <div
                      className="bt-tl-rest"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.75 }}
                    >
                      <Icon name="lock" size={14} color="var(--muted)" />
                      <strong style={{ fontStyle: 'normal', color: 'var(--forest)' }}>
                        {day.title ?? t('id_locked_day')}
                      </strong>
                    </div>
                  </li>
                ))}
              </ol>
              {lockedDays.length > 0 && (
                <div
                  role="note"
                  className="bt-summary"
                  style={{ marginTop: 14, display: 'grid', gap: 10, justifyItems: 'start' }}
                >
                  <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="lock" size={16} color="var(--orange-deep)" />
                    {t('id_locked_t')}
                  </strong>
                  <span className="muted" style={{ fontSize: 13.5 }}>
                    {t('id_locked_b', { count: lockedDays.length })}
                  </span>
                  <LinkButton href={addToTripHref(itinerary.slug)} variant="orange">
                    {t('ih_buy')}
                  </LinkButton>
                </div>
              )}
            </div>
          )}

          <LinkedPlaces itineraryId={itinerary.id} locale={locale} />

          <div className="bt-detail-block">
            <h2 className="bt-detail-h">{t('it_inc_title')}</h2>
            <ul className="bt-iinc">
              <li>
                <span className="bt-pcheck" aria-hidden="true">
                  <Icon name="check" size={14} stroke={2.2} />
                </span>
                {t('it_inc_days', { n: itinerary.days })}
              </li>
              {DELIVERY_KEYS.map((key) => (
                <li key={key}>
                  <span className="bt-pcheck" aria-hidden="true">
                    <Icon name="check" size={14} stroke={2.2} />
                  </span>
                  {t(key)}
                </li>
              ))}
              {itinerary.includesMap && (
                <li>
                  <span className="bt-pcheck" aria-hidden="true">
                    <Icon name="check" size={14} stroke={2.2} />
                  </span>
                  {t('id_includes_map')}
                </li>
              )}
            </ul>
          </div>

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
          <div className="bt-detail-block">
            <h2 className="bt-detail-h">{t('ad_faq')}</h2>
            <Accordion className="bt-pacc" defaultOpen={-1} items={faq} />
          </div>

          <div className="bt-expert">
            <div>
              <h2 className="bt-expert-t">{t('it_expert_t')}</h2>
              <p className="bt-expert-b">{t('it_expert_b')}</p>
            </div>
            <div className="bt-expert-links">
              {wa !== null && (
                <a href={wa} className="bt-expert-link" target="_blank" rel="noopener noreferrer">
                  <Icon name="whatsapp" size={18} />
                  <span>
                    <strong>WhatsApp</strong>
                    <span dir="ltr">{WHATSAPP_DISPLAY}</span>
                  </span>
                </a>
              )}
              <a href={`mailto:${CONTACT_EMAIL}`} className="bt-expert-link">
                <Icon name="mail" size={18} />
                <span>
                  <strong>{t('co_mail')}</strong>
                  <span dir="ltr">{CONTACT_EMAIL}</span>
                </span>
              </a>
              <Link href="/contact" className="bt-expert-link">
                <Icon name="phone" size={18} />
                <span>
                  <strong>{t('navr_contact')}</strong>
                  <span>{t('co_hours_b')}</span>
                </span>
              </Link>
            </div>
          </div>
        </div>

        <aside className="bt-booking bt-ibook" aria-label={t('ih_buy')}>
          <div className="bt-ibook-price">
            <strong className="bt-money">{price}</strong>
            <span>{t('sub_once')}</span>
          </div>
          <ul className="bt-ibook-facts">
            {DELIVERY_KEYS.slice(0, 2).map((key) => (
              <li key={key}>
                <Icon name="check" size={16} />
                {t(key)}
              </li>
            ))}
          </ul>

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
            style={{ marginTop: 16 }}
          >
            {t('ih_buy')}
          </LinkButton>
        </aside>
      </div>
    </main>
  )
}
