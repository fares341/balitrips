/**
 * "Where is it?" for the Studio assistant's add-a-place tool: whatever the
 * admin sent, turned into one spot, a short list to choose from, or a plain
 * reason it could not be found.
 *
 * In order:
 *   1. coordinates typed or pasted, Arabic digits included ("-٨٫٥٠٦٩، ١١٥٫٢٦٢٥");
 *   2. a full Google Maps link (pin, map centre, ?q= / query= / destination=…);
 *   3. a shortened Google Maps link, followed on the server (./maps-link.ts);
 *   4. a Google link that names a place but has no position → search the name;
 *   5. anything else → search it as a name or address with Photon (komoot,
 *      OpenStreetMap data), the geocoder the place editor uses, limited to
 *      Bali. One result is the spot; several are offered as a choice.
 *
 * Then the same checks as the place editor (`checkSpot`): outside Bali, in
 * the sea or a lake, another place within 50 m. They are warnings for the
 * admin to read on the proposal card, never blockers.
 *
 * Network access is injected (`deps`) so the tests never leave the machine.
 */

import { haversineKm, isInBali } from '@/lib/geo'
import { normalizeDigits, parseCoordinateText } from '@/lib/geo/parse-coords'

import {
  expandMapsLink,
  findUrl,
  isGoogleMapsHost,
  isShortMapsLink,
  placeNameFromUrl,
} from './maps-link'

export interface SearchHit {
  name: string
  detail: string
  lat: number
  lon: number
}

export type LocationSource = 'pin' | 'centre' | 'query' | 'pair' | 'search'

export type LocationResult =
  | { kind: 'point'; lat: number; lon: number; source: LocationSource; label: string | null }
  | { kind: 'choices'; choices: SearchHit[] }
  | {
      kind: 'none'
      reason:
        | 'empty'
        | 'short_link_failed'
        | 'link_without_place'
        | 'not_a_maps_link'
        | 'not_found'
        | 'search_failed'
    }

export interface LocationDeps {
  expand: (url: string) => ReturnType<typeof expandMapsLink>
  /** Null when the search itself failed (network, timeout). */
  search: (query: string) => Promise<SearchHit[] | null>
}

/** A "lat, lon" pair inside a longer sentence ("My location: -8.50690, 115.26250 (±12 m)"). */
const EMBEDDED_PAIR = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/

function embeddedPair(text: string): { lat: number; lon: number } | null {
  const match = text.match(EMBEDDED_PAIR)
  if (!match) return null
  const lat = Number(match[1])
  const lon = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null
  return { lat, lon }
}

const MAX_CHOICES = 5

async function byName(query: string, deps: LocationDeps): Promise<LocationResult> {
  const hits = await deps.search(query)
  if (hits === null) return { kind: 'none', reason: 'search_failed' }
  if (hits.length === 0) return { kind: 'none', reason: 'not_found' }
  const [only] = hits
  if (hits.length === 1 && only) {
    return {
      kind: 'point',
      lat: only.lat,
      lon: only.lon,
      source: 'search',
      label: [only.name, only.detail].filter(Boolean).join(', ') || null,
    }
  }
  return { kind: 'choices', choices: hits.slice(0, MAX_CHOICES) }
}

export async function resolveLocation(input: string, deps: LocationDeps): Promise<LocationResult> {
  const text = normalizeDigits(input).trim().slice(0, 1000)
  if (text === '') return { kind: 'none', reason: 'empty' }

  const url = findUrl(text)
  if (url !== null) {
    if (!isGoogleMapsHost(url.hostname)) return { kind: 'none', reason: 'not_a_maps_link' }
    const direct = parseCoordinateText(url.href)
    if (direct) return { kind: 'point', ...direct, label: null }
    let landed = url
    if (isShortMapsLink(url)) {
      const expanded = await deps.expand(url.href)
      if (!expanded.ok) return { kind: 'none', reason: 'short_link_failed' }
      if (expanded.coords) return { kind: 'point', ...expanded.coords, label: null }
      try {
        landed = new URL(expanded.url)
      } catch {
        return { kind: 'none', reason: 'link_without_place' }
      }
    }
    // Google's cookie-consent page carries the real address in `continue`.
    const next = landed.hostname.startsWith('consent.') ? landed.searchParams.get('continue') : null
    if (next) {
      try {
        const inner = new URL(next)
        if (isGoogleMapsHost(inner.hostname)) {
          const coords = parseCoordinateText(inner.href)
          if (coords) return { kind: 'point', ...coords, label: null }
          landed = inner
        }
      } catch {
        // not a URL: fall through with the consent page
      }
    }
    const name = placeNameFromUrl(landed) ?? landed.searchParams.get('q')?.trim() ?? null
    if (name) return byName(name.slice(0, 120), deps)
    return { kind: 'none', reason: 'link_without_place' }
  }

  const typed = parseCoordinateText(text)
  if (typed) return { kind: 'point', ...typed, label: null }
  const inSentence = embeddedPair(text)
  if (inSentence) return { kind: 'point', ...inSentence, source: 'pair', label: null }

  if (text.length < 3) return { kind: 'none', reason: 'not_found' }
  return byName(text.slice(0, 120), deps)
}

