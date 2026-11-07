/**
 * Itinerary page (itineraries phase 2, corrected spec §2.3, design 03).
 *
 * The plan IS the product, so nothing of its content is on this page before
 * purchase: no day titles or descriptions, no activities, no place names, no
 * linked places and no PDF links. Everything rendered comes from the public
 * allow-list DTO (`@/lib/itineraries/public`), which never reads those
 * columns — so they cannot reach the HTML or the RSC payload. A day is its
 * number, its teaser image and its «طابع اليوم»; the rest are «+X أيام».
 *
 * The package box has exactly two options, «الجدول فقط» and «الجدول +
 * الخريطة», priced on the server from the `itinerarySales` settings; the
 * second is hidden when the itinerary already includes the map (or the
 * viewer already holds map access). «متابعة» adds to the existing cart and
 * opens the existing checkout, which charges the server price again.
 */

import { cache, Fragment } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ItineraryCard } from '@/components/cards'
import { Money } from '@/components/currency/currency-context'
import { HOME_HREF } from '@/components/layout'
import { Breadcrumbs } from '@/components/shared'
import { Logo, Photo } from '@/components/ui'
import { BaliIcon, type BaliIconName } from '@/components/ui/bali-icon'
import { isLocale, locales, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { getUser } from '@/lib/auth/session'
import { pick, pickOptional } from '@/lib/content/localize'
import { ENTITY_PATHS } from '@/lib/content/types'
import { BUDGET_TIER_LABEL } from '@/lib/budget-tier'
import { itineraryAudience, itineraryTitle } from '@/lib/itineraries/display'
import {
  getPublicItinerary,
  listPublicItineraries,
  loadMapBundleOffer,
} from '@/lib/itineraries/public'
import {
  pageText,
  pickL10n,
  visibleSections,
  type PageSectionKey,
  type PageTextKey,
} from '@/lib/itineraries/page-content'
import type { PublicImage } from '@/lib/itineraries/public-dto'
import { holdsMapAccess } from '@/lib/itineraries/queries'
import { readItinerarySales } from '@/lib/itineraries/sales-settings-store'
import { fromPrice, pricedTiers } from '@/lib/itineraries/tiers'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

import { CUSTOM_HREF } from '../../_ui/routes-extra'
import { alternates } from '../_meta'
import { toCardItinerary } from '../_ui/card-props'
import { PackageBox, type PackageOption } from './package-box'
import '../_ui/itineraries.css'
import './itinerary-page.css'

const INDEX_HREF = ENTITY_PATHS.itinerary

const FAQ_KEYS = ['itp_faq1', 'itp_faq2', 'itp_faq3', 'itp_faq4'] as const

const loadItinerary = cache(getPublicItinerary)

/** The box hides «الجدول + الخريطة» from a viewer who already holds the map. */
export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  const itineraries = await listPublicItineraries()
  return locales.flatMap((locale) =>
    itineraries.map((itinerary) => ({ locale, slug: itinerary.slug })),
  )
}

const caption = (image: PublicImage | null, locale: Locale) =>
  image?.caption ? pickOptional(image.caption, locale) : null

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
  const name = itineraryTitle(itinerary.name, itinerary.slug, itinerary.days, locale, t)
  const title = pickOptional(itinerary.seoTitle, locale) ?? name
  const description =
    pickOptional(itinerary.seoDescription, locale) ??
    pickOptional(itinerary.blurb, locale) ??
    t('ih_sub')

  return {
    title,
    description,
    alternates: alternates(`${INDEX_HREF}/${slug}`, locale),
    openGraph: {
      type: 'article',
      title,
      description,
      images: itinerary.hero
        ? [{ url: itinerary.hero.url, width: itinerary.hero.width, height: itinerary.hero.height }]
        : [DEFAULT_SHARE_IMAGE],
    },
  }
}

