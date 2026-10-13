'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { Icon, type IconName } from './icons'

/**
 * Sidebar links, and the frame that turns the sidebar into a drawer on
 * narrow screens.
 *
 * Client components for two reasons only: highlighting the current section
 * needs the pathname, and the phone drawer needs an open/closed state. Hrefs
 * and labels are resolved on the server (labels already translated) and
 * passed in, so the configured admin path never reaches the browser bundle
 * as configuration.
 *
 * `next/link` and `next/navigation` deliberately, NOT the next-intl
 * navigation helpers — those add a locale prefix, and the admin has none.
 */

export interface SideNavGroup {
  title: string
  items: { href: string; label: string; exact: boolean; icon?: IconName }[]
}

export function SideNav({ groups, ariaLabel }: { groups: SideNavGroup[]; ariaLabel?: string }) {
  const pathname = usePathname()

  return (
    <nav className="a-nav" aria-label={ariaLabel}>
      {groups.map((group) => (
        <div className="a-nav-section" key={group.title}>
          <div className="a-nav-group">{group.title}</div>
          {group.items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
                {item.icon ? <Icon name={item.icon} size={18} /> : null}
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

/**
 * The sidebar container.
 *
 * Wide screens: a fixed column on the inline-start side. Below 900px: a top
 * bar with a menu button, and the sidebar slides in as a drawer. The drawer
 * remembers WHICH page it was opened on rather than a plain boolean, so
 * following a link inside it closes it without an effect.
 */
export function SideFrame({
  brand,
  menuLabel,
  closeLabel,
  children,
}: {
  brand: React.ReactNode
  menuLabel: string
  closeLabel: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const close = () => setOpenOn(null)

  return (
    <>
      <div className="a-topbar">
        <button
          type="button"
          className="a-icon-btn"
          aria-expanded={open}
          aria-controls="a-side"
          onClick={() => setOpenOn(open ? null : pathname)}
        >
          <Icon name="menu" size={22} />
          <span>{menuLabel}</span>
        </button>
        <div className="a-topbar-brand">{brand}</div>
      </div>

      <div className="a-scrim" data-open={open} onClick={close} aria-hidden="true" />

      <aside
        id="a-side"
        className="a-side"
        data-open={open}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close()
        }}
      >
        <div className="a-side-head">
          <div className="a-brand">{brand}</div>
          <button
            type="button"
            className="a-icon-btn a-side-close"
            onClick={close}
            aria-label={closeLabel}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </aside>
    </>
  )
}
