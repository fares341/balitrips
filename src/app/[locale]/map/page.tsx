/**
 * The interactive map (v3) — server half.
 *
 * REQUEST-RENDERED, ON PURPOSE: the payload differs for an entitled visitor
 * and an anonymous one, so a cached page cannot serve both.
 *
 * The redaction chain is `listMapPlaces()` → `buildMapPayload(places, held)`,
 * and only `payload` is passed to the Client Component. `places` — names,
 * coordinates, images of every gated place — stays a server-local value.
 * Region bubbles and the free zone (`./regions.ts`) are computed here from
 * REGION data (centres from the `regions` table + a locked COUNT per region);
 * no locked place's id, name or coordinate is in them.
 *
 * Studio edits show up on the next request: the page is dynamic and reads the
 * places table directly (Studio's place actions also revalidate this path).
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { readSetting } from '@/app/(admin)/_lib/settings'
import { formatPrice } from '@/components/bt'
import { defaultLocale, isLocale, locales, type Locale } from '@/i18n/config'
import { getPathname, Link } from '@/i18n/routing'
import { contactLabel } from '@/lib/auth/phone'
import { can } from '@/lib/auth/roles'
import { getUser } from '@/lib/auth/session'
import { ownsItinerary } from '@/lib/content/extra-queries'
import { pick, pickOptional } from '@/lib/content/localize'
import { getItineraryBySlug, listMapPlaces, listMapTaxonomy } from '@/lib/content/queries'
import { buildMapPayload, loadEntitlements } from '@/lib/entitlements'
import { listPublishedPlans } from '@/lib/entitlements/plans'
import { buildDayRoute, openDayNumbers } from '@/lib/itineraries/day-route'
import { loadDayStops } from '@/lib/itineraries/queries'
import { logActivity } from '@/lib/security/activity'
import { checkSecureAccess } from '@/lib/security/guard'

import '@/styles/bt-map.css'

import { LANDMARKS, localizeLandmarks, visibleLandmarks } from './landmarks'
import { mapViewSettings } from './map-style'
import { DayRouteMap } from './day-route-map'
import { MapApp } from './map-app'
import type { MapClientPlace } from './projection'
import { buildFreeZone, buildRegionBubbles, freeRegionKey } from './regions'

const MAP_PATH = '/map'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/**
 * Reading the session cookie already forces this; declaring it stops a future
 * refactor from making the route cacheable and serving one visitor's
 * entitlements to the next.
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
    openGraph: { title: t('mp_title'), description: t('mp_sub'), url: url(lang), type: 'website' },
  }
}

export default async function MapPage({ params, searchParams }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)
  const lang: Locale = isLocale(locale) ? locale : defaultLocale

  const query = await searchParams
  const initialSlug = firstValue(query.place)
  const initialQuery = (firstValue(query.q) ?? '').slice(0, 120)
  const initialCategory = firstValue(query.cat)
  const initialRegion = firstValue(query.region)

  // Through the same guard as paid PDFs: a banned account, a revoked device or
  // a session ended by an admin sees the map locked from the next request.
  const access = await checkSecureAccess('map')
  const userId = access.ok ? access.user.id : null
  if (access.ok) {
    await logActivity({ action: 'open_map', userId, ip: access.ip, deviceId: access.deviceId })
  }

  // Phase 3: one itinerary day, numbered in order (`?itinerary=<slug>&day=<n>`).
  // An additive mode — without both parameters nothing below changes.
  const dayModeSlug = firstValue(query.itinerary)
  const dayModeNumber = Number(firstValue(query.day) ?? '')
  if (dayModeSlug !== null && Number.isInteger(dayModeNumber) && dayModeNumber >= 1) {
    return (
      <ItineraryDayMode
        slug={dayModeSlug.slice(0, 128)}
        dayNumber={dayModeNumber}
        lang={lang}
        userId={userId}
      />
    )
  }

  const [places, held, taxonomy, plans, settings] = await Promise.all([
    listMapPlaces(),
    loadEntitlements(userId),
    listMapTaxonomy(),
    listPublishedPlans(),
    readSetting('map'),
  ])

  // Everything sent to the client derives from `payload` (places), from
  // region-level aggregates (bubbles), or is public data FILTERED by the
  // locked places (landmarks). No field of a locked place is sent.
  const payload = buildMapPayload(places, held)
  const freeKey = freeRegionKey()
  const regions = buildRegionBubbles(places, taxonomy.regions, held, freeKey)
  const freeZone = buildFreeZone(taxonomy.regions, freeKey, places)

  // The client's landmarks, minus any that would name or pinpoint a place this
  // viewer cannot see (several share a name and spot with a gated place).
  const lockedIds = new Set(payload.places.filter((p) => p.locked).map((p) => p.id))
  const landmarks = localizeLandmarks(
    visibleLandmarks(
      LANDMARKS,
      places.filter((place) => lockedIds.has(place.id)),
    ),
    lang,
  )

  // حقلا الترتيب (الوثيقة 8.6) يُضافان للمفتوح وحده؛ المقفل يبقى
  // `{ id, locked, requiredEntitlement }`.
  const rank = new Map(places.map((place) => [place.id, place]))
  const clientPlaces: MapClientPlace[] = payload.places.map((place) =>
    place.locked
      ? place
      : {
          ...place,
          sortOrder: rank.get(place.id)?.sortOrder ?? 0,
          popularity: rank.get(place.id)?.popularity ?? 0,
        },
  )

  // The real price of the cheapest published plan that opens the map.
  const mapPlan = plans
    .filter((plan) => plan.entitlementKind === 'map_access')
    .sort((a, b) => a.priceMinor - b.priceMinor)[0]
  const price =
    mapPlan === undefined ? null : formatPrice(mapPlan.priceMinor, mapPlan.currency, lang)

  // العلامة المائية والحماية من النسخ للمسجّل فقط (الوثيقة 17).
  const viewerLabel = access.ok
    ? `${contactLabel(access.user)} · ${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date())}`
    : null

  return (
    <MapApp
      places={clientPlaces}
      lockedCount={payload.lockedCount}
      unlocked={payload.unlocked}
      initialSlug={initialSlug}
      initialQuery={initialQuery}
      initialCategory={initialCategory}
      initialRegion={initialRegion}
      taxonomy={taxonomy}
      vipFirst={held.has('vip')}
      viewerLabel={viewerLabel}
      regions={regions}
      freeZone={freeZone}
      price={price}
      settings={mapViewSettings(settings)}
      landmarks={landmarks}
    />
  )
}

/**
 * The itinerary-day view. Only days the viewer may open are shown — every
 * day for a buyer or staff, day 1 for everyone else (the same split as the
 * itinerary page) — and each stop arrives redacted (`loadDayStops`): a locked
 * place is a number and a lock, nothing else, so no locked place's name,
 * coordinates or note reaches the browser in this mode either.
 */
