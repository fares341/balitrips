/**
 * All itineraries (itineraries phase 2, corrected spec §2.1, design 01).
 *
 * Hero, the two filters — number of days and who you travel with (youth /
 * couples / family, from `audience`) — kept in the URL (`?days=6&for=family`),
 * then the cards: cover, type, days, name, blurb, Studio's preview numbers,
 * «يبدأ من» + price, the «الأكثر طلبًا» badge and the map savings line
 * «+ الخريطة بـ Y بدل Z — وفّر X», every figure from the `itinerarySales`
 * settings. Then «ما لقيت اللي يناسبك؟ ← خصّص جدولك» (the existing custom
 * request, unchanged) and «كيف تشتغل؟».
 *
 * Cards come from the public allow-list DTO: no regions, places or day
 * content before purchase.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ChipLink, ChipRow } from '@/components/bt/chip'
import { ItineraryCard } from '@/components/cards'
import { Money } from '@/components/currency/currency-context'
import { HOME_HREF } from '@/components/layout'
import { Breadcrumbs, LinkButton } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { isLocale, locales } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import { ENTITY_PATHS } from '@/lib/content/types'
import { listPublicItineraries, loadMapBundleOffer } from '@/lib/itineraries/public'
import {
  AUDIENCE_KEYS,
  isAudienceKey,
  publicAreasLine,
  type AudienceKey,
} from '@/lib/itineraries/public-dto'
import { readItinerarySales } from '@/lib/itineraries/sales-settings-store'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

import { CustomTripPrices } from '../_ui/custom-trip-prices'
import { CUSTOM_HREF } from '../_ui/routes-extra'
import { alternates } from './_meta'
import { toCardItinerary } from './_ui/card-props'
import { ItineraryHowItWorks } from './_ui/how-it-works'
import './_ui/itineraries.css'

const HREF = ENTITY_PATHS.itinerary

/** Above-the-fold row on the widest breakpoint is four cards. */
const PRIORITY_CARDS = 4

