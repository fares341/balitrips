/**
 * Site shell (v3).
 *
 * `Header`, `Tabbar` and `Footer` are rendered once by
 * `src/app/[locale]/layout.tsx` and persist across every route. The header,
 * the tab bar and the language switcher are Client Components; the footer and
 * the route table are server-side.
 */

export { Header } from './header'
export { Tabbar } from './tabbar'
export { Footer } from './footer'
export { LanguageSwitcher } from './language-switcher'
export type { LanguageSwitcherProps } from './language-switcher'
export { NavLinks } from './nav-links'
export type { NavLinksProps, NavLinksVariant } from './nav-links'
export { useCartCount } from './use-cart-count'
export {
  ACCOUNT_HREF,
  CART_CHANGED_EVENT,
  CART_COUNT_COOKIE,
  CART_HREF,
  DRAWER_EXTRA,
  FAVORITES_HREF,
  FOOTER_QUICK_ROUTES,
  HEADER_ROUTES,
  HOME_HREF,
  INFO_ROUTES,
  NAV_ROUTES,
  POLICY_ROUTES,
  SEARCH_HREF,
  SERVICES_HREF,
  START_PLANNING_HREF,
  isActivePath,
} from './routes'
export type { NavRoute } from './routes'
