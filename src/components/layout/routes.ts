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

export interface NavRoute {
  /** Locale-agnostic path, e.g. `/activities`. */
  href: string
  /** Translation key in messages/{en,ar,id}.json. */
  key: string
}

/** Second-row navigation, in the design's order. */
export const NAV_ROUTES: readonly NavRoute[] = [
  { href: '/', key: 'navr_home' },
  { href: '/services', key: 'navr_services' },
  { href: '/driver', key: 'navr_driver2' },
  { href: '/activities', key: 'navr_act' },
  { href: '/itineraries', key: 'navr_itin' },
  /**
   * Packages were reachable only from a card on the home page and one link on
   * /services, so a visitor browsing the navigation never found them at all --
   * six published products effectively invisible.
   */
  { href: '/packages', key: 'navr_packages' },
  { href: '/map', key: 'navr_map' },
  { href: '/explore', key: 'navr_explore' },
  { href: '/plans', key: 'acct_nav_subs' },
  { href: '/blog', key: 'navr_blog' },
  { href: '/contact', key: 'navr_contact' },
]

/**
 * Policy pages.
 *
 * The handoff rendered these as `href="#"`, which is a dead link on a page
 * that takes card payments. They are real routes: the cancellation ladder and
 * refund terms are the evidence that wins a chargeback, so they have to be
 * readable, linkable and archivable.
 */
export const POLICY_ROUTES: readonly NavRoute[] = [
  { href: '/terms', key: 'ft_p_terms' },
  { href: '/privacy', key: 'ft_p_privacy' },
  { href: '/refund', key: 'ft_p_refund' },
  { href: '/cookies', key: 'ft_p_cookies' },
  /**
   * Not a policy, but it belongs beside them: CC BY and CC BY-SA both require
   * the photographer and licence be credited somewhere reachable, and the
   * footer is where a reader looks for exactly that kind of statement.
   */
  { href: '/credits', key: 'ft_p_credits' },
]

export const HOME_HREF = '/'
export const SERVICES_HREF = '/services'
export const SEARCH_HREF = '/search'
export const CART_HREF = '/cart'
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
