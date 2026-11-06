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

import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ItineraryCard } from '@/components/cards'
import { Money } from '@/components/currency/currency-context'
import { HOME_HREF } from '@/components/layout'
import { Breadcrumbs } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
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
import type { PublicImage } from '@/lib/itineraries/public-dto'
import { holdsMapAccess } from '@/lib/itineraries/queries'
import { readItinerarySales } from '@/lib/itineraries/sales-settings-store'
import { fromPrice, pricedTiers } from '@/lib/itineraries/tiers'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

import { CUSTOM_HREF } from '../../_ui/routes-extra'
import { alternates } from '../_meta'
import { ItineraryHowItWorks } from '../_ui/how-it-works'
import { toCardItinerary } from '../_ui/card-props'
import { PackageBox, type PackageOption } from './package-box'
import '../_ui/itineraries.css'

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

  const gallery = itinerary.gallery.slice(0, 7)

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
            <span className="itp-chip is-brand">
              <Icon name="cal" size={13} /> {t('c_days_n', { n: itinerary.days })}
            </span>
            {audience.map((entry) => (
              <span key={entry} className="itp-chip">
                <Icon name="users" size={13} /> {entry}
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
            {t('it_price_from')} <strong className="bt-money">{planPrice}</strong>
          </p>
        </div>
      </section>

      <div className="wrap itp-grid">
        <div className="itp-main">
          {gallery.length > 0 && (
            <section className="itp-block" aria-labelledby="itp-gal">
              <h2 className="itp-h" id="itp-gal">
                {t('itp_shots_t')}
              </h2>
              <p className="muted itp-sub">{t('itp_shots_b')}</p>
              <ul className="itp-gallery" role="list">
                {gallery.map((image, index) => {
                  const text = caption(image, locale)
                  return (
                    <li key={image.url} className={index === 0 ? 'is-big' : undefined}>
                      <Photo
                        src={image.url}
                        srcSetAvif={image.srcSetAvif}
                        srcSetWebp={image.srcSetWebp}
                        sizes="(max-width: 720px) 50vw, 360px"
                        alt={text ?? name}
                      />
                      {text !== null && <span className="itp-cap">{text}</span>}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {intro !== null && (
            <section className="itp-block" aria-labelledby="itp-intro">
              <h2 className="itp-h" id="itp-intro">
                {t('id_overview')}
              </h2>
              <p className="itp-intro">{intro}</p>
            </section>
          )}

          {itinerary.stats.length > 0 && (
            <section className="itp-block" aria-labelledby="itp-stats">
              <h2 className="itp-h" id="itp-stats">
                {t('itp_stats_t')}
              </h2>
              <ul className="itp-stats" role="list">
                {itinerary.stats.map((stat) => (
                  <li key={`${stat.icon}-${stat.value}`}>
                    <span className="itp-stat-ic" aria-hidden="true">
                      <Icon name={stat.icon} size={20} />
                    </span>
                    <b dir="auto">{stat.value}</b>
                    <span className="muted">{pick(stat.label, locale)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(itinerary.teaserDays.length > 0 || itinerary.moreDays > 0) && (
            <section className="itp-block" aria-labelledby="itp-days">
              <h2 className="itp-h" id="itp-days">
                {t('itp_days_t')}
              </h2>
              <p className="muted itp-sub">{t('itp_days_b')}</p>
              <ol className="itp-days" role="list">
                {itinerary.teaserDays.map((day) => (
                  <li key={day.dayNumber} className="itp-day">
                    <div className="itp-day-img">
                      <Photo
                        src={day.image?.url}
                        srcSetAvif={day.image?.srcSetAvif}
                        srcSetWebp={day.image?.srcSetWebp}
                        sizes="(max-width: 720px) 45vw, 220px"
                        alt=""
                      />
                      <span className="itp-day-n">{t('itp_day_n', { n: day.dayNumber })}</span>
                    </div>
                    {pickOptional(day.mood, locale) !== null && (
                      <span className="itp-day-mood">{pick(day.mood, locale)}</span>
                    )}
                  </li>
                ))}
                {itinerary.moreDays > 0 && (
                  <li className="itp-day is-more">
                    <Icon name="lock" size={18} />
                    <b>{t('itp_more_days', { n: itinerary.moreDays })}</b>
                    <small>{t('itp_more_days_b')}</small>
                  </li>
                )}
              </ol>
            </section>
          )}

          <p className="itp-acts-note" role="note">
            <Icon name="star" size={16} /> {t('itp_acts_line')}
          </p>

          <section className="itp-block" aria-labelledby="itp-faq">
            <h2 className="itp-h" id="itp-faq">
              {t('ad_faq')}
            </h2>
            <div className="itp-faq">
              {FAQ_KEYS.map((key) => (
                <details key={key}>
                  <summary>{t(`${key}_q`)}</summary>
                  <p className="muted">{t(`${key}_a`)}</p>
                </details>
              ))}
            </div>
          </section>

          <div className="itp-custom">
            <span>
              <b>{t('itl_custom_t')}</b>
              <span className="muted">{t('itl_custom_b')}</span>
            </span>
            <Link href={CUSTOM_HREF} className="btn btn-ghost btn-sm">
              {t('itl_custom_cta')}
            </Link>
          </div>
        </div>

        <aside className="itp-aside" id="it-buy" aria-label={t('itp_box_t')}>
          <PackageBox
            slug={itinerary.slug}
            title={t('itp_box_t')}
            options={options}
            tiers={tiers.map((one) => ({
              key: one.key,
              label: t(BUDGET_TIER_LABEL[one.key]),
              price: <Money minor={one.priceMinor} currency={itinerary.currency} />,
            }))}
            footnote={
              <>
                <Icon name="info" size={14} /> {t('itp_digital')}
              </>
            }
          />
        </aside>
      </div>

      <div className="sec bg-ivory">
        <div className="wrap">
          <ItineraryHowItWorks
            locale={locale}
            photo={itinerary.hero?.url ?? '/brand/flatlay.webp'}
            title={name}
            days={itinerary.days}
          />
        </div>
      </div>

      {others.length > 0 && (
        <section className="sec bg-ivory2" aria-labelledby="it-others">
          <div className="wrap">
            <h2 className="h2" id="it-others" style={{ marginBottom: 20 }}>
              {t('it4_others')}
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
