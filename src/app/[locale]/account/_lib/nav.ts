/**
 * Account navigation.
 *
 * The handoff's account panel was a full-screen overlay driven by
 * `const [tab, setTab] = useState('profile')`. That had three consequences the
 * port has to undo: no tab had a URL, so nothing was linkable or bookmarkable;
 * the browser Back button closed the whole panel instead of returning to the
 * previous section; and any navigation destroyed it outright.
 *
 * Each tab is a real nested route under `/account`. This table is the single
 * declaration of them, shared by the sidebar and the header dropdown, so the
 * two cannot drift the way the handoff's duplicated `nav` arrays did.
 *
 * Data only — no 'use client', because both the Server layout and the Client
 * nav import it.
 */

import type { IconName } from '@/components/ui/icon'

export interface AccountTab {
  /** Locale-agnostic path. The next-intl `Link` adds `/ar` or `/id`. */
  href: string
  /** Translation key in messages/{en,ar,id}.json. */
  key: string
  icon: IconName
}

export const ACCOUNT_ROOT = '/account'

export const ACCOUNT_TABS: readonly AccountTab[] = [
  { href: ACCOUNT_ROOT, key: 'acct_nav_profile', icon: 'user' },
  { href: '/account/favorites', key: 'acct_nav_fav', icon: 'heart' },
  { href: '/account/trip', key: 'acct_nav_trip', icon: 'route' },
  { href: '/account/schedules', key: 'acct_nav_sched', icon: 'cal' },
  { href: '/account/subscriptions', key: 'acct_nav_subs', icon: 'star' },
  { href: '/account/invoices', key: 'acct_nav_inv', icon: 'pdf' },
  { href: '/account/reviews', key: 'acct_nav_reviews', icon: 'star' },
  { href: '/account/notifications', key: 'acct_nav_notifs', icon: 'mail' },
  { href: '/account/support', key: 'acct_nav_support', icon: 'chat' },
  { href: '/account/devices', key: 'acct_nav_devices', icon: 'shield' },
]

/**
 * Whether `href` is the section currently being viewed.
 *
 * `/account` is compared exactly — a prefix match would light up the profile
 * tab on every sub-route. `pathname` must come from the next-intl
 * `usePathname()`, which has already had the locale prefix removed.
 */
export function isActiveTab(pathname: string, href: string): boolean {
  if (href === ACCOUNT_ROOT) return pathname === ACCOUNT_ROOT
  return pathname === href || pathname.startsWith(`${href}/`)
}
