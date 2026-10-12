'use client'

/**
 * Account dropdown.
 *
 * components.css already carries `.bt-acctmenu` — the handoff designed the
 * menu and then never built it: the prototype's header had a bare user icon
 * that opened the whole account overlay, and the dropdown skin was dead CSS.
 * This is that menu, with the three behaviours a dropdown has to have and the
 * prototype's overlays did not: it closes on Escape, on a click outside, and
 * on navigation.
 *
 * Every row is a `<Link>` to a real account URL, so the menu is also the
 * mobile route to the sections — the sidebar's rail collapses under 880px and
 * `.bt-acct-signout` is `display: none` there.
 *
 * Rendered in the account page's heading bar. Mounting it in the site header
 * is a one-line import in `src/components/layout/header.tsx`, which this slice
 * does not own; the component takes its items as a prop precisely so that call
 * site does not have to reach into a route folder for them.
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'
import { Link, usePathname } from '@/i18n/routing'

import type { AccountTab } from './_lib/nav'
import { SignOutButton } from './sign-out-button'

export type AccountMenuProps = {
  name: string | null
  email: string
  items: readonly AccountTab[]
}

export function AccountMenu({ name, email, items }: AccountMenuProps) {
  const t = useTranslations()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  /*
   * Close on navigation, adjusted during render rather than in an effect.
   * An effect would paint the new page with the menu still hanging open over
   * it — React's documented "adjusting state when a prop changes" pattern
   * avoids that extra frame.
   */
  const [lastPathname, setLastPathname] = useState(pathname)
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    const onPointerDown = (event: PointerEvent) => {
      const anchor = anchorRef.current
      if (anchor === null) return
      if (event.target instanceof Node && anchor.contains(event.target)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const label = name ?? email
  const initial = label.trim().charAt(0).toUpperCase() || 'T'

  return (
    <div className="bt-acctmenu-anchor" ref={anchorRef}>
      <button
        type="button"
        className="bt-iconbtn"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="bt-acctmenu"
        aria-label={t('acct_menu_account')}
        style={{ width: 'auto', paddingInline: 6, gap: 8 }}
      >
        <span className="bt-avatar" style={{ width: 32, height: 32, fontSize: 13 }}>
          {initial}
        </span>
        <Icon name="chevron" size={16} />
      </button>

      {open && (
        <div className="bt-acctmenu" id="bt-acctmenu">
          <div className="bt-acctmenu-head">
            <span className="bt-avatar">{initial}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{label}</div>
              <div
                className="muted"
                style={{
                  fontSize: 12.5,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {email}
              </div>
            </div>
          </div>

          <nav className="bt-acctmenu-list" aria-label={t('acct_title')}>
            {items.map((item) => (
              <Link key={item.href} href={item.href}>
                <Icon name={item.icon} size={18} color="var(--forest-soft)" />
                <span>{t(item.key)}</span>
              </Link>
            ))}
          </nav>

          <div className="bt-acctmenu-foot">
            <SignOutButton className="" icon={false} />
          </div>
        </div>
      )}
    </div>
  )
}
