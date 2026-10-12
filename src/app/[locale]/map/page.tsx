/**
 * The interactive map.
 *
 * Ported from `MapPage` in design/handoff/sections-bt/page-map.jsx. The stage
 * itself lives in ./map-explorer.tsx; this file exists to do the one thing the
 * prototype could not: decide, on the server, what the browser is allowed to
 * know.
 *
 * REQUEST-RENDERED, ON PURPOSE. Every other content route in this app is
 * statically prerendered and served from the edge. This one calls `cookies()`
 * (via `getSessionUserId`) because the payload is different for an entitled
 * visitor than for an anonymous one, and a cached page cannot be both. Static
 * rendering here would mean shipping one payload to everybody and filtering it
 * client-side — the exact failure this port is correcting. The cost is one
 * origin round trip on one route.
 *
 * The redaction chain is `listMapPlaces()` → `buildMapPayload(places, held)`,
 * and only `payload` is ever passed to a Client Component. `places` — which
 * holds the names, coordinates, ratings, images and linked activities of every
 * gated place — is a server-local value that never reaches the RSC stream. The
 * handoff serialised all of it into the browser and hid it with `•••••` and
 * `filter: blur(4px)`, so the paywall was one devtools panel away from
 * irrelevant.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PlaceCard } from '@/components/cards'
import { SectionHead } from '@/components/shared'
import { Icon } from '@/components/ui'
import { defaultLocale, isLocale, locales, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { listLandmarks, listMapPlaces } from '@/lib/content/queries'
import { buildMapPayload, loadEntitlements, type MapPlaceForClient } from '@/lib/entitlements'
import { logActivity } from '@/lib/security/activity'
import { checkSecureAccess } from '@/lib/security/guard'

import { PageBanner } from '../_ui/page-banner'
import { MapSurface } from './map-surface'

const MAP_PATH = '/map'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/**
 * How many places the card grid under the map previews.
 *
 * A grid is not a map: it has no viewport to cull against, so it gets a fixed
 * budget rather than the whole catalogue. The map above it is the tool for
 * finding a specific place.
 */
const PREVIEW_LIMIT = 8

/**
 * Reading the session cookie already forces this, but declaring it makes the
 * intent explicit and stops a future refactor from quietly making the route
 * cacheable and serving one visitor's entitlements to the next.
 */
export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

type PageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

function firstValue(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value
  return first === undefined || first === '' ? null : first
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  const lang: Locale = isLocale(locale) ? locale : defaultLocale
  const t = await getTranslations({ locale: lang })

  const url = (target: Locale) => `${SITE_URL}${getPathname({ href: MAP_PATH, locale: target })}`

  return {
    title: t('mp_title'),
    description: t('mp_sub'),
    alternates: {
      canonical: url(lang),
      languages: {
        ...Object.fromEntries(locales.map((one) => [one, url(one)])),
        'x-default': url(defaultLocale),
      },
    },
    openGraph: {
      title: t('mp_title'),
      description: t('mp_sub'),
      url: url(lang),
      type: 'website',
    },
  }
}

export default async function MapPage({ params, searchParams }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)

  const query = await searchParams
  const initialSlug = firstValue(query.place)

  // Sequential by necessity: the entitlement query is keyed by the user the
  // session resolves to.
  //
  // Through the same guard as paid PDFs: a banned account, a revoked device or
  // a session ended by an admin sees the map locked from the next request. The
  // old cookie-only lookup (./session) also read the wrong cookie name
  // (`better-auth.*` rather than this app's `bt.*`), so the map treated every
  // signed-in customer as a guest and never unlocked for anyone.
  const access = await checkSecureAccess('map')
  const userId = access.ok ? access.user.id : null
  if (access.ok) {
    await logActivity({ action: 'open_map', userId, ip: access.ip, deviceId: access.deviceId })
  }

  const [t, places, held, banners] = await Promise.all([
    getTranslations(),
    listMapPlaces(),
    loadEntitlements(userId),
    listLandmarks({ limit: 1 }),
  ])

  // Everything below this line works from `payload`. `places` is not passed to
  // a Client Component, not spread into props, and not read again.
  const payload = buildMapPayload(places, held)

  const preview = payload.places.filter((place) => !place.locked).slice(0, PREVIEW_LIMIT)

  // One representative locked entry drives the upsell tile. It carries an id,
  // `locked: true` and the entitlement it needs — there is nothing else in it.
  const lockedSample: MapPlaceForClient | undefined = payload.places.find((place) => place.locked)

  return (
    <>
      <PageBanner
        image={banners[0]?.hero ?? null}
        tag={t('map_eyebrow')}
        title={t('mp_title')}
        subtitle={t('mp_sub')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('navr_map') }]}
        breadcrumbLabel={t('c_breadcrumb')}
      >
        <div className="row" style={{ gap: 10, marginTop: 18 }}>
          <span className="tag tag-palm">
            <span className="bt-legend-dot" style={{ background: 'var(--palm)' }} />
            {t('mp_free')}
          </span>
          {payload.lockedCount > 0 && (
            <span className="tag" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
              <Icon name="lock" size={13} color="#fff" /> {payload.lockedCount} {t('mp_locked')}
            </span>
          )}
        </div>
      </PageBanner>

      <section className="bg-forest" style={{ overflow: 'hidden', paddingTop: 40 }}>
        <MapSurface
          places={payload.places}
          lockedCount={payload.lockedCount}
          unlocked={payload.unlocked}
          initialSlug={initialSlug}
        />
      </section>

      {/*
        Text alternative to the pin map, rendered on the server.
        A canvas of absolutely positioned buttons is not something a crawler
        reads or a screen-reader user can browse, and the handoff offered
        nothing else. These are real cards with real links, present in the HTML
        before any JavaScript runs.
      */}
      {(preview.length > 0 || lockedSample !== undefined) && (
        <section>
          <div className="wrap">
            <SectionHead
              eyebrow={t('map_eyebrow')}
              title={t('mp_free')}
              subtitle={t('map_sub')}
              as="h2"
            />
            <div className="grid bt-grid-4">
              {preview.map((place, index) => (
                <PlaceCard key={place.id} place={place} priority={index === 0} />
              ))}
              {lockedSample !== undefined && (
                <PlaceCard key={lockedSample.id} place={lockedSample} />
              )}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
