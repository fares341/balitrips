/**
 * Itineraries hub.
 *
 * Ported from `ItinerariesPage` in
 * design/handoff/sections-bt/page-plans.jsx — banner, then the 4-up grid.
 *
 * Two differences from the handoff, both forced by the move off the in-memory
 * `ITINERARIES` array:
 *
 *  - The banner photograph is the first itinerary's hero rather than a
 *    loremflickr URL synthesised from the tag string `"lempuyang,temple"`. The
 *    prototype's banner images were random every deploy; this one is content.
 *  - An empty catalogue renders the "nothing matches" copy instead of an empty
 *    grid. `ITINERARIES` was a literal and could never be empty; a table can.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ChipLink, ChipRow } from '@/components/bt/chip'
import { ItineraryCard } from '@/components/cards'
import { Breadcrumbs, LinkButton } from '@/components/shared'
import { Icon, Photo, type IconName } from '@/components/ui'
import { isLocale, locales } from '@/i18n/config'
import {
  BUDGET_TIER_LABEL,
  BUDGET_TIERS,
  parseBudgetTier,
  tierForPrice,
  type BudgetTier,
} from '@/lib/budget-tier'
import { listItineraries } from '@/lib/content/queries'
import { ENTITY_PATHS } from '@/lib/content/types'
import { HOME_HREF } from '@/components/layout'
import { CUSTOM_HREF } from '../_ui/routes-extra'
import { alternates } from './_meta'

const HREF = ENTITY_PATHS.itinerary

/** Above-the-fold row on the widest breakpoint is four cards. */
const PRIORITY_CARDS = 4

/** The four promises above the list (v3 itineraries.html). */
const FEATURES_ROW: readonly { icon: IconName; key: string }[] = [
  { icon: 'doc', key: 'it_ft1' },
  { icon: 'map', key: 'it_ft2' },
  { icon: 'clock', key: 'it_ft3' },
  { icon: 'download', key: 'it_ft4' },
]

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
    // `ih_title` is a sentence with a full stop — right for an <h1>, wrong
    // inside the "%s · Bali Trips" template. The nav label is the title.
    title: t('svc_itin_t'),
    description: t('ih_sub'),
    alternates: alternates(HREF, locale),
    openGraph: {
      type: 'website',
      title: t('ih_title'),
      description: t('ih_sub'),
    },
  }
}

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

  const [t, itineraries, query] = await Promise.all([
    getTranslations({ locale }),
    listItineraries(),
    searchParams,
  ])

  const banner = itineraries[0]?.hero ?? null
  /** The package's banner photo when no itinerary has one. */
  const bannerSrc = banner?.url ?? '/brand/flatlay.jpg'

  // Budget category filter (?budget=economy|mid|luxury); unknown → all.
  const tier = parseBudgetTier(query.budget)
  const tiers = itineraries.map((itinerary) => ({
    itinerary,
    tier: tierForPrice(itinerary.priceMinor, itinerary.currency, 'itinerary'),
  }))
  const counts = Object.fromEntries(
    BUDGET_TIERS.map((key) => [key, tiers.filter((one) => one.tier === key).length]),
  ) as Record<BudgetTier, number>
  // Number of days (?days=5): the real lengths in the catalogue.
  const dayOptions = [...new Set(itineraries.map((itinerary) => itinerary.days))].sort(
    (a, b) => a - b,
  )
  const daysParam = Number(Array.isArray(query.days) ? query.days[0] : query.days)
  const days = dayOptions.includes(daysParam) ? daysParam : null
  const shown = tiers
    .filter(
      (one) =>
        (tier === null || one.tier === tier) && (days === null || one.itinerary.days === days),
    )
    .map((one) => one.itinerary)
  /** This listing with one filter changed and the other kept. */
  const hrefWith = (next: { days?: number | null; budget?: BudgetTier | null }) => {
    const d = next.days === undefined ? days : next.days
    const b = next.budget === undefined ? tier : next.budget
    const params = new URLSearchParams()
    if (d !== null) params.set('days', String(d))
    if (b !== null) params.set('budget', b)
    const qs = params.toString()
    return qs === '' ? HREF : `${HREF}?${qs}`
  }

  return (
    <main>
      <div className="bt-banner">
        <Photo
          src={bannerSrc}
          alt=""
          priority
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
            {t('pkg_eyebrow')}
          </span>
          <h1 className="bt-banner-title">{t('ih_title')}</h1>
          <p className="bt-banner-sub">{t('ih_sub')}</p>
        </div>
      </div>

      {/* What every itinerary gives you (v3 itineraries.html) */}
      <section className="sec-tight it-feat-sec">
        <ul className="wrap it-feat" role="list">
          {FEATURES_ROW.map((feature) => (
            <li key={feature.key}>
              <span className="ic" aria-hidden="true">
                <Icon name={feature.icon} size={18} />
              </span>
              <span>
                <b>{t(`${feature.key}_t`)}</b>
                <span className="muted">{t(`${feature.key}_b`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

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
              <div className="it-frow">
                <span className="label" aria-hidden="true">
                  {t('it_f_budget')}
                </span>
                <ChipRow scroll label={t('ct_budget')}>
                  <ChipLink href={hrefWith({ budget: null })} active={tier === null}>
                    {t('bud_all')}
                  </ChipLink>
                  {BUDGET_TIERS.filter((key) => counts[key] > 0).map((key) => (
                    <ChipLink
                      key={key}
                      href={hrefWith({ budget: key })}
                      active={tier === key}
                      count={counts[key]}
                    >
                      {t(BUDGET_TIER_LABEL[key])}
                    </ChipLink>
                  ))}
                </ChipRow>
              </div>
            </div>
          )}
          <p className="muted it-count">{t('it_count', { n: shown.length })}</p>
          {shown.length === 0 ? (
            <p className="muted center">{t('ah_none')}</p>
          ) : (
            <div className="grid pk-grid">
              {shown.map((itinerary, index) => (
                <ItineraryCard
                  key={itinerary.id}
                  itinerary={itinerary}
                  priority={index < PRIORITY_CARDS}
                />
              ))}
            </div>
          )}

          <div className="panel row between it-custom">
            <span className="stack" style={{ gap: 4 }}>
              <b className="h3" style={{ color: 'var(--forest)' }}>
                {t('it_custom_t')}
              </b>
              <span className="muted">{t('it_custom_b')}</span>
            </span>
            <LinkButton href={CUSTOM_HREF} variant="forest">
              {t('it_custom_cta')}
            </LinkButton>
          </div>
        </div>
      </section>
    </main>
  )
}
