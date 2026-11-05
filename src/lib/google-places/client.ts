/**
 * Places API (New) calls. No I/O of its own besides the injected `fetch` and
 * `take` (the cost guard), so tests run it against a mock without network.
 *
 * What is requested, and why (SKUs per
 * https://developers.google.com/maps/billing-and-pricing/sku-details/places):
 *  - textSearch       Text Search Pro: id, displayName, location, types
 *                     (+ formattedAddress for the review screen) — matching only.
 *  - placePhotos      Place Details "Essentials (IDs Only)": `photos` only —
 *                     no-charge SKU; gives photo names + authorAttributions.
 *  - placeSummary     Place Details Pro: name/address/location for the review
 *                     screen (a person looking at one candidate).
 *  - photoUri         Place Photos (New) with skipHttpRedirect=true — the
 *                     short-lived photoUri the browser is redirected to.
 *
 * Nothing returned here is stored, apart from a place `id` the caller may
 * keep (place IDs are exempt from the Places caching restrictions). The key
 * travels in the `X-Goog-Api-Key` header only, so it is never in a URL, a
 * log line or an error message.
 */

export type GoogleCallKind = 'text_search' | 'details_photos' | 'details_pro' | 'photo_media'

/** Billable kinds count against the daily cap; `details_photos` is free. */
export const BILLABLE: ReadonlySet<GoogleCallKind> = new Set([
  'text_search',
  'details_pro',
  'photo_media',
])

export class GoogleDisabledError extends Error {
  constructor() {
    super('google_places_disabled')
  }
}
export class GoogleCapError extends Error {
  constructor(kind: GoogleCallKind) {
    super(`google_places_daily_cap:${kind}`)
  }
}
export class GoogleHttpError extends Error {
  constructor(
    readonly status: number,
    readonly kind: GoogleCallKind,
  ) {
    super(`google_places_http_${status}:${kind}`)
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500
  }
}

export interface GoogleAuthor {
  displayName: string
  uri: string | null
}

export interface GooglePhoto {
  /** places/<id>/photos/<ref> — use now, never store. */
  name: string
  widthPx: number | null
  heightPx: number | null
  authors: GoogleAuthor[]
  /** The photo on Google Maps (policy: users must be able to open it there). */
  mapsUri: string | null
}

export interface TextSearchHit {
  id: string
  name: string
  lat: number
  lon: number
  types: string[]
  address: string | null
}

export interface PlaceSummary {
  id: string
  name: string
  address: string | null
  lat: number | null
  lon: number | null
  mapsUri: string | null
}