const AUDIENCE_LABEL: Record<AudienceKey, string> = {
  youth: 'it_aud_youth',
  couples: 'itl_aud_couples',
  family: 'itl_aud_family',
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const t = await getTranslations({ locale })
  return {
    title: t('svc_itin_t'),
    description: t('itl_sub'),
    alternates: alternates(HREF, locale),
    openGraph: {
      images: [DEFAULT_SHARE_IMAGE],
      type: 'website',
      title: t('itl_title'),
      description: t('itl_sub'),
    },
  }
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export default async function ItinerariesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const [t, itineraries, query, settings] = await Promise.all([
    getTranslations({ locale }),
    listPublicItineraries(),
    searchParams,
    readItinerarySales(),
  ])
  const offer = await loadMapBundleOffer(settings)
  const bannerSrc = itineraries[0]?.hero?.url ?? '/brand/flatlay.webp'

  // ?days=6 — the real lengths in the catalogue; unknown → all.
  const dayOptions = [...new Set(itineraries.map((one) => one.days))].sort((a, b) => a - b)
  const daysParam = Number(first(query.days))
  const days = dayOptions.includes(daysParam) ? daysParam : null
  // ?for=youth|couples|family — only the audiences some itinerary has.
  const audienceOptions = AUDIENCE_KEYS.filter((key) =>
    itineraries.some((one) => one.audienceKeys.includes(key)),
  )
  const forParam = first(query.for)
  const audience = isAudienceKey(forParam) && audienceOptions.includes(forParam) ? forParam : null

  const shown = itineraries.filter(
    (one) =>
      (days === null || one.days === days) &&
      (audience === null || one.audienceKeys.includes(audience)),
  )
  const hrefWith = (next: { days?: number | null; for?: AudienceKey | null }) => {
    const d = next.days === undefined ? days : next.days
    const a = next.for === undefined ? audience : next.for
    const qs = new URLSearchParams()
    if (d !== null) qs.set('days', String(d))
    if (a !== null) qs.set('for', a)
    const s = qs.toString()
    return s === '' ? HREF : `${HREF}?${s}`
  }

  const popular = pickOptional(settings.popularBadge, locale) ?? t('itl_popular')
  const mapLine =
    offer !== null && settings.options.withMap.enabled ? (
      <p className="it-card-map">
        <Icon name="map" size={14} />{' '}
        {offer.savingMinor > 0
          ? t.rich('itl_map_line', {
              price: () => <Money minor={offer.bundleMinor} currency={offer.currency} />,
              full: () => <Money minor={offer.fullMinor} currency={offer.currency} />,
              saving: () => <Money minor={offer.savingMinor} currency={offer.currency} />,
            })
          : t.rich('itl_map_line_plain', {
              price: () => <Money minor={offer.fullMinor} currency={offer.currency} />,
            })}
      </p>
    ) : null

  return (
    <main className="itl">
      <div className="bt-banner">
        <Photo
          src={bannerSrc}
          alt=""
          priority
          srcSetAvif={itineraries[0]?.hero?.srcSetAvif}
          srcSetWebp={itineraries[0]?.hero?.srcSetWebp}
          sizes="100vw"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        <div className="bt-banner-veil" />
        <div className="wrap bt-banner-inner">
          <Breadcrumbs
            light
            trail={[{ label: t('c_home'), href: HOME_HREF }, { label: t('svc_itin_t') }]}
          />
          <span
            className="tag"
            style={{ background: 'var(--orange)', color: '#fff', width: 'fit-content' }}
          >
            {t('itl_eyebrow')}
          </span>
          <h1 className="bt-banner-title">{t('itl_title')}</h1>
          <p className="bt-banner-sub">{t('itl_sub')}</p>
          {itineraries.length > 0 && (
            <p className="itl-count-hero">
              <b dir="ltr">{itineraries.length}</b> {t('itl_ready', { n: itineraries.length })}
            </p>
          )}
        </div>
      </div>

      <section className="bg-ivory sec-tight">
        <div className="wrap stack" style={{ gap: 16 }}>
          {itineraries.length > 0 && (
            <div className="panel it-filter">
              {dayOptions.length > 1 && (
                <div className="it-frow">
                  <span className="label" aria-hidden="true">
                    {t('it_f_days')}
                  </span>
                  <ChipRow scroll label={t('it_f_days')}>
                    <ChipLink href={hrefWith({ days: null })} active={days === null}>
                      {t('it_f_all')}
                    </ChipLink>
                    {dayOptions.map((n) => (
                      <ChipLink key={n} href={hrefWith({ days: n })} active={days === n}>
                        {t('c_days_n', { n })}
                      </ChipLink>
                    ))}
                  </ChipRow>
                </div>
              )}
              {audienceOptions.length > 0 && (
                <div className="it-frow">
                  <span className="label" aria-hidden="true">
                    {t('itl_f_for')}
                  </span>
                  <ChipRow scroll label={t('itl_f_for')}>
                    <ChipLink href={hrefWith({ for: null })} active={audience === null}>
                      {t('it_f_all')}
                    </ChipLink>
                    {audienceOptions.map((key) => (
                      <ChipLink key={key} href={hrefWith({ for: key })} active={audience === key}>
                        {t(AUDIENCE_LABEL[key])}
                      </ChipLink>
                    ))}
                  </ChipRow>
                </div>
              )}
            </div>
          )}

          <div className="itl-head">
            <h2 className="h2">{t('itl_pick_t')}</h2>
            <p className="muted">{t('itl_pick_b')}</p>
          </div>
          <p className="muted it-count">{t('it_count', { n: shown.length })}</p>
          {shown.length === 0 ? (
            <p className="muted center">{t('ah_none')}</p>
          ) : (
            <div className="grid pk-grid">
              {shown.map((itinerary, index) => (
                <ItineraryCard
                  key={itinerary.id}
                  itinerary={toCardItinerary(itinerary)}
                  priority={index < PRIORITY_CARDS}
                  badge={itinerary.isPopular ? popular : null}
                  stats={itinerary.stats.slice(0, 3).map((stat) => ({
                    icon: stat.icon,
                    value: stat.value,
                    label: pick(stat.label, locale),
                  }))}
                  extra={itinerary.includesMap ? null : mapLine}
                  areas={publicAreasLine(itinerary.areas, locale)}
                />
              ))}
            </div>
          )}

          <div className="panel row between it-custom">
            <span className="stack" style={{ gap: 4 }}>
              <b className="h3" style={{ color: 'var(--forest)' }}>
                {t('itl_custom_t')}
              </b>
              <span className="muted">{t('itl_custom_b')}</span>
              <CustomTripPrices />
            </span>
            <LinkButton href={CUSTOM_HREF} variant="forest">
              {t('itl_custom_cta')}
            </LinkButton>
          </div>

          <div className="it-how-wrap">
            <ItineraryHowItWorks locale={locale} photo={bannerSrc} />
          </div>
        </div>
      </section>
    </main>
  )
}
