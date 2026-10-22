import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'

import { ADMIN_ROBOTS_TAG, isAdminPath, toInternalAdminPath } from './app/(admin)/_lib/admin-path'
import { routing } from './i18n/routing'

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

export default function proxy(request: NextRequest) {
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

  // H20: the bare domain opens the Arabic site. A visitor who already picked a
  // language (next-intl's NEXT_LOCALE cookie) keeps it; Accept-Language is
  // deliberately not consulted here, so balitrips.co always lands on /ar.
  if (pathname === '/') {
    const chosen = request.cookies.get('NEXT_LOCALE')?.value
    const target = chosen && (routing.locales as readonly string[]).includes(chosen) ? chosen : 'ar'
    const url = request.nextUrl.clone()
    url.pathname = `/${target}`
    return NextResponse.redirect(url)
  }

  return localeProxy(request)
}

export const config = {
  // Everything except API routes, Next internals, and files with an extension.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