export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const itinerary = await loadItinerary(slug)
  if (!itinerary) notFound()

  const [t, all, settings, viewer] = await Promise.all([
    getTranslations({ locale }),
    listPublicItineraries(),
    readItinerarySales(),
    getUser(),
  ])
  const offer = await loadMapBundleOffer(settings)
  const hasMap = await holdsMapAccess(viewer?.id ?? null)
  const others = all.filter((other) => other.id !== itinerary.id).slice(0, 3)

  const name = itineraryTitle(itinerary.name, itinerary.slug, itinerary.days, locale, t)
  const blurb = pickOptional(itinerary.blurb, locale)
  const intro = pickOptional(itinerary.intro, locale)
  const audience = itineraryAudience(itinerary.name, itinerary.audience, locale, t)
  const tiers = pricedTiers(itinerary.tierPrices)
  const planMinor = fromPrice(itinerary.priceMinor, itinerary.tierPrices)
  const planPrice = <Money minor={planMinor} currency={itinerary.currency} />

  // The two options — labels and badges from Studio.
  const label = (value: Partial<Record<string, string>>, fallback: string) =>
    pickOptional(value, locale) ?? fallback
  const options: PackageOption[] = []
  if (settings.options.itineraryOnly.enabled || itinerary.includesMap) {
    options.push({
      key: 'itineraryOnly',
      // An itinerary that already includes the map is not «الجدول فقط»: it is
      // sold as «الجدول + الخريطة», with the map included in its own price.
      label: itinerary.includesMap
        ? label(settings.options.withMap.label, t('itp_opt_map'))
        : label(settings.options.itineraryOnly.label, t('itp_opt_only')),
      badge: itinerary.includesMap
        ? null
        : pickOptional(settings.options.itineraryOnly.badge, locale),
      price: planPrice,
      was: null,
      saving: null,
      note: itinerary.includesMap ? t('itp_opt_only_map_b') : t('itp_opt_only_b'),
    })
  }
  const sellsMap =
    !itinerary.includesMap && !hasMap && offer !== null && settings.options.withMap.enabled
  if (sellsMap && offer !== null) {
    const same = offer.currency === itinerary.currency
    options.push({
      key: 'withMap',
      label: label(settings.options.withMap.label, t('itp_opt_map')),
      badge: pickOptional(settings.options.withMap.badge, locale),
      // One currency: one total. Otherwise the two parts, each in its own.
      price: same ? (
        <Money minor={planMinor + offer.bundleMinor} currency={offer.currency} />
      ) : (
        <>
          {planPrice} + <Money minor={offer.bundleMinor} currency={offer.currency} />
        </>
      ),
      was:
        offer.savingMinor > 0 && same ? (
          <Money minor={planMinor + offer.fullMinor} currency={offer.currency} />
        ) : null,
      saving:
        offer.savingMinor > 0
          ? t.rich('itp_save', {
              amount: () => <Money minor={offer.savingMinor} currency={offer.currency} />,
            })
          : null,
      note: t('itp_opt_map_b'),
    })
  }
  if (options.length === 0) {
    options.push({
      key: 'itineraryOnly',
      label: t('itp_opt_only'),
      badge: null,
      price: planPrice,
      was: null,
      saving: null,
      note: t('itp_opt_only_b'),
    })
  }

  const gallery = itinerary.gallery.slice(0, 5)
  const faq =
    itinerary.faq.length > 0
      ? itinerary.faq.map((row) => ({ q: pick(row.q, locale), a: pick(row.a, locale) }))
      : FAQ_KEYS.map((key) => ({ q: t(`${key}_q`), a: t(`${key}_a`) }))
  const hasMapStat = itinerary.stats.some((stat) => stat.icon === 'map' || stat.icon === 'pin')
  const benefits: { icon: BaliIconName; key: string; values?: Record<string, number> }[] = [
    { icon: 'calendar', key: 'itd_b_days', values: { n: itinerary.days } },
    { icon: 'food', key: 'itd_b_food' },
    ...(hasMapStat || itinerary.includesMap ? [{ icon: 'pin' as const, key: 'itd_b_map' }] : []),
    { icon: 'clock', key: 'itd_b_time' },
    { icon: 'tip', key: 'itd_b_tips' },
    { icon: 'phone', key: 'itd_b_pdf' },
  ]
  const howKeys = ['itd_how1', 'itd_how2', 'itd_how3'] as const
  // Studio «محتوى الصفحة»: a typed text wins; blank = the site default.
  const page = itinerary.page
  const text = (key: PageTextKey, fallback: string) => pageText(page, key, locale) ?? fallback
  const benefitRows =
    page.benefits !== null
      ? page.benefits.map((row, index) => ({
          key: `c${index}`,
          icon: row.icon,
          label: pickL10n(row.label, locale),
          text: pickL10n(row.text, locale),
        }))
      : benefits.map((benefit) => ({
          key: benefit.key,
          icon: benefit.icon,
          label: t(`${benefit.key}_t`),
          text: t(`${benefit.key}_b`, benefit.values ?? {}),
        }))
  const howRows =
    page.how !== null
      ? page.how.map((row, index) => ({
          key: `c${index}`,
          label: pickL10n(row.label, locale),
          text: pickL10n(row.text, locale),
        }))
      : howKeys.map((key) => ({ key, label: t(`${key}_t`), text: t(`${key}_b`) }))
  const order = visibleSections(page)
  const shows = (key: PageSectionKey) => order.includes(key)

  return (
    <main className="itp">
      <section className="itp-hero" aria-labelledby="itp-title">
        <div className="itp-hero-media" aria-hidden="true">
          <Photo
            src={itinerary.hero?.url}
            srcSetAvif={itinerary.hero?.srcSetAvif}
            srcSetWebp={itinerary.hero?.srcSetWebp}
            sizes="100vw"
            alt=""
            priority
          />
        </div>
        <div className="itp-hero-veil" aria-hidden="true" />
        <div className="wrap itp-hero-inner">
          <Breadcrumbs
            light
            label={t('c_breadcrumb')}
            trail={[
              { label: t('c_home'), href: HOME_HREF },
              { label: t('svc_itin_t'), href: INDEX_HREF },
              { label: name },
            ]}
          />
          <div className="itp-chips">
            <span className="itp-chip">{t('c_days_n', { n: itinerary.days })}</span>
            {audience.slice(0, 2).map((entry) => (
              <span key={entry} className="itp-chip">
                {entry}
              </span>
            ))}
            {itinerary.isPopular && (
              <span className="itp-chip is-hot">
                {pickOptional(settings.popularBadge, locale) ?? t('itl_popular')}
              </span>
            )}
          </div>
          <h1 id="itp-title" className="itp-title">
            {name}
          </h1>
          {blurb !== null && <p className="itp-lede">{blurb}</p>}
          <p className="itp-from">
            <span>{text('heroFrom', t('it_price_from'))}</span>{' '}
            <strong className="bt-money">{planPrice}</strong>
          </p>
        </div>
      </section>

      <div className="wrap itp-grid">
        <div className="itp-main">
          {order.map((key) => {
            switch (key) {
              case 'about':
                return (
                  <Fragment key={key}>
                    {(intro !== null || itinerary.stats.length > 0) && (
                      <section className="itp-card" aria-labelledby="itp-about">
                        <h2 className="itp-h" id="itp-about">
                          {text('aboutTitle', t('itd_about_t'))}
                        </h2>
                        {intro !== null && <p className="itp-intro">{intro}</p>}
                        {itinerary.stats.length > 0 && (
                          <ul className="itp-stats" role="list">
                            {itinerary.stats.slice(0, 4).map((stat) => (
                              <li key={`${stat.icon}-${stat.value}`}>
                                <b dir="ltr">{stat.value}</b>
                                <span>{pick(stat.label, locale)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    )}
                  </Fragment>
                )
              case 'get':
                return (
                  <Fragment key={key}>
                    {
                      <section className="itp-card" aria-labelledby="itp-get">
                        <h2 className="itp-h" id="itp-get">
                          {text('getTitle', t('itd_get_t'))}
                        </h2>
                        <ul className="itp-benefits" role="list">
                          {benefitRows.map((benefit) => (
                            <li key={benefit.key}>
                              <span className="itp-bi">
                                <BaliIcon name={benefit.icon} size={24} />
                              </span>
                              <span>
                                <b>{benefit.label}</b>
                                {benefit.text !== '' && <small>{benefit.text}</small>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    }
                  </Fragment>
                )
              case 'gallery':
                return (
                  <Fragment key={key}>
                    {gallery.length > 0 && (
                      <section className="itp-card" aria-labelledby="itp-gal">
                        <h2 className="itp-h" id="itp-gal">
                          {text('galleryTitle', t('itp_shots_t'))}
                        </h2>
                        <ul className={`itp-gallery is-${Math.min(gallery.length, 5)}`} role="list">
                          {gallery.map((image, index) => {
                            const text = caption(image, locale)
                            return (
                              <li key={image.url}>
                                <figure>
                                  <Photo
                                    src={image.url}
                                    srcSetAvif={image.srcSetAvif}
                                    srcSetWebp={image.srcSetWebp}
                                    sizes={
                                      index === 0
                                        ? '(max-width: 620px) 100vw, 420px'
                                        : '(max-width: 620px) 50vw, 220px'
                                    }
                                    alt={text ?? name}
                                  />
                                  {text !== null && <figcaption>{text}</figcaption>}
                                </figure>
                              </li>
                            )
                          })}
                        </ul>
                      </section>
                    )}
                  </Fragment>
                )
              case 'days':
                return (
                  <Fragment key={key}>
                    {itinerary.teaserDays.length > 0 && (
                      <section className="itp-card" aria-labelledby="itp-days">
                        <h2 className="itp-h" id="itp-days">
                          {text('daysTitle', t('itd_days_t'))}
                        </h2>
                        <ol className="itp-days" role="list">
                          {itinerary.teaserDays.map((day) => (
                            <li key={day.dayNumber} className="itp-day">
                              {day.image !== null ? (
                                <Photo
                                  src={day.image.url}
                                  srcSetAvif={day.image.srcSetAvif}
                                  srcSetWebp={day.image.srcSetWebp}
                                  sizes="(max-width: 620px) 50vw, 200px"
                                  alt=""
                                />
                              ) : (
                                <span className="itp-day-fallback" aria-hidden="true">
                                  <Logo variant="light" onLight={false} height={26} alt="" />
                                </span>
                              )}
                              <span className="itp-day-shine" aria-hidden="true" />
                              <span className="itp-day-lock">
                                <BaliIcon name="lock" size={22} title={t('itd_day_locked')} />
                              </span>
                              <span className="itp-day-n">
                                <b dir="ltr">{String(day.dayNumber).padStart(2, '0')}</b>
                                <span>{t('itd_day_ord', { n: String(day.dayNumber) })}</span>
                              </span>
                            </li>
                          ))}
                        </ol>
                        <p className="itp-note">
                          <span className="itp-note-ic">
                            <BaliIcon name="unlock" size={18} />
                          </span>
                          {text('daysNote', t('itd_days_note'))}
                        </p>
                      </section>
                    )}
                  </Fragment>
                )
              case 'fit':
                return (
                  <Fragment key={key}>
                    {audience.length > 0 && (
                      <section className="itp-card" aria-labelledby="itp-fit">
                        <h2 className="itp-h" id="itp-fit">
                          {text('fitTitle', t('itd_fit_t'))}
                        </h2>
                        <ul className="itp-fit" role="list">
                          {audience.map((entry) => (
                            <li key={entry}>
                              <BaliIcon name="family" size={18} />
                              {entry}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </Fragment>
                )
              case 'how':
                return (
                  <Fragment key={key}>
                    {
                      <section className="itp-card" aria-labelledby="itp-how">
                        <h2 className="itp-h" id="itp-how">
                          {text('howTitle', t('itd_how_t'))}
                        </h2>
                        <ol className="itp-how" role="list">
                          {howRows.map((row, index) => (
                            <li key={row.key}>
                              <span className="itp-how-n" dir="ltr" aria-hidden="true">
                                {index + 1}
                              </span>
                              <b>{row.label}</b>
                              {row.text !== '' && <small>{row.text}</small>}
                            </li>
                          ))}
                        </ol>
                      </section>
                    }
                  </Fragment>
                )
              case 'faq':
                return (
                  <Fragment key={key}>
                    {
                      <section className="itp-card" aria-labelledby="itp-faq">
                        <h2 className="itp-h" id="itp-faq">
                          {text('faqTitle', t('itd_faq_t'))}
                        </h2>
                        <div className="itp-faq">
                          {faq.map((row, index) => (
                            <details key={`${index}-${row.q}`} open={index === 0}>
                              <summary>{row.q}</summary>
                              <p>{row.a}</p>
                            </details>
                          ))}
                        </div>
                      </section>
                    }
                  </Fragment>
                )
              default:
                return null
            }
          })}
        </div>

        <aside className="itp-aside" id="it-buy" aria-label={text('boxTitle', t('itp_box_t'))}>
          <PackageBox
            slug={itinerary.slug}
            title={text('boxTitle', t('itp_box_t'))}
            options={options}
            tiers={tiers.map((one) => ({
              key: one.key,
              label: t(BUDGET_TIER_LABEL[one.key]),
              price: <Money minor={one.priceMinor} currency={itinerary.currency} />,
            }))}
            footnote={text('boxFootnote', t('itp_digital'))}
            trust={{
              pay: text('trustPay', t('itd_trust_pay')),
              fast: text('trustFast', t('itd_trust_fast')),
              acts: text('actsLine', t('itp_acts_line')),
            }}
          />
        </aside>
      </div>

      {shows('custom') && (
        <section className="wrap itp-custom-wrap" aria-labelledby="itp-custom">
          <div className="itp-custom">
            <span className="itp-custom-art" aria-hidden="true">
              <BaliIcon name="map" size={40} />
            </span>
            <span className="itp-custom-text">
              <b id="itp-custom">{text('customTitle', t('itd_custom_t'))}</b>
              <span>{text('customBody', t('itd_custom_b'))}</span>
            </span>
            <Link href={CUSTOM_HREF} className="btn btn-primary itp-custom-cta">
              {text('customCta', t('itd_custom_cta'))} <span aria-hidden="true">←</span>
            </Link>
          </div>
        </section>
      )}

      {shows('others') && others.length > 0 && (
        <section className="sec bg-ivory2" aria-labelledby="it-others">
          <div className="wrap">
            <h2 className="h2" id="it-others" style={{ marginBottom: 20 }}>
              {text('othersTitle', t('it4_others'))}
            </h2>
            <div className="grid pk-grid">
              {others.map((other) => (
                <ItineraryCard key={other.id} itinerary={toCardItinerary(other)} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
