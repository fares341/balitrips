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

import { TierFilter } from '@/components/bt/tier-filter'
import { ItineraryCompact } from '@/components/cards'
import { Breadcrumbs } from '@/components/shared'
import { Photo } from '@/components/ui'
import { isLocale, locales } from '@/i18n/config'
import { BUDGET_TIERS, parseBudgetTier, tierForPrice, type BudgetTier } from '@/lib/budget-tier'
import { listItineraries } from '@/lib/content/queries'
import { ENTITY_PATHS } from '@/lib/content/types'
import { HOME_HREF } from '@/components/layout'
import { alternates } from './_meta'

const HREF = ENTITY_PATHS.itinerary

/** Above-the-fold row on the widest breakpoint is four cards. */
const PRIORITY_CARDS = 4

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

  // Budget category filter (?budget=economy|mid|luxury); unknown → all.
  const tier = parseBudgetTier(query.budget)
  const tiers = itineraries.map((itinerary) => ({
    itinerary,
    tier: tierForPrice(itinerary.priceMinor, itinerary.currency, 'itinerary'),
  }))
  const counts = Object.fromEntries(
    BUDGET_TIERS.map((key) => [key, tiers.filter((one) => one.tier === key).length]),
  ) as Record<BudgetTier, number>
  const shown =
    tier === null
      ? itineraries
      : tiers.filter((one) => one.tier === tier).map((one) => one.itinerary)

  return (
    <main>
      <div className="bt-banner">
        <Photo
          src={banner?.url}
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

      <section className="bg-ivory sec-tight">
        <div className="wrap stack" style={{ gap: 16 }}>
          {itineraries.length > 0 && (
            <TierFilter basePath={HREF} active={tier} counts={counts} total={itineraries.length} />
          )}
          {shown.length === 0 ? (
            <p className="muted center">{t('ah_none')}</p>
          ) : (
            <div className="cc-grid cc-g4">
              {shown.map((itinerary, index) => (
                <ItineraryCompact
                  key={itinerary.id}
                  itinerary={itinerary}
                  priority={index < PRIORITY_CARDS}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
