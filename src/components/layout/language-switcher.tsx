'use client'

/**
 * LanguageSwitcher.
 *
 * Ported from `LangSwitcher` in design/handoff/sections-bt/header.jsx.
 *
 * The prototype switched a `lang` variable in React state, so the URL never
 * changed: /activities was English, Arabic and Indonesian at the same address.
 * Nothing was shareable, nothing was indexable in Arabic, and a refresh threw
 * the choice away. Here each option is a real link to the same page under a
 * different locale, which is also what makes `hreflang` meaningful.
 *
 * Behaviour details:
 *
 *  - The options are anchors, so they work with JavaScript disabled and can be
 *    opened in a new tab. The click handler upgrades that to a client
 *    navigation that also carries the query string across — losing `?sort=top`
 *    when switching to Arabic would silently reset a filtered list.
 *  - `document.startViewTransition`-free: the direction flips between LTR and
 *    RTL, so a cross-fade would animate the whole page mirroring.
 *  - Escape closes, an outside click closes, and focus is not trapped — this
 *    is a menu, not a dialog.
 *
 * Two presentations:
 *
 *  - `segmented` (default): every language visible at once as a segmented
 *    control of links (`.seg`), the current one raised — used in the mobile
 *    drawer (v3 package).
 *  - `menu`: the header's language pill (`.lang-btn`: globe + "ع"/"EN") with
 *    a dropdown (`.lang-pop`).
 *    A proper menu button: ArrowDown/ArrowUp open it on the current/last
 *    item, the arrow keys, Home and End move between languages, Escape
 *    closes it and returns focus to the globe, and Tab closes it and moves on.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLocale } from 'next-intl'

import { Icon } from '@/components/ui'
import { localeConfig, locales, type Locale } from '@/i18n/config'
import { Link, usePathname, useRouter } from '@/i18n/routing'

export type LanguageSwitcherProps = {
  /** Extra classes on the root, e.g. to stretch it inside the drawer. */
  className?: string
  /** `segmented` shows every language inline; `menu` is a globe dropdown. */
  variant?: 'segmented' | 'menu'
}

/**
 * The code on the header's language pill (v3 package: globe + "ع" / "EN").
 * The accessible name is the full endonym from `localeConfig`.
 */
const PILL_LABEL: Record<Locale, string> = {
  en: 'English',
  ar: 'عربي',
  id: 'Bahasa Indonesia',
}

function menuItems(menu: HTMLElement | null): HTMLAnchorElement[] {
  return menu === null ? [] : [...menu.querySelectorAll<HTMLAnchorElement>('[role^="menuitem"]')]
}

export function LanguageSwitcher({ className, variant = 'segmented' }: LanguageSwitcherProps) {
  const activeLocale = useLocale() as Locale
  const pathname = usePathname()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  /** Which item takes focus when the menu opens: the current language, or the last. */
  const openFocus = useRef<'current' | 'last'>('current')

  const close = useCallback(() => setOpen(false), [])

  /*
   * Close when the route changes, so the menu is never left hanging open over
   * a page the visitor has already navigated away from. Adjusted during
   * render rather than in an effect — see the same note in header.tsx.
   */
  const [lastPathname, setLastPathname] = useState(pathname)
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const node = containerRef.current
      if (node && event.target instanceof Node && !node.contains(event.target)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      close()
      // Escape hands focus back to the button that opened the menu.
      if (menuRef.current?.contains(document.activeElement)) triggerRef.current?.focus()
    }

    // Move focus into the menu so the arrow keys work straight away.
    const items = menuItems(menuRef.current)
    const target =
      openFocus.current === 'last'
        ? items[items.length - 1]
        : (items.find((item) => item.dataset.current === 'true') ?? items[0])
    target?.focus()

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  /** ArrowDown/Enter/Space open on the current item, ArrowUp on the last. */
  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openFocus.current = event.key === 'ArrowUp' ? 'last' : 'current'
      setOpen(true)
    }
  }

  /** Arrow keys, Home and End move between items; Tab closes the menu. */
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    const items = menuItems(menuRef.current)
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement as HTMLAnchorElement)
    let next: number | null = null
    if (event.key === 'ArrowDown') next = (index + 1) % items.length
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else if (event.key === ' ') {
      // Space activates a menu item, as Enter already does for a link.
      event.preventDefault()
      items[index]?.click()
      return
    }
    if (next === null) return
    event.preventDefault()
    items[next]?.focus()
  }

  const switchTo = (next: Locale) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle modified clicks (new tab, new window, download).
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }
    event.preventDefault()
    setOpen(false)
    if (next === activeLocale) return
    // `usePathname` has the locale prefix stripped; the search string is not
    // part of it, so it has to be re-attached explicitly.
    router.replace(`${pathname}${window.location.search}`, { locale: next })
  }

  if (variant === 'segmented') {
    return (
      <nav
        className={['seg', className].filter(Boolean).join(' ')}
        /*
         * Named by the current language's endonym, as the menu trigger is:
         * it reads correctly to a screen reader in all three locales without
         * a translation key.
         */
        aria-label={localeConfig[activeLocale].label}
      >
        {locales.map((candidate) => {
          const current = candidate === activeLocale
          return (
            <Link
              key={candidate}
              href={pathname}
              locale={candidate}
              hrefLang={candidate}
              lang={candidate}
              aria-current={current ? 'true' : undefined}
              // The visible text is a code ("EN"); the accessible name is the
              // full endonym ("English", "العربية", "Indonesia").
              aria-label={localeConfig[candidate].label}
              onClick={switchTo(candidate)}
            >
              {localeConfig[candidate].label}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <div ref={containerRef} className={['lang-menu', className].filter(Boolean).join(' ')}>
      <button
        ref={triggerRef}
        type="button"
        className="lang-btn"
        /*
         * The accessible name is the current language's *endonym* — "English",
         * "العربية", "Indonesia". Language names are written in their own
         * language by convention, so this needs no translation key and reads
         * correctly to a screen reader in any of the three locales. The handoff
         * hard-coded the English string "Language" for all of them.
         */
        aria-label={localeConfig[activeLocale].label}
        title={localeConfig[activeLocale].label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          openFocus.current = 'current'
          setOpen((value) => !value)
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <Icon name="globe" size={16} />
        <span aria-hidden="true">{PILL_LABEL[activeLocale]}</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={localeConfig[activeLocale].label}
          className="lang-pop"
          onKeyDown={onMenuKeyDown}
        >
          {locales.map((candidate) => {
            const current = candidate === activeLocale
            return (
              <Link
                key={candidate}
                href={pathname}
                locale={candidate}
                hrefLang={candidate}
                lang={candidate}
                role="menuitemradio"
                aria-checked={current}
                // Roving focus: arrow keys move between items, Tab leaves.
                tabIndex={-1}
                data-current={current ? 'true' : undefined}
                onClick={switchTo(candidate)}
              >
                <span>{localeConfig[candidate].label}</span>
                {current && <Icon name="check" size={16} />}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
