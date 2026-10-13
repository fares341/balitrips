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
 *  - `segmented` (default): every language visible at once as a pill of
 *    links, the current one filled. A Gulf visitor who lands on English sees
 *    the word "عربي" in the header without opening anything — the globe-and-
 *    code trigger it replaces hid the one control a bilingual site most needs
 *    to make obvious. Indonesian stays a single tap away.
 *  - `menu`: the compact globe trigger with a dropdown, for tight spaces.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
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
 * What each option says in the segmented control. Written in the language it
 * names (an endonym), so it needs no translation key. `localeConfig.short`
 * carries "ع" for Arabic, which is too cryptic to be the only signpost.
 */
const SEGMENT_LABEL: Record<Locale, string> = {
  en: 'EN',
  ar: 'عربي',
  id: 'ID',
}

export function LanguageSwitcher({ className, variant = 'segmented' }: LanguageSwitcherProps) {
  const activeLocale = useLocale() as Locale
  const pathname = usePathname()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

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
      if (event.key === 'Escape') close()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

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
        className={['bt-langseg', className].filter(Boolean).join(' ')}
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
              className={current ? 'bt-langseg-opt on' : 'bt-langseg-opt'}
              aria-current={current ? 'true' : undefined}
              // The visible text is a code ("EN"); the accessible name is the
              // full endonym ("English", "العربية", "Indonesia").
              aria-label={localeConfig[candidate].label}
              onClick={switchTo(candidate)}
            >
              {SEGMENT_LABEL[candidate]}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative' }}>
      <button
        type="button"
        className="chip"
        /*
         * The accessible name is the current language's *endonym* — "English",
         * "العربية", "Indonesia". Language names are written in their own
         * language by convention, so this needs no translation key and reads
         * correctly to a screen reader in any of the three locales. The handoff
         * hard-coded the English string "Language" for all of them.
         */
        aria-label={localeConfig[activeLocale].label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        style={{ gap: 7, padding: '9px 13px', minHeight: 44 }}
      >
        <Icon name="globe" size={17} />
        <span style={{ fontWeight: 700 }}>{SEGMENT_LABEL[activeLocale]}</span>
      </button>

      {open && (
        <div role="menu" className="bt-langmenu">
          {locales.map((candidate) => {
            const current = candidate === activeLocale
            return (
              <Link
                key={candidate}
                href={pathname}
                locale={candidate}
                hrefLang={candidate}
                lang={candidate}
                role="menuitem"
                aria-current={current ? 'true' : undefined}
                onClick={switchTo(candidate)}
                className={current ? 'bt-langmenu-item on' : 'bt-langmenu-item'}
              >
                <span>{localeConfig[candidate].label}</span>
                {current && <Icon name="check" size={16} color="var(--orange-ink)" />}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
