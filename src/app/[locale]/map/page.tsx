/**
 * The interactive map (v3) — server half.
 *
 * REQUEST-RENDERED, ON PURPOSE: the payload differs for an entitled visitor
 * and an anonymous one, so a cached page cannot serve both.
 *
 * Map v3 (owner, Nov 2026 — reference UX): the map is the landing; area,
 * categories, traveler type and duration are filter chips. This page sends
 * only public, aggregate data (areas, counts per region and category, the
 * category look, plan prices). `places` — names, coordinates, images of every
 * gated place — stays a server-local value; results are fetched per
 * selection from `/api/map/places`, which redacts per request.
 *
 * Studio edits show up on the next request: the page is dynamic and reads the
 * places table directly (Studio's place actions also revalidate this path).
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { preconnect, preload } from 'react-dom'
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
import { getItineraryBySlug, listMapTaxonomy } from '@/lib/content/queries'
import { loadEntitlements } from '@/lib/entitlements'
import { listPublishedPlans } from '@/lib/entitlements/plans'
import { buildDayRoute, openDayNumbers } from '@/lib/itineraries/day-route'
import { loadDayStops } from '@/lib/itineraries/queries'
import { logActivity } from '@/lib/security/activity'
import { checkSecureAccess } from '@/lib/security/guard'

import '@/styles/bt-map.css'

import { listMapCategoriesCached, listMapPlacesCached } from '@/lib/map/cached'
import {
  ALL_AREA,
  areaOptions,
  countRows,
  facetOptions,
  parseFactFilter,
  parseSelection,
} from '@/lib/map/explore'

import { mapViewSettings } from './map-style'
import { MAPLIBRE_CSS, MAPLIBRE_JS } from './maplibre-loader'
import { DayRouteMap } from './day-route-map'
import { MapExplorer } from './map-explorer'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

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
    openGraph: {
      title: t('mp_title'),
      description: t('mp_sub'),
      url: url(lang),
      type: 'website',
      images: [DEFAULT_SHARE_IMAGE],
    },
  }
}

export default async function MapPage({ params, searchParams }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)
  const lang: Locale = isLocale(locale) ? locale : defaultLocale

  const query = await searchParams
  const initialSlug = firstValue(query.place)
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

  // Start the map engine and the tiles while the server works (hoisted to <head>).
  preconnect('https://unpkg.com', { crossOrigin: 'anonymous' })
  preconnect('https://tiles.openfreemap.org', { crossOrigin: 'anonymous' })
  preload(MAPLIBRE_JS, { as: 'script', crossOrigin: 'anonymous' })
  preload(MAPLIBRE_CSS, { as: 'style', crossOrigin: 'anonymous' })

  const [places, held, taxonomy, categories, plans, settings] = await Promise.all([
    listMapPlacesCached(),
    loadEntitlements(userId),
    listMapTaxonomy(),
    listMapCategoriesCached(),
    listPublishedPlans(),
    readSetting('map'),
  ])

  // Public, aggregate data only: counts per (region, category). The places
  // themselves stay on the server; the results come from /api/map/places,
  // redacted per request.
  const rows = countRows(places)
  const areas = areaOptions(
    taxonomy.regions,
    rows,
    categories.map((one) => one.key),
  )
  const unlocked = held.has('map_access')

  const selection = parseSelection(
    { area: firstValue(query.area), region: initialRegion, cat: initialCategory },
    new Set(areas.map((one) => one.key)),
    new Set(categories.map((one) => one.key)),
  )
  // A locked type in a link is never applied for a visitor: the step screen
  // shows it with its lock instead.
  const lockedKeys = new Set(
    categories.filter((one) => one.tier === 'vip' && !unlocked).map((one) => one.key),
  )
  selection.categories = selection.categories.filter((key) => !lockedKeys.has(key))
  // Map v3: the map is the landing — no area means the whole island, no
  // category means every type.
  if (selection.area === null) selection.area = ALL_AREA
  // Filters offered only for values some place really has (aggregate only).
  const facets = facetOptions(places)
  const facts = parseFactFilter({
    traveler: firstValue(query.traveler),
    dur: firstValue(query.dur),
  })
  // `?place=slug` (place page → map): open that place, if this viewer may.
  let initialPlace: string | null = null
  if (initialSlug !== null) {
    const hit = places.find((one) => one.slug === initialSlug)
    if (hit && hit.categoryKey && (hit.isFree || held.has(hit.requiredEntitlement))) {
      initialPlace = hit.slug
      selection.area = ALL_AREA
      if (selection.categories.length > 0 && !selection.categories.includes(hit.categoryKey)) {
        selection.categories = []
      }
      facts.travelers = []
      facts.durations = []
    }
  }

  // The plans that open the locked categories, cheapest first (paywall sheet).
  const paywallPlans = plans
    .filter((plan) => plan.entitlementKind === 'map_access' || plan.entitlementKind === 'vip')
    .sort((a, b) => a.priceMinor - b.priceMinor)
    .slice(0, 3)
    .map((plan) => ({
      id: plan.id,
      name: pick(plan.name, lang, plan.slug),
      price: formatPrice(plan.priceMinor, plan.currency, lang),
      durationDays: plan.durationDays,
      href: getPathname({ href: `/plans/buy/${encodeURIComponent(plan.id)}`, locale: lang }),
    }))

  // العلامة المائية والحماية من النسخ للمسجّل فقط (الوثيقة 17).
  const viewerLabel = access.ok
    ? `${contactLabel(access.user)} · ${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date())}`
    : null

  return (
    <MapExplorer
      locale={lang}
      areas={areas.map((one) => ({
        key: one.key,
        label: pick(one.label, lang, one.key),
        parentKey: one.parentKey,
        count: one.count,
        top: one.top,
      }))}
      counts={rows}
      categories={categories.map((one) => ({
        key: one.key,
        label: pick(one.label, lang, one.key),
        tier: one.tier,
        locked: one.tier === 'vip' && !unlocked,
        color: one.color,
        icon: one.icon,
      }))}
      initial={selection}
      initialFacts={{ travelers: [...facts.travelers], durations: [...facts.durations] }}
      travelerOptions={facets.travelers}
      durationOptions={facets.durations}
      initialPlace={initialPlace}
      plans={paywallPlans}
      unlocked={unlocked}
      viewerLabel={viewerLabel}
      settings={mapViewSettings(settings)}
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
