import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'

import { ADMIN_ROBOTS_TAG, isAdminPath, toInternalAdminPath } from './app/(admin)/_lib/admin-path'
import { routing } from './i18n/routing'
import { withGeoCurrency } from './lib/currency/geo-cookie'
import {
  detailTarget,
  ExistsCache,
  NOT_FOUND_PAGE,
  type DetailKind,
} from './lib/seo/not-found-routing'

/**
 * Locale negotiation and redirects.
 *
 * Next 16 renamed the `middleware` file convention to `proxy`; this is that
 * file, and next-intl's `createMiddleware` is still the correct helper.
 *
 * IMPORTANT: this is NOT an authorization boundary. The admin role check is
 * performed again inside every route handler and server action, because one
 * missed matcher pattern here would silently expose a route.
 *
 * Also note this must never read cookies for anything cacheable — doing so
 * marks responses private and makes the whole site uncacheable at the edge,
 * which would send every visitor on a round trip to Singapore.
 */
const localeProxy = createMiddleware(routing)

const existsCache = new ExistsCache()

/**
 * Does this public detail URL name a real record? Asked of the app itself
 * (`/api/exists`, the same lookups the pages use) over the loopback, with a
 * short memory. `null` = could not tell (timeout, error): the page then
 * renders and decides as before — a real page is never turned into a 404
 * because the check failed.
 */
async function recordExists(
  request: NextRequest,
  target: { kind: DetailKind; key: string },
): Promise<boolean | null> {
  const id = `${target.kind}:${target.key}`
  const now = Date.now()
  const known = existsCache.get(id, now)
  if (known !== null) return known
  try {
    const port = process.env.PORT || request.nextUrl.port || '3000'
    const url = `http://127.0.0.1:${port}/api/exists?kind=${target.kind}&key=${encodeURIComponent(target.key)}`
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(1500) })
    if (!response.ok) return null
    const body = (await response.json()) as { exists?: unknown }
    if (typeof body.exists !== 'boolean') return null
    existsCache.set(id, body.exists, now)
    return body.exists
  } catch {
    return null
  }
}

/** The localized not-found page, rendered on the server, with status 404. */
function notFoundResponse(request: NextRequest, locale: string): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = `/${locale}/${NOT_FOUND_PAGE}`
  url.search = ''
  // next-intl reads the request locale from this header (its own proxy sets
  // it; this response does not pass through it).
  const headers = new Headers(request.headers)
  headers.set('X-NEXT-INTL-LOCALE', locale)
  const response = NextResponse.rewrite(url, { status: 404, request: { headers } })
  response.headers.set('X-Robots-Tag', 'noindex')
  return withGeoCurrency(request, response)
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  /**
   * Admin, mounted at the environment-configured base path.
   *
   * It has to be handled before next-intl, which would otherwise rewrite
   * `/studio-8f2a` to `/en/studio-8f2a` and 404 it — the admin is
   * English-only and deliberately outside the `[locale]` segment.
   *
   * The rewrite is routing, NOT access control. Anyone can request this
   * path; `requireCapability()` inside every page and server action is what
   * decides whether they see anything.
   */
  if (isAdminPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = toInternalAdminPath(pathname)

    const response = NextResponse.rewrite(url)
    // Keeps the admin out of search indexes without a robots.txt Disallow
    // line, which would publish the very path we are not advertising.
    response.headers.set('X-Robots-Tag', ADMIN_ROBOTS_TAG)
    return response
  }

  /**
   * The internal mount (`/studio`) is deliberately NOT refused here.
   *
   * It used to be, on the reasoning that exactly one URL should reach the
   * admin. But a rewrite re-enters this proxy, and the guard could not tell
   * its own routed traffic from a direct request — so it 404'd the admin it
   * had just routed to, for every user including a valid administrator.
   * Marking the rewrite with a header did not help either: the re-entry
   * carries the ORIGINAL pathname, so the marker and the path disagree.
   *
   * Dropping it costs almost nothing. Obscurity was never carrying security
   * weight: `requireCapability()` runs server-side inside every admin page
   * and every server action, so `/studio` is exactly as protected as the
   * configured path. Rotating ADMIN_BASE_PATH still retires the old public
   * URL, which is what that rotation is actually for.
   */

  // H20: the bare domain opens the Arabic site, and so does every other path
  // without a locale prefix (site audit, Nov 2026: `/` went to /ar while
  // `/activities` went to /en). A visitor who already picked a language
  // (next-intl's NEXT_LOCALE cookie) keeps it; Accept-Language is deliberately
  // not consulted, so an unprefixed link always lands on the main language.
  const first = pathname.split('/')[1] ?? ''
  if (!(routing.locales as readonly string[]).includes(first)) {
    const chosen = request.cookies.get('NEXT_LOCALE')?.value
    const target =
      chosen && (routing.locales as readonly string[]).includes(chosen)
        ? chosen
        : routing.defaultLocale
    const url = request.nextUrl.clone()
    url.pathname = pathname === '/' ? `/${target}` : `/${target}${pathname}`
    return NextResponse.redirect(url)
  }

  // Server-rendered 404s (see lib/seo/not-found-routing.ts). Documents only:
  // a client-side navigation keeps Next's own not-found boundary.
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    !request.headers.has('rsc') &&
    !request.headers.has('next-router-prefetch')
  ) {
    // The 404 page's own address is a 404 too.
    if (pathname === `/${first}/${NOT_FOUND_PAGE}`) return notFoundResponse(request, first)
    const target = detailTarget(pathname)
    if (target !== null && (await recordExists(request, target)) === false) {
      return notFoundResponse(request, first)
    }
  }

  return withGeoCurrency(request, localeProxy(request))
}

export const config = {
  // Everything except API routes, Next internals, and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
