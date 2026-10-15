/**
 * Request hygiene for the assistant endpoints: CSRF and identity hashing.
 *
 * CSRF. The endpoints are JSON POSTs that act with the visitor's cookies
 * (their cart, their orders, a staff member's capabilities), so a third-party
 * page must not be able to fire them. Two independent checks:
 *
 *   1. the `Origin` header must be this site (or, when a browser omits it,
 *      `Sec-Fetch-Site` must say `same-origin`). A request with neither is
 *      refused — every browser that can run the widget sends one of them;
 *   2. the body must be `application/json`, which a plain HTML form cannot
 *      send without a CORS preflight that this route never answers.
 *
 * Identity. Conversations are owned by a random token in an httpOnly cookie,
 * stored only as an HMAC; IPs are stored only as an HMAC too, keyed with the
 * server secret so the IPv4 space cannot be brute-forced back out of the
 * table. Neither raw value is written to the database or to a log.
 */

import { createHmac, randomBytes } from 'node:crypto'

type HeaderBag = Pick<Headers, 'get'>

/** Origins this deployment answers on. */
export function allowedOrigins(headers: HeaderBag, siteUrl = process.env.NEXT_PUBLIC_SITE_URL) {
  const out = new Set<string>()
  if (siteUrl) {
    try {
      out.add(new URL(siteUrl).origin)
    } catch {
      // ignore a malformed env value; the Host fallback below still applies
    }
  }
  const host = headers.get('x-forwarded-host') ?? headers.get('host')
  if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) {
    const proto = headers.get('x-forwarded-proto') === 'http' ? 'http' : 'https'
    out.add(`${proto}://${host}`)
    // Local dev and CI run plain http on localhost.
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) out.add(`http://${host}`)
  }
  return out
}

export type OriginVerdict = 'ok' | 'bad_origin' | 'bad_content_type'

export function checkSameOrigin(
  method: string,
  headers: HeaderBag,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
): OriginVerdict {
  if (method !== 'GET' && method !== 'HEAD') {
    const type = (headers.get('content-type') ?? '').toLowerCase()
    if (!type.startsWith('application/json')) return 'bad_content_type'
  }
  const origin = headers.get('origin')
  if (origin !== null && origin !== 'null') {
    return allowedOrigins(headers, siteUrl).has(origin) ? 'ok' : 'bad_origin'
  }
  return headers.get('sec-fetch-site') === 'same-origin' ? 'ok' : 'bad_origin'
}

/* --------------------------------------------------------------------------
   Hashing
   -------------------------------------------------------------------------- */

function secret(): string {
  return process.env.BETTER_AUTH_SECRET || 'assistant-dev-secret'
}

/** HMAC-SHA256, hex, 64 chars — fits the `varchar(64)` columns. */
export function keyedHash(purpose: 'ip' | 'owner', value: string): string {
  return createHmac('sha256', `${purpose}:${secret()}`).update(value).digest('hex')
}

/** The browser token: 32 random bytes, base64url. */
export function newOwnerToken(): string {
  return randomBytes(32).toString('base64url')
}

export function isOwnerTokenShape(value: string | undefined | null): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(value)
}

/** Cookie holding the token. httpOnly: page scripts never see it. */
export const OWNER_COOKIE = 'bt_ai'
