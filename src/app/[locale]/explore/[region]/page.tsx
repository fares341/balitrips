/**
 * Region — v3 screen 14 (design-reference/prototype/region.html).
 *
 *   banner (a real photo from the region) · facts (real counts) · the map
 *   card → /map?region= · the best activities here · hand-picked places
 *   (free map places) · itineraries that include the region · related
 *   services
 *
 * Real data only: a section with nothing in it is left out. Unknown keys 404.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { LinkButton, SectionHead } from '@/components/bt'
import { ActivityCard, ItineraryCard, PlaceCard } from '@/components/cards'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick } from '@/lib/content/localize'

import { alternatesFor, toLocale } from '../../_seo-hreflang'
import { PageBanner } from '../../_ui/page-banner'
import { CUSTOM_HREF } from '../../_ui/routes-extra'
import { regionHref, regionViews, type RegionView } from '../region-data'

const SHOWN = 6

type PageProps = { params: Promise<{ locale: string; region: string }> }

async function findRegion(locale: Locale, key: string): Promise<RegionView | null> {
  const views = await regionViews(locale)
  return views.find((one) => one.region.key === key) ?? null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw, region } = await params
  const locale = toLocale(raw)
  const view = await findRegion(locale, region)
  if (!view) notFound()
  const t = await getTranslations({ locale })
  const name = pick(view.region.label, locale, view.region.key)
  return {
    title: name,
    description: t('rg4_sub', { region: name }),
    alternates: alternatesFor(regionHref(view.region.key), locale),
  }
}

export default async function RegionPage({ params }: PageProps) {
  const { locale: raw, region } = await params
  setRequestLocale(raw)
  const locale = toLocale(raw)
  const view = await findRegion(locale, region)
  if (!view) notFound()

  const t = await getTranslations({ locale })
  const name = pick(view.region.label, locale, view.region.key)

  const facts = [
    { label: t('rg4_f_acts'), value: view.activities.length },
    { label: t('rg4_f_places'), value: view.placeCount },
    { label: t('rg4_f_itins'), value: view.itineraries.length },
  ]

  return (
    <main>
      <PageBanner
        imageSrc={view.image ?? '/brand/rice-walk.webp'}
        tag={t('navr_explore')}
        title={name}
        subtitle={t('rg4_sub', { region: name })}
        breadcrumbLabel={t('c_breadcrumb')}
        trail={[
          { label: t('c_home'), href: '/' },
          { label: t('navr_explore'), href: '/explore' },
          { label: name },
        ]}
      />

      <section className="sec-tight">
        <div className="wrap stack" style={{ gap: 16 }}>
          <ul className="rg-facts" role="list">
            {facts.map((fact) => (
              <li key={fact.label}>
                <small className="muted">{fact.label}</small>
                <b dir="ltr">{fact.value}</b>
              </li>
            ))}
          </ul>

          <Link
            href={{ pathname: '/map', query: { region: view.region.key } }}
            className="rg-map"
            aria-label={t('rg4_map', { region: name })}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the island satellite still */}
            <img src="/map/bali-satellite.webp" alt="" loading="lazy" />
            <span className="btn btn-sm rg-map-btn">
              <Icon name="map" size={16} /> {t('rg4_map', { region: name })}
            </span>
          </Link>
        </div>
      </section>

      {view.activities.length > 0 && (
        <section className="sec-tight" aria-labelledby="rg-acts">
          <div className="wrap">
            <SectionHead
              id="rg-acts"
              title={t('rg4_acts_t')}
              action={
                <LinkButton href="/activities" variant="ghost">
                  {t('rg4_acts_all')}
                </LinkButton>
              }
            />
            <div className="grid g3">
              {view.activities.slice(0, SHOWN).map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        </section>
      )}

      {view.places.length > 0 && (
        <section className="sec-tight bg-ivory2" aria-labelledby="rg-places">
          <div className="wrap">
            <SectionHead id="rg-places" title={t('rg4_places_t')} />
            <div className="grid rg-places">
              {view.places.slice(0, 4).map((place) => (
                <PlaceCard key={place.id} place={place} showFree={false} />
              ))}
            </div>
          </div>
        </section>
      )}

      {view.itineraries.length > 0 && (
        <section className="sec-tight" aria-labelledby="rg-itins">
          <div className="wrap">
            <SectionHead id="rg-itins" title={t('rg4_itins_t')} />
            <div className="grid pk-grid">
              {view.itineraries.slice(0, 4).map((itinerary) => (
                <ItineraryCard key={itinerary.id} itinerary={itinerary} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="sec-tight">
        <div className="wrap">
          <div className="panel row between" style={{ gap: 14 }}>
            <b style={{ color: 'var(--forest)' }}>{t('rg4_related')}</b>
            <LinkButton href={CUSTOM_HREF} variant="ghost" size="sm">
              {t('svc_cust_t')}
            </LinkButton>
          </div>
        </div>
      </section>
    </main>
  )
}
