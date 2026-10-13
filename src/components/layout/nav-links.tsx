'use client'

/**
 * NavLinks.
 *
 * The site navigation, in two presentations: the header's second row and the
 * mobile drawer. Both read `NAV_ROUTES`, so they cannot list different pages.
 *
 * 'use client' is required for `usePathname` — the current-page state is the
 * only reason this is not a Server Component.
 *
 * Two departures from the handoff:
 *
 *  1. **Anchors, not buttons.** `<button onClick={() => navigate(r)}>` gave
 *     the primary navigation no href: no middle-click, no "open in new tab",
 *     no hover preview, and nothing a crawler could follow. The stylesheet
 *     already targets `.bt-nav-desktop a` alongside `.bt-nav-btn`, so the
 *     visual result is identical.
 *  2. **`aria-current="page"`.** The handoff signalled the active item with
 *     colour alone, which is invisible to assistive tech and fails SC 1.4.1.
 */

import { useTranslations } from 'next-intl'

import { Link, usePathname } from '@/i18n/routing'
import { isActivePath, NAV_ROUTES } from './routes'

export type NavLinksVariant = 'desktop' | 'drawer'

export type NavLinksProps = {
  variant?: NavLinksVariant
  /** Called after a link is followed — the drawer uses it to close itself. */
  onNavigate?: () => void
}

export function NavLinks({ variant = 'desktop', onNavigate }: NavLinksProps) {
  const t = useTranslations()
  const pathname = usePathname()

  return (
    <>
      {NAV_ROUTES.map((route) => {
        const active = isActivePath(pathname, route.href)

        if (variant === 'drawer') {
          return (
            <Link
              key={route.href}
              href={route.href}
              className={active ? 'bt-drawer-link on' : 'bt-drawer-link'}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
            >
              {t(route.key)}
            </Link>
          )
        }

        return (
          <Link
            key={route.href}
            href={route.href}
            className={active ? 'bt-nav-btn on' : 'bt-nav-btn'}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
          >
            {t(route.key)}
          </Link>
        )
      })}
    </>
  )
}
