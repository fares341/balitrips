'use client'

/**
 * Header.
 *
 * Ported from design/handoff/sections-bt/header.jsx: sticky, blurred, centered
 * logo, icon rail on both sides, a second row of navigation that scrolls
 * horizontally on desktop, and a drawer under 900px.
 *
 * 'use client' is unavoidable — the scroll state, the drawer and the language
 * menu are all interactive. It is deliberately the *only* client boundary in
 * the layout shell: the footer and every card stay on the server.
 *
 * Four fixes over the handoff:
 *
 *  1. **The drawer state is reset at the breakpoint.** The handoff only hid
 *     `.bt-drawer` with `display: none !important` above 900px, so a visitor
 *     who opened the menu on a phone, rotated to landscape and rotated back
 *     found it still open — and, worse, the burger icon showed a close cross
 *     for a drawer nobody could see. A `matchMedia` listener clears the state
 *     rather than the stylesheet hiding it.
 *  2. **Everything is a link.** `navigate()` pushed `"#" + name`, so the logo,
 *     the cart and the CTA had no href.
 *  3. **The drawer closes on navigation.** With real client-side routing the
 *     drawer would otherwise stay open over the page it just opened.
 *  4. **The cart badge does not make the site dynamic.** Reading the cart
 *     server-side means `cookies()`, which opts every route out of static
 *     rendering and sends every visitor to origin. The count is read on the
 *     client from a non-httpOnly `bt_cart_count` cookie that cart mutations
 *     maintain, and refreshed on the `bt:cart-changed` event, so the shell
 *     stays cacheable at the edge.
 */

import { useEffect, useState } from 'react'
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
  SEARCH_HREF,
  SERVICES_HREF,
} from './routes'

/** Matches the `@media (min-width: 900px)` block in components.css. */
const DESKTOP_QUERY = '(min-width: 900px)'

/** Scroll distance after which the bar gains its opaque background. */
const SCROLL_THRESHOLD = 20

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

export function Header() {
  const t = useTranslations()
  const pathname = usePathname()

  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const cartCount = useCartCount()

  /*
   * Close the drawer when the route changes.
   *
   * Adjusted during render rather than in an effect: an effect would commit
   * the new page with the drawer still open and only then close it, which is
   * a visible flash on a slow device. This is React's documented
   * "adjusting state when a prop changes" pattern — the extra render happens
   * before anything is painted.
   */
  const [lastPathname, setLastPathname] = useState(pathname)
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    setMenuOpen(false)
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Reset, do not merely hide. See note 1 at the top of the file. Subscribing
  // to an external system (the media query) is exactly what effects are for.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return (
    <header
      className="bt-header"
      style={{
        background: scrolled ? 'rgba(255,251,248,0.94)' : 'rgba(255,251,248,0.8)',
        borderBottom: scrolled ? '1px solid var(--line-soft)' : '1px solid transparent',
      }}
    >
      <div className="wrap bt-head-bar">
        <div className="bt-head-side bt-head-start">
          <button
            type="button"
            className="bt-burger"
            onClick={() => setMenuOpen((value) => !value)}
            /*
             * There is no dedicated "Menu" key in the 609-key catalogue, and
             * inventing an English literal here would ship untranslated copy to
             * Arabic and Indonesian readers. `ft_nav` — "Quick links" /
             * "روابط سريعة" / "Tautan cepat" — is the existing, translated name
             * for exactly this set of links, and it labels the drawer's own
             * landmark below, so the two agree.
             */
            aria-label={t('ft_nav')}
            aria-expanded={menuOpen}
            aria-controls="bt-drawer"
          >
            <Icon name={menuOpen ? 'cross' : 'menu'} size={22} />
          </button>
          <div className="bt-head-side-desktop">
            <Link href={ACCOUNT_HREF} className="bt-iconbtn" aria-label={t('nav_account')}>
              <Icon name="user" size={20} />
            </Link>
            <LanguageSwitcher />
          </div>
        </div>

        <Link href={HOME_HREF} className="bt-head-logo" aria-label={t('c_home')}>
          <Logo height={32} priority />
        </Link>

        <div className="bt-head-side bt-head-end">
          {/* Renders nothing unless the viewer can actually open Studio. */}
          <AdminLink />
          <NotificationBell />

          <Link href={SEARCH_HREF} className="bt-iconbtn" aria-label={t('c_search')}>
            <Icon name="search" size={19} />
          </Link>

          <Link href={CART_HREF} className="bt-iconbtn" aria-label={t('ct2_title')}>
            <Icon name="cart" size={19} />
            {cartCount > 0 && <span className="bt-iconbtn-badge">{cartCount}</span>}
          </Link>

          <LinkButton
            href={SERVICES_HREF}
            variant="orange"
            size="sm"
            className="bt-cta-desktop"
            style={{ paddingInline: 20 }}
          >
            {t('c_startplan')}
          </LinkButton>

          <div className="bt-head-acct-mobile">
            <Link href={ACCOUNT_HREF} className="bt-iconbtn" aria-label={t('nav_account')}>
              <Icon name="user" size={20} />
            </Link>
          </div>
        </div>
      </div>

      <nav className="bt-nav-desktop" aria-label={t('ft_nav')}>
        <NavLinks variant="desktop" />
      </nav>

      {menuOpen && (
        <div className="bt-drawer" id="bt-drawer">
          <nav aria-label={t('ft_nav')} style={{ display: 'flex', flexDirection: 'column' }}>
            <NavLinks variant="drawer" onNavigate={() => setMenuOpen(false)} />
          </nav>
          <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
            <LanguageSwitcher />
            <LinkButton
              href={SERVICES_HREF}
              variant="orange"
              size="md"
              style={{ flex: 1 }}
              onClick={() => setMenuOpen(false)}
            >
              {t('c_startplan')}
            </LinkButton>
          </div>
        </div>
      )}
    </header>
  )
}