/* --------------------------------------------------------------------------
   Checks — the place editor's, as warnings
   -------------------------------------------------------------------------- */

/** Two places closer than this are probably the same place (as in the editor). */
export const DUPLICATE_M = 50

export type PlaceWarning = 'outside_bali' | 'in_water' | 'water_unchecked' | 'near_existing'

export interface ExistingPlace {
  id: string
  name: string
  lat: number
  lon: number
}

export interface SpotCheck {
  warnings: PlaceWarning[]
  /** Existing places within DUPLICATE_M, closest first. */
  nearby: (ExistingPlace & { meters: number })[]
}

/**
 * `inWater`: true / false from the map data, null when it could not be read
 * (then the card asks the admin to look at the map themselves).
 */
export function checkSpot(
  point: { lat: number; lon: number },
  input: { inWater: boolean | null; existing: readonly ExistingPlace[] },
): SpotCheck {
  const warnings: PlaceWarning[] = []
  if (!isInBali(point)) warnings.push('outside_bali')
  if (input.inWater === true) warnings.push('in_water')
  if (input.inWater === null) warnings.push('water_unchecked')
  const nearby = input.existing
    .map((place) => ({ ...place, meters: Math.round(haversineKm(point, place) * 1000) }))
    .filter((place) => place.meters < DUPLICATE_M)
    .sort((a, b) => a.meters - b.meters)
  if (nearby.length > 0) warnings.push('near_existing')
  return { warnings, nearby }
}

/* --------------------------------------------------------------------------
   Photon (server side) — same service, area and shape as the place editor
   -------------------------------------------------------------------------- */

const PHOTON = 'https://photon.komoot.io/api/'
/** Bali with the Nusa islands (minLon, minLat, maxLon, maxLat), as in the editor. */
const BALI_BBOX = '114.40,-8.95,115.75,-8.00'

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, string | number | undefined>
}

export function photonHits(data: unknown): SearchHit[] {
  const features = (data as { features?: PhotonFeature[] } | null)?.features ?? []
  const out: SearchHit[] = []
  const seen = new Set<string>()
  for (const feature of features) {
    const c = feature.geometry?.coordinates
    const p = feature.properties ?? {}
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue
    const name = String(p.name ?? p.street ?? '').slice(0, 120)
    const detail = [p.street && p.name ? p.street : null, p.district, p.city, p.county]
      .filter((part): part is string | number => !!part)
      .map(String)
      .filter((part, i, all) => all.indexOf(part) === i && part !== name)
      .join(', ')
      .slice(0, 160)
    const key = `${name}|${c[1].toFixed(4)}|${c[0].toFixed(4)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, detail, lat: c[1], lon: c[0] })
  }
  return out
}

export async function photonSearch(
  query: string,
  {
    fetchImpl = fetch,
    timeoutMs = 6000,
    lang = 'en',
  }: { fetchImpl?: typeof fetch; timeoutMs?: number; lang?: 'en' | 'ar' } = {},
): Promise<SearchHit[] | null> {
  const url = `${PHOTON}?q=${encodeURIComponent(query)}&limit=6&bbox=${BALI_BBOX}&lat=-8.45&lon=115.2${
    lang === 'en' ? '&lang=en' : ''
  }`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'error',
      headers: { 'User-Agent': 'BaliTripsStudio/1.0 (place editor search)' },
    })
    if (!response.ok) return null
    return photonHits(await response.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
