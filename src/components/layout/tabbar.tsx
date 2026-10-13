'use client'

/**
 * Mobile bottom tab bar — v3 package (bt.js `renderTabbar`).
 *
 * Five tabs: Home, Map, Activities, My Trip (with the cart counter) and
 * Account. Fixed to the bottom with the safe-area inset under it; hidden at
 * 1024px and up, where the header's second row takes over. The current tab
 * gets aria-current and the orange bar on its top edge.
 *
 * Rendered as a direct child of <body> by the locale layout, which lets
 * bt.css reserve the space with `body:has(> .tabbar)` — page bottoms are
 * never hidden behind it.
 */

import { useTranslations } from 'next-intl'

import { Icon, type IconName } from '@/components/ui'
import { Link, usePathname } from '@/i18n/routing'

import { ACCOUNT_HREF, CART_HREF, HOME_HREF, isActivePath } from './routes'
import { useCartCount } from './use-cart-count'

type Tab = { href: string; icon: IconName; key: string; badge?: boolean }

const TABS: readonly Tab[] = [
  { href: HOME_HREF, icon: 'home', key: 'bt_tab_home' },
  { href: '/map', icon: 'map', key: 'bt_tab_map' },
  { href: '/activities', icon: 'compass', key: 'bt_tab_activities' },
  { href: CART_HREF, icon: 'suitcase', key: 'bt_tab_trip', badge: true },
  { href: ACCOUNT_HREF, icon: 'user', key: 'bt_tab_account' },
]

/** Routes that own the bottom of the screen (pay button, map sheet). */
const HIDDEN_ON = ['/checkout']

export function Tabbar() {
  const t = useTranslations()
  const pathname = usePathname()
  const cartCount = useCartCount()

  if (HIDDEN_ON.some((path) => isActivePath(pathname, path))) return null

  return (
    <nav className="tabbar" aria-label={t('bt_quick_nav')}>
      {TABS.map((tab) => {
        const active = isActivePath(pathname, tab.href)
        const label = t(tab.key)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            aria-label={tab.badge && cartCount > 0 ? `${label} (${cartCount})` : undefined}
          >
            <Icon name={tab.icon} size={22} />
            <span>{label}</span>
            {tab.badge && (
              <span className="badge" dir="ltr" hidden={cartCount === 0} aria-hidden="true">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
