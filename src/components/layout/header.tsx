'use client'

/**
 * Header — v3 package (bt.js `renderHeader`, screens 01-home).
 *
 * Desktop (≥1024px), two rows:
 *   [language pill · account]   logo   [favorites · My Trip · Start Planning]
 *   then the seven section links as pills, the current one filled forest.
 * Phones/tablets: [menu · language]  logo  [favorites · My Trip]; the
 * seven links, four more destinations, "Start Planning", the account and the
 * languages live in the drawer. The bottom tab bar is `<Tabbar>`.
 *
 * Client decision: the header is NOT sticky — it stays in normal flow and
 * scrolls away with the page, so the package's "scrolled" shadow never
 * applies.
 *
 * Counters: favorites from `/api/favorites` (0 and hidden when signed out),
 * My Trip from the cart-count cookie. Both start at 0 on the server so the
 * shell stays cacheable.
 *
 * The drawer is a modal dialog: Escape closes it, Tab stays inside it, the
 * page behind does not scroll, focus returns to the Menu button, and it is
 * `inert` while closed. It closes on navigation (adjusted during render).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { LinkButton } from '@/components/bt/button'
import { useFavorites } from '@/components/bt/favorites-store'
import { Icon, Logo } from '@/components/ui'
import { Link, usePathname } from '@/i18n/routing'

import { AdminLink } from './admin-link'
import { LanguageSwitcher } from './language-switcher'
import { CurrencySwitcher } from '@/components/currency/currency-context'
import { NotificationBell } from './notification-bell'
import {
  ACCOUNT_HREF,
  CART_HREF,
  DRAWER_EXTRA,
  FAVORITES_HREF,
  HEADER_ROUTES,
  HOME_HREF,
  isActivePath,
  START_PLANNING_HREF,
} from './routes'
import { withoutHidden } from '@/lib/content/public-sections'
import { useCartCount } from './use-cart-count'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/** Counter badge on an icon button; hidden at 0 (as the package does). */
function Badge({ count }: { count: number }) {
  return (
    <span className="badge" dir="ltr" hidden={count === 0} aria-hidden="true">
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** Account icon with its popover (bt.js `#acct-pop`). Desktop only. */
function AccountMenu({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const [lastPathname, setLastPathname] = useState(pathname)
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      const node = rootRef.current
      if (node && event.target instanceof Node && !node.contains(event.target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const links: { href: string; key: string; icon: 'cal' | 'doc' | 'heart' | 'user' | 'arrow' }[] =
    signedIn
      ? [
          { href: '/account/trip', key: 'acct_nav_trip', icon: 'cal' },
          { href: '/account/schedules', key: 'acct_nav_sched', icon: 'doc' },
          { href: FAVORITES_HREF, key: 'acct_nav_fav', icon: 'heart' },
          { href: ACCOUNT_HREF, key: 'acct_nav_profile', icon: 'user' },
        ]
      : [
          { href: ACCOUNT_HREF, key: 'bt_login', icon: 'arrow' },
          { href: FAVORITES_HREF, key: 'bt_favorites', icon: 'heart' },
        ]

  return (
    <div className="lang-menu" ref={rootRef}>
      <button
        type="button"
        className="icon-btn only-desk"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t('bt_account')}
        title={t('bt_account')}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="user" size={21} />
      </button>
      {open && (
        <div className="acct-pop" style={{ insetInlineStart: 0, insetInlineEnd: 'auto' }}>
          {links.map((link) => (
            <Link key={link.href + link.key} href={link.href} onClick={() => setOpen(false)}>
              {t(link.key)}
              <Icon
                name={link.icon}
                size={16}
                className={link.icon === 'arrow' ? 'flip' : undefined}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * `hidden`: paths of sections that are empty right now (owner, Oct 2026 —
 * no published package or article), left out of the nav and the drawer.
 */
export function Header({ hidden = [] }: { hidden?: readonly string[] } = {}) {
  const t = useTranslations()
  const pathname = usePathname()
  const favorites = useFavorites()
  const cartCount = useCartCount()
  const favCount = favorites.signedIn ? favorites.keys.size : 0

  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLElement | null>(null)

  // Close the drawer when the route changes, during render, so the new page
  // never commits with the drawer still open.
  const [lastPathname, setLastPathname] = useState(pathname)
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    setMenuOpen(false)
  }

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    menuButtonRef.current?.focus()
  }, [])

  // Modal behaviour while the drawer is open. DOM work only.
  useEffect(() => {
    if (!menuOpen) return
    const drawer = drawerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawer?.querySelector<HTMLElement>('[data-autofocus]')?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
        return
      }
      if (event.key !== 'Tab' || drawer === null) return
      const items = [...drawer.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      if (first === undefined || last === undefined) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [menuOpen, closeMenu])

  const favLabel = t('bt_favorites')
  const tripLabel = t('bt_my_trip')

  return (
    <>
      <header className="hdr" id="site-hdr">
        <div className="wrap">
          <div className="hdr-top">
            <div className="hdr-start">
              <button
                ref={menuButtonRef}
                type="button"
                className="icon-btn menu-btn"
                onClick={() => setMenuOpen(true)}
                aria-expanded={menuOpen}
                aria-controls="bt-drawer"
                aria-haspopup="dialog"
                aria-label={t('nav_menu')}
              >
                <Icon name="menu" size={24} />
              </button>
              <LanguageSwitcher variant="menu" />
              <span className="only-desk-flex">
                <CurrencySwitcher />
              </span>
              <AccountMenu signedIn={favorites.signedIn} />
              <span className="only-desk-flex">
                <NotificationBell />
                <AdminLink />
              </span>
            </div>

            <Link
              href={HOME_HREF}
              className="hdr-logo"
              aria-label={`Bali Trips — ${t('bt_nav_home')}`}
            >
              <Logo height={40} priority />
            </Link>

            <div className="hdr-end">
              <Link
                href={FAVORITES_HREF}
                className="icon-btn"
                aria-label={favCount > 0 ? `${favLabel} (${favCount})` : favLabel}
                title={favLabel}
              >
                <Icon name="heart" size={21} />
                <Badge count={favCount} />
              </Link>
              <Link
                href={CART_HREF}
                className="icon-btn"
                aria-label={cartCount > 0 ? `${tripLabel} (${cartCount})` : tripLabel}
                title={tripLabel}
              >
                <Icon name="suitcase" size={22} />
                <Badge count={cartCount} />
              </Link>
              <Link href={START_PLANNING_HREF} className="btn btn-primary btn-sm cta-plan">
                {t('bt_start_planning')}
              </Link>
            </div>
          </div>
        </div>

        <nav className="hdr-nav" aria-label={t('bt_main_nav')}>
          <div className="wrap">
            <ul>
              {withoutHidden(HEADER_ROUTES, hidden).map((route) => (
                <li key={route.href}>
                  <Link
                    href={route.href}
                    aria-current={isActivePath(pathname, route.href) ? 'page' : undefined}
                  >
                    {t(route.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </header>

      {/* Siblings of the header, not children: .hdr has a backdrop-filter,
          which would become the containing block of these fixed layers. */}
      <div
        className={menuOpen ? 'drawer-scrim open' : 'drawer-scrim'}
        aria-hidden="true"
        onClick={closeMenu}
      />
      <aside
        ref={drawerRef}
        id="bt-drawer"
        className={menuOpen ? 'drawer open' : 'drawer'}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav_menu')}
        inert={!menuOpen}
      >
        <div className="drawer-head">
          <Logo height={34} />
          <button
            type="button"
            className="icon-btn"
            onClick={closeMenu}
            aria-label={t('c_close')}
            data-autofocus
          >
            <Icon name="cross" size={22} />
          </button>
        </div>
        <nav aria-label={t('bt_main_nav')}>
          {withoutHidden([...HEADER_ROUTES, ...DRAWER_EXTRA], hidden).map((route) => (
            <Link
              key={route.href}
              href={route.href}
              aria-current={isActivePath(pathname, route.href) ? 'page' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {t(route.key)}
              <Icon name="chevronr" size={18} className="flip" />
            </Link>
          ))}
        </nav>
        <div className="stack" style={{ marginTop: 20 }}>
          <LinkButton
            href={START_PLANNING_HREF}
            variant="primary"
            block
            onClick={() => setMenuOpen(false)}
          >
            {t('bt_start_planning')}
          </LinkButton>
          <LinkButton
            href={ACCOUNT_HREF}
            variant="ghost"
            block
            icon="user"
            onClick={() => setMenuOpen(false)}
          >
            {favorites.signedIn ? t('nav_account') : t('bt_login')}
          </LinkButton>
          <LanguageSwitcher />
          <CurrencySwitcher />
        </div>
      </aside>
    </>
  )
}
