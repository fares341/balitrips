/**
 * Google Maps links an admin pastes into the Studio assistant.
 *
 * A full link carries the spot itself (`parseCoordinateText`). A shortened
 * one (maps.app.goo.gl/…, goo.gl/maps/…) carries nothing until it is
 * followed, so the SERVER follows it — and only it:
 *
 *  - the first hop must be a Google short-link host, over https;
 *  - every redirect target must be https on a Google host (allow-list below),
 *    checked BEFORE it is requested — any other host ends the walk, so this
 *    can never be used to make the server fetch an arbitrary address;
 *  - at most `maxRedirects` hops, one overall timeout, no cookies, no body
 *    read: only the `Location` headers matter.
 *
 * Coordinates are read from each URL as soon as one has them (Google often
 * puts the place in the first redirect), so most links need one request.
 */

import { parseCoordinateText, type ParsedCoords } from '@/lib/geo/parse-coords'

/** Hosts a shortened Maps link may start on. */
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl'])

/**
 * Hosts a redirect may lead to: google.com and its country domains
 * (google.co.id, google.com.au, google.de…), with or without `www.`/`maps.`,
 * Google's consent page, and the short-link hosts themselves.
 */
const GOOGLE_HOST =
  /^(?:(?:www|maps|consent)\.)?google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/

export function isGoogleMapsHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return SHORT_HOSTS.has(host) || GOOGLE_HOST.test(host)
}

/** A link that has to be followed to find the place. */
export function isShortMapsLink(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  if (host === 'maps.app.goo.gl') return url.pathname.length > 1
  if (host === 'goo.gl') return url.pathname.startsWith('/maps/')
  return false
}

/** The first http(s) address in a message, or null. */
export function findUrl(text: string): URL | null {
  const match = text.match(/https?:\/\/[^\s<>"'«»]+/i)
  if (!match) return null
  try {
    return new URL(match[0].replace(/[).,;!?،]+$/, ''))
  } catch {
    return null
  }
}

/** The place name in `/maps/place/<Name>/…`, for a link with no coordinates. */
export function placeNameFromUrl(url: URL): string | null {
  const match = url.pathname.match(/\/maps\/place\/([^/@]+)/)
  if (!match?.[1]) return null
  let name = match[1]
  try {
    name = decodeURIComponent(name)
  } catch {
    // keep it as it is
  }
  name = name.replace(/\+/g, ' ').trim()
  return name.length >= 2 ? name.slice(0, 120) : null
}

export type ExpandResult =
  | { ok: true; url: string; coords: ParsedCoords | null }
  | {
      ok: false
      reason: 'not_allowed' | 'too_many_redirects' | 'timeout' | 'network' | 'bad_response'
    }

export interface ExpandOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxRedirects?: number
}

/**
 * Follow a shortened Google Maps link to the full one. Never throws.
 * `coords` is null when the final link names a place without a position.
 */
export async function expandMapsLink(
  raw: string,
  { fetchImpl = fetch, timeoutMs = 5000, maxRedirects = 5 }: ExpandOptions = {},
): Promise<ExpandResult> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'not_allowed' }
  }
  if (url.protocol !== 'https:' || !isShortMapsLink(url))
    return { ok: false, reason: 'not_allowed' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    for (let hop = 0; ; hop += 1) {
      if (hop > 0) {
        const coords = parseCoordinateText(url.href)
        if (coords) return { ok: true, url: url.href, coords }
      }
      if (hop >= maxRedirects) return { ok: false, reason: 'too_many_redirects' }

      let response: Response
      try {
        response = await fetchImpl(url.href, {
          method: 'GET',
          redirect: 'manual',
          credentials: 'omit',
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BaliTripsStudio/1.0)' },
        })
      } catch {
        return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'network' }
      }
      // The body is never needed; do not keep the connection busy reading it.
      void response.body?.cancel().catch(() => {})

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) return { ok: false, reason: 'bad_response' }
        let next: URL
        try {
          next = new URL(location, url)
        } catch {
          return { ok: false, reason: 'bad_response' }
        }
        if (next.protocol !== 'https:' || !isGoogleMapsHost(next.hostname)) {
          return { ok: false, reason: 'not_allowed' }
        }
        url = next
        continue
      }
      if (!response.ok) return { ok: false, reason: 'bad_response' }
      // Landed: whatever the address says is what there is.
      return { ok: true, url: url.href, coords: hop > 0 ? parseCoordinateText(url.href) : null }
    }
  } finally {
    clearTimeout(timer)
  }
}
