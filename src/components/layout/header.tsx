'use client'

/**
 * Header.
 *
 * One quiet bar: the logo, three or four primary links, the utility icons and
 * a "Menu" button that opens a side drawer holding every other destination,
 * the language switcher and the account link. Modelled on the reference site
 * the owner picked — few choices up front, everything one tap away.
 *
 * On the home page the bar sits transparent over the full-bleed hero photo
 * and turns solid as soon as the page scrolls; everywhere else it is solid
 * from the start.
 *
 * 'use client' is unavoidable — the scroll state, the drawer and the language
 * menu are all interactive. It is deliberately the *only* client boundary in
 * the layout shell: the footer and every card stay on the server.
 *
 * Carried over from the previous header:
 *
 *  1. **Everything is a link** — logo, cart, account and every nav entry have
 *     a real href.
 *  2. **The drawer closes on navigation**, adjusted during render so the new
 *     page never paints with the drawer still open.
 *  3. **The cart badge does not make the site dynamic.** The count is read
 *     on the client from the non-httpOnly `bt_cart_count` cookie and
 *     refreshed on `bt:cart-changed`, so the shell stays cacheable.
 *
 * The drawer is a modal dialog: Escape closes it, Tab is kept inside it, the
 * page behind does not scroll, and focus returns to the Menu button.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'

import { LinkButton } from '@/components/shared'
import { Icon, Logo } from '@/components/ui'
import { Link, usePathname } from '@/i18n/routing'

import { AdminLink } from './admin-link'
import { NotificationBell } from './notification-bell'
import { LanguageSwitcher } from './language-switcher'
import { NavLinks } from './nav-links'
import {
  ACCOUNT_HREF,
  CART_CHANGED_EVENT,
  CART_COUNT_COOKIE,
  CART_HREF,
  HOME_HREF,
  isActivePath,
  PRIMARY_ROUTES,
  SEARCH_HREF,
  SERVICES_HREF,
} from './routes'

/** Scroll distance after which the bar gains its opaque background. */
const SCROLL_THRESHOLD = 24

/** Pages whose first section is a full-bleed photo the bar may float over. */
const OVERLAY_PATHS: ReadonlySet<string> = new Set([HOME_HREF])

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

function readCartCount(): number {
  if (typeof document === 'undefined') return 0
  const match = new RegExp(`(?:^|;\\s*)${CART_COUNT_COOKIE}=(\\d+)`).exec(document.cookie)
  const raw = match?.[1]
  if (raw === undefined) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/**
 * Starts at 0 and syncs after mount.
 *
 * Reading the cookie during render would produce different markup on the
 * server and the client and trip a hydration mismatch on every page.
 */
function useCartCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const sync = () => setCount(readCartCount())
    sync()

    window.addEventListener(CART_CHANGED_EVENT, sync)
    // A second tab may have changed the cart while this one was hidden.
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', sync)

    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, sync)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [])

  return count
}

function subscribeScroll(onChange: () => void): () => void {
  window.addEventListener('scroll', onChange, { passive: true })
  return () => window.removeEventListener('scroll', onChange)
}

/**
 * Whether the page has scrolled past the threshold.
 *
 * `useSyncExternalStore` rather than a scroll listener that sets state: the
 * window's scroll position is an external store, the snapshot is a boolean so
 * React only re-renders when it flips, and the server snapshot (`false`)
 * matches the first client render, so there is no hydration mismatch.
 */
function useScrolled(): boolean {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > SCROLL_THRESHOLD,
    () => false,
  )
}

export function Header() {
  const t = useTranslations()
  const pathname = usePathname()

  const scrolled = useScrolled()
  const [menuOpen, setMenuOpen] = useState(false)
  const cartCount = useCartCount()

  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const drawerRef = useRef<HTMLDivElement | null>(null)

  /*
   * Close the drawer when the route changes — adjusted during render rather
   * than in an effect, so the new page never commits with the drawer open.
   */
  const [lastPathname, setLastPathname] = useState(pathname)
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    setMenuOpen(false)
  }

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    menuButtonRef.current?.focus()
  }, [])

  // Modal behaviour while the drawer is open. Pure DOM work — focus, a key
  // listener and the body's overflow — so no state is set from the effect.
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

  const overHero = OVERLAY_PATHS.has(pathname) && !scrolled && !menuOpen
  const className = [
    'bt-header',
    overHero ? 'is-over' : null,
    scrolled ? 'is-scrolled' : null,
    OVERLAY_PATHS.has(pathname) ? 'is-overlay-page' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <header className={className}>
      <div className="wrap bt-head-bar">
        <Link href={HOME_HREF} className="bt-head-logo" aria-label={t('c_home')}>
          <Logo height={34} priority />
        </Link>

        <nav className="bt-head-primary" aria-label={t('ft_nav')}>
          {PRIMARY_ROUTES.map((route) => {
            const active = isActivePath(pathname, route.href)
            return (
              <Link
                key={route.href}
                href={route.href}
                className="bt-head-primary-link"
                aria-current={active ? 'page' : undefined}
              >
                {t(route.key)}
              </Link>
            )
          })}
        </nav>

        <div className="bt-head-end">
          {/* Renders nothing unless the viewer can actually open Studio. */}
          <AdminLink />
          <NotificationBell />

          <LanguageSwitcher variant="menu" className="bt-head-lang" />

          <Link href={SEARCH_HREF} className="bt-iconbtn bt-head-icon" aria-label={t('c_search')}>
            <Icon name="search" size={19} />
          </Link>

          <Link href={CART_HREF} className="bt-iconbtn bt-head-icon" aria-label={t('ct2_title')}>
            <Icon name="cart" size={19} />
            {cartCount > 0 && <span className="bt-iconbtn-badge">{cartCount}</span>}
          </Link>

          <Link
            href={ACCOUNT_HREF}
            className="bt-iconbtn bt-head-icon bt-head-account"
            aria-label={t('nav_account')}
          >
            <Icon name="user" size={19} />
          </Link>

          <button
            ref={menuButtonRef}
            type="button"
            className="bt-menubtn"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="bt-drawer"
            aria-haspopup="dialog"
          >
            <Icon name="menu" size={20} />
            <span className="bt-menubtn-label">{t('nav_menu')}</span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="bt-drawer-layer">
          {/* The scrim is a mouse convenience; keyboard users have Escape and
              the close button, so it is not focusable. */}
          <div className="bt-drawer-scrim" aria-hidden="true" onClick={closeMenu} />
          <div
            ref={drawerRef}
            className="bt-drawer"
            id="bt-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={t('nav_menu')}
          >
            <div className="bt-drawer-top">
              <Logo height={30} />
              <button
                type="button"
                className="bt-iconbtn"
                onClick={closeMenu}
                aria-label={t('c_close')}
                data-autofocus
              >
                <Icon name="cross" size={20} />
              </button>
            </div>

            <LanguageSwitcher className="bt-langseg-block" />

            <nav aria-label={t('ft_nav')} className="bt-drawer-nav">
              <NavLinks variant="drawer" onNavigate={() => setMenuOpen(false)} />
            </nav>

            <div className="bt-drawer-foot">
              <Link
                href={ACCOUNT_HREF}
                className="bt-drawer-account"
                onClick={() => setMenuOpen(false)}
              >
                <Icon name="user" size={18} /> {t('nav_account')}
              </Link>
              <LinkButton
                href={SERVICES_HREF}
                variant="orange"
                size="lg"
                block
                className="bt-drawer-cta"
                onClick={() => setMenuOpen(false)}
              >
                {t('c_startplan')}
              </LinkButton>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