async function ItineraryDayMode({
  slug,
  dayNumber,
  lang,
  userId,
}: {
  slug: string
  dayNumber: number
  lang: Locale
  userId: string | null
}) {
  const t = await getTranslations({ locale: lang })
  const itinerary = await getItineraryBySlug(slug)
  if (itinerary === null) notFound()
  const backHref = `/itineraries/${itinerary.slug}`
  const day = itinerary.dayPlans.find((one) => one.dayNumber === dayNumber)
  if (day === undefined) notFound()

  const viewer = await getUser()
  const fullPlan =
    viewer !== null &&
    (can(viewer.role, 'content.read') || (await ownsItinerary(viewer.id, itinerary.id)))
  const open = openDayNumbers(
    itinerary.dayPlans.map((one) => one.dayNumber),
    fullPlan,
  )
  const name = pick(itinerary.name, lang, itinerary.slug)
  const dayLabel = `${t('dt_day_n')} ${dayNumber}`

  if (!open.has(dayNumber)) {
    return (
      <main className="mp-day">
        <header className="mp-day-head">
          <Link href={backHref} className="btn btn-forest btn-sm mp-day-back">
            {t('p3_back_itinerary')}
          </Link>
          <div className="mp-day-title">
            <small>{dayLabel}</small>
            <h1>{name}</h1>
          </div>
        </header>
        <div className="mp-day-closed panel">
          <h2 className="h3">{t('id_locked_t')}</h2>
          <p className="muted">{t('p3_day_buy_first')}</p>
          <Link href={backHref} className="btn btn-primary">
            {t('ih_buy')}
          </Link>
        </div>
      </main>
    )
  }

  const [held, stored] = await Promise.all([loadEntitlements(userId), readSetting('map')])
  const stops = (await loadDayStops([day.id], held)).get(day.id) ?? []
  const route = buildDayRoute(stops)

  return (
    <DayRouteMap
      title={name}
      dayLabel={day.title ? `${dayLabel} · ${pick(day.title, lang)}` : dayLabel}
      backHref={backHref}
      upgradeHref="/plans"
      pins={route.pins.map((pin) => ({
        number: pin.number,
        lat: pin.lat,
        lon: pin.lon,
        slug: pin.slug,
        name: pick(pin.name, lang, pin.slug),
      }))}
      list={route.stops.map((stop) =>
        stop.locked
          ? {
              number: stop.number,
              locked: true,
              vip: stop.requiredEntitlement === 'vip',
              name: null,
              note: null,
              visitTime: null,
            }
          : {
              number: stop.number,
              locked: false,
              vip: false,
              name: pick(stop.place.name, lang, stop.place.slug),
              note: pickOptional(stop.note, lang),
              visitTime: stop.visitTime,
            },
      )}
      lockedCount={route.lockedCount}
      lockedNeedsVip={route.lockedNeeds === 'vip'}
      settings={mapViewSettings(stored)}
    />
  )
}
