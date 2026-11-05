/**
 * Google place photos: configuration from the environment.
 *
 * With no `GOOGLE_PLACES_API_KEY` the whole feature is off and every page
 * renders exactly as before (our own media only). The key is read on the
 * server only and never logged, returned or sent to the browser: every call
 * passes it in the `X-Goog-Api-Key` header, never in a URL.
 */

/** Places API (New). Overridable for the CI mock server only. */
export const DEFAULT_BASE = 'https://places.googleapis.com/v1'

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function googleApiKey(): string | null {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim()
  return key ? key : null
}

export function googlePhotosEnabled(): boolean {
  return googleApiKey() !== null
}

export function googleBaseUrl(): string {
  const base = process.env.GOOGLE_PLACES_API_BASE?.trim()
  return (base || DEFAULT_BASE).replace(/\/+$/, '')
}

/**
 * Daily cap on BILLABLE Google calls (Text Search Pro, Place Details Pro,
 * Place Photos). Free calls (Place Details "IDs Only" for the photo list) are
 * counted but only stopped by the much higher `free` cap. Default 1000/day.
 */
export function dailyCap(): { billable: number; free: number } {
  const billable = envInt('GOOGLE_PLACES_DAILY_CAP', 1000, 0, 1_000_000)
  return { billable, free: Math.max(billable * 20, 5000) }
}

/** Pause between matcher calls (rate limit). Default 250 ms ≈ 4 req/s. */
export function matchDelayMs(): number {
  return envInt('GOOGLE_MATCH_DELAY_MS', 250, 0, 60_000)
}

/**
 * How long a viewer's browser may keep our 302 to a Google photo URI.
 * `private` only: no shared cache (CDN, proxy) may keep it. Default 300 s.
 */
export function photoRedirectMaxAge(): number {
  return envInt('GOOGLE_PHOTO_REDIRECT_MAX_AGE', 300, 0, 3600)
}
