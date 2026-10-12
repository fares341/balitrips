/**
 * Site shell.
 *
 * `Header` and `Footer` are rendered once by `src/app/[locale]/layout.tsx` and
 * persist across every route, so navigating between pages never re-mounts
 * them and never re-runs their effects.
 *
 * Only the header and the language switcher are Client Components; the footer
 * and the route table are server-side.
 */

export { Header } from './header'
export { Footer } from './footer'
export { LanguageSwitcher } from './language-switcher'
export type { LanguageSwitcherProps } from './language-switcher'
export { NavLinks } from './nav-links'
export type { NavLinksProps, NavLinksVariant } from './nav-links'
export {
  ACCOUNT_HREF,
  CART_CHANGED_EVENT,
  CART_COUNT_COOKIE,
  CART_HREF,
  HOME_HREF,
  NAV_ROUTES,
  POLICY_ROUTES,
  SEARCH_HREF,
  SERVICES_HREF,
  isActivePath,
} from './routes'
export type { NavRoute } from './routes'