export interface GoogleClientDeps {
  key: string | null
  base: string
  fetch: typeof fetch
  /** Cost guard: records the call, throws GoogleCapError over the cap. */
  take: (kind: GoogleCallKind) => Promise<void>
  timeoutMs?: number
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
function httpsOnly(value: unknown): string | null {
  const s = str(value)
  return s !== null && /^https:\/\//i.test(s) ? s : null
}

export function parsePhotos(body: unknown): GooglePhoto[] {
  const photos = (body as { photos?: unknown })?.photos
  if (!Array.isArray(photos)) return []
  const out: GooglePhoto[] = []
  for (const raw of photos) {
    const photo = raw as Record<string, unknown>
    const name = str(photo.name)
    if (name === null || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) continue
    const authors = Array.isArray(photo.authorAttributions)
      ? (photo.authorAttributions as Record<string, unknown>[])
          .map((a) => ({ displayName: str(a.displayName) ?? '', uri: httpsOnly(a.uri) }))
          .filter((a) => a.displayName !== '')
      : []
    out.push({
      name,
      widthPx: num(photo.widthPx),
      heightPx: num(photo.heightPx),
      authors,
      mapsUri: httpsOnly(photo.googleMapsUri),
    })
  }
  return out
}

export function parseTextSearch(body: unknown): TextSearchHit[] {
  const places = (body as { places?: unknown })?.places
  if (!Array.isArray(places)) return []
  const out: TextSearchHit[] = []
  for (const raw of places) {
    const place = raw as Record<string, unknown>
    const id = str(place.id)
    const location = place.location as Record<string, unknown> | undefined
    const lat = num(location?.latitude)
    const lon = num(location?.longitude)
    if (id === null || lat === null || lon === null) continue
    const displayName = place.displayName as Record<string, unknown> | undefined
    out.push({
      id,
      name: str(displayName?.text) ?? '',
      lat,
      lon,
      types: Array.isArray(place.types)
        ? place.types.filter((t): t is string => typeof t === 'string')
        : [],
      address: str(place.formattedAddress),
    })
  }
  return out
}

/** Google place IDs are URL-safe tokens; anything else is refused. */
export function isPlaceId(value: string): boolean {
  return /^[A-Za-z0-9_-]{10,300}$/.test(value)
}

export function createGoogleClient(deps: GoogleClientDeps) {
  const timeoutMs = deps.timeoutMs ?? 8000

  async function request(
    kind: GoogleCallKind,
    path: string,
    init: RequestInit & { fieldMask?: string },
  ): Promise<unknown> {
    if (!deps.key) throw new GoogleDisabledError()
    await deps.take(kind)
    const headers: Record<string, string> = { 'X-Goog-Api-Key': deps.key }
    if (init.fieldMask) headers['X-Goog-FieldMask'] = init.fieldMask
    if (init.body) headers['Content-Type'] = 'application/json'
    const response = await deps.fetch(`${deps.base}${path}`, {
      method: init.method ?? 'GET',
      body: init.body,
      headers,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      // Drain without reading the body into logs: it can echo request data.
      await response.body?.cancel().catch(() => undefined)
      throw new GoogleHttpError(response.status, kind)
    }
    return response.json()
  }

  return {
    /** Text Search (New), biased to a circle around our coordinates. */
    async textSearch(input: {
      query: string
      lat: number
      lon: number
      radiusM?: number
      withAddress?: boolean
      max?: number
    }): Promise<TextSearchHit[]> {
      const fields = ['places.id', 'places.displayName', 'places.location', 'places.types']
      if (input.withAddress) fields.push('places.formattedAddress')
      const body = await request('text_search', '/places:searchText', {
        method: 'POST',
        fieldMask: fields.join(','),
        body: JSON.stringify({
          textQuery: input.query,
          pageSize: Math.min(Math.max(input.max ?? 5, 1), 20),
          locationBias: {
            circle: {
              center: { latitude: input.lat, longitude: input.lon },
              radius: Math.min(Math.max(input.radiusM ?? 2000, 1), 50_000),
            },
          },
        }),
      })
      return parseTextSearch(body)
    },

    /** The place's photos (names + attributions), IDs-Only SKU. */
    async placePhotos(placeId: string): Promise<GooglePhoto[]> {
      if (!isPlaceId(placeId)) return []
      const body = await request('details_photos', `/places/${placeId}`, { fieldMask: 'photos' })
      return parsePhotos(body)
    },

    /** One candidate for a person to judge (Studio review). */
    async placeSummary(placeId: string): Promise<PlaceSummary | null> {
      if (!isPlaceId(placeId)) return null
      const body = (await request('details_pro', `/places/${placeId}`, {
        fieldMask: 'id,displayName,formattedAddress,location,googleMapsUri',
      })) as Record<string, unknown>
      const id = str(body?.id)
      if (id === null) return null
      const location = body.location as Record<string, unknown> | undefined
      return {
        id,
        name: str((body.displayName as Record<string, unknown> | undefined)?.text) ?? '',
        address: str(body.formattedAddress),
        lat: num(location?.latitude),
        lon: num(location?.longitude),
        mapsUri: httpsOnly(body.googleMapsUri),
      }
    },

    /** Place Photos (New) → the short-lived photoUri (skipHttpRedirect). */
    async photoUri(photoName: string, maxWidthPx: number): Promise<string | null> {
      if (!/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoName)) return null
      const width = Math.min(Math.max(Math.round(maxWidthPx), 1), 4800)
      const body = (await request(
        'photo_media',
        `/${photoName}/media?maxWidthPx=${width}&skipHttpRedirect=true`,
        {},
      )) as Record<string, unknown>
      return (
        httpsOnly(body?.photoUri) ??
        (process.env.GOOGLE_PLACES_API_BASE ? str(body?.photoUri) : null)
      )
    },
  }
}

export type GoogleClient = ReturnType<typeof createGoogleClient>
