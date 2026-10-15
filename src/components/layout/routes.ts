/**
 * The site's route table.
 *
 * One list, consumed by the header's second-row nav, the mobile drawer and
 * the footer. The handoff declared the same ten entries twice — once in
 * `Header` and once in `Footer` — and they had already drifted by the time
 * the prototype shipped.
 *
 * Paths are locale-agnostic: the next-intl `Link` adds `/ar` or `/id`. Never
 * write a locale into an href here.
 *
 * No 'use client' — this is data, and both Server and Client Components
 * import it.
 */

import { FEATURES } from '@/lib/features'

export interface NavRoute {
  /** Locale-agnostic path, e.g. `/activities`. */
  href: string
  /** Translation key in messages/{en,ar,id}.json. */
  key: string
}

/** Hides a route whose service is switched off in `FEATURES` (the driver). */
function available(route: NavRoute): boolean {
  return FEATURES.driver || route.href !== '/driver'
}

/**
 * Every public destination, in reading order. The Menu drawer renders all of
 * it and the footer's "Quick links" column lists it, so a page added here is
 * reachable from both without further wiring.
 */
export const NAV_ROUTES: readonly NavRoute[] = [
  { href: '/', key: 'navr_home' },
  { href: '/services', key: 'navr_services' },
  { href: '/map', key: 'navr_map' },
  { href: '/activities', key: 'navr_act' },
  { href: '/events', key: 'navr_events' },
  { href: '/itineraries', key: 'navr_itin' },
  /**
   * Packages were reachable only from a card on the home page and one link on
   * /services, so a visitor browsing the navigation never found them at all --
   * six published products effectively invisible.
   */
  { href: '/packages', key: 'navr_packages' },
  { href: '/driver', key: 'navr_driver' },
  { href: '/custom', key: 'svc_cust_t' },
  { href: '/explore', key: 'navr_explore' },
  { href: '/plans', key: 'navr_plans' },
  { href: '/reviews', key: 'rv_title' },
  { href: '/about', key: 'navr_about' },
  { href: '/blog', key: 'navr_blog' },
  { href: '/contact', key: 'navr_contact' },
].filter(available)

/**
 * The header's second row (v3 package, bt.js NAV): seven pills, the current
 * section filled forest. Labels are the package's short ones (bt_nav_*).
 * Below 1024px they move into the Menu drawer, followed by `DRAWER_EXTRA`.
 */
export const HEADER_ROUTES: readonly NavRoute[] = [
  { href: '/', key: 'bt_nav_home' },
  { href: '/services', key: 'bt_nav_services' },
  { href: '/map', key: 'bt_nav_map' },
  { href: '/activities', key: 'bt_nav_activities' },
  { href: '/driver', key: 'bt_nav_driver' },
  { href: '/about', key: 'bt_nav_about' },
  { href: '/blog', key: 'bt_nav_articles' },
].filter(available)

/** The drawer's links after the seven above (bt.js drawer). */
export const DRAWER_EXTRA: readonly NavRoute[] = [
  { href: '/itineraries', key: 'navr_itin' },
  { href: '/packages', key: 'navr_packages' },
  { href: '/custom', key: 'svc_cust_t' },
  { href: '/explore', key: 'navr_explore' },
]

/** The footer's "Quick links" column, in the package's order. */
export const FOOTER_QUICK_ROUTES: readonly NavRoute[] = [
  { href: '/', key: 'bt_nav_home' },
  { href: '/services', key: 'bt_nav_services' },
  { href: '/map', key: 'bt_nav_map' },
  { href: '/activities', key: 'bt_nav_activities' },
  { href: '/driver', key: 'bt_nav_driver' },
  { href: '/itineraries', key: 'navr_itin' },
  { href: '/packages', key: 'navr_packages' },
  { href: '/blog', key: 'bt_nav_articles' },
  { href: '/about', key: 'bt_nav_about' },
].filter(available)

/**
 * Policy pages.
 *
 * The handoff rendered these as `href="#"`, which is a dead link on a page
 * that takes card payments. They are real routes: the cancellation ladder and
 * refund terms are the evidence that wins a chargeback, so they have to be
 * readable, linkable and archivable.
 */
export const POLICY_ROUTES: readonly NavRoute[] = [
  { href: '/privacy', key: 'ft_p_privacy' },
  { href: '/terms', key: 'ft_p_terms' },
  { href: '/refund', key: 'ft_p_refund' },
  { href: '/platform-use', key: 'ft_p_platform_use' },
  { href: '/map-use', key: 'ft_p_map_use' },
  { href: '/cookies', key: 'ft_p_cookies' },
  /**
   * Not a policy, but it belongs beside them: CC BY and CC BY-SA both require
   * the photographer and licence be credited somewhere reachable, and the
   * footer is where a reader looks for exactly that kind of statement.
   */
  { href: '/credits', key: 'ft_p_credits' },
]

/** The footer's "General" column (payment marks and contact follow it). */
export const INFO_ROUTES: readonly NavRoute[] = [
  { href: '/faq', key: 'faq_title' },
  { href: '/contact', key: 'navr_contact' },
]

export const HOME_HREF = '/'
export const SERVICES_HREF = '/services'
/** Where "Start Planning" leads (v3 package: the services hub). */
export const START_PLANNING_HREF = '/services'
export const SEARCH_HREF = '/search'
/** "My Trip" — the server-owned cart. `/cart` survives as a redirect here. */
export const CART_HREF = '/my-trip'
export const FAVORITES_HREF = '/account/favorites'
export const ACCOUNT_HREF = '/account'

/**
 * Whether `href` is the section the visitor is currently in.
 *
 * Prefix match, so `/activities/mount-batur-sunrise` still highlights
 * "Activities & Events". `/` is compared exactly — otherwise it would match
 * every path on the site.
 *
 * `pathname` must come from the next-intl `usePathname()`, which has already
 * had the locale prefix removed.
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === HOME_HREF) return pathname === HOME_HREF
  return pathname === href || pathname.startsWith(`${href}/`)
}

// ---------------------------------------------------------------------------
// Cart badge wiring
// ---------------------------------------------------------------------------

/**
 * Non-httpOnly cookie holding the number of items in the server-owned cart.
 *
 * A *display hint only*, never a source of truth for price or quantity — the
 * authoritative cart lives in Postgres and is recomputed on every mutation and
 * again at checkout. It exists so the header badge does not have to call
 * `cookies()`, which would opt every route out of static rendering and send
 * every visitor to origin for a number that is decorative until they open the
 * cart.
 *
 * Declared here rather than in `header.tsx` so cart mutations — which run on
 * the server — can import the name without importing a Client Component.
 */
export const CART_COUNT_COOKIE = 'bt_cart_count'

/** Dispatch on `window` after a cart mutation to refresh the badge. */
export const CART_CHANGED_EVENT = 'bt:cart-changed'
