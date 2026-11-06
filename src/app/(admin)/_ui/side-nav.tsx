'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

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
  id: string
  title: string
  items: { href: string; label: string; exact: boolean; icon?: IconName }[]
}

/** Remembered state per user: `{ [groupId]: true }` for a collapsed group. */
function readCollapsed(key: string): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function writeCollapsed(key: string, value: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private window or blocked storage: the sidebar still works, it just forgets.
  }
}

/**
 * Collapsible groups. Every group starts open (the server render, and a
 * first visit); the remembered state is applied after mount. The group that
 * holds the current page is always open, so the highlighted link is never
 * hidden.
 */
export function SideNav({
  groups,
  ariaLabel,
  storageKey,
}: {
  groups: SideNavGroup[]
  ariaLabel?: string
  storageKey: string
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setCollapsed(readCollapsed(storageKey))
  }, [storageKey])

  const matches = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
  // A nested entry (e.g. Plans → VIP settings) wins over its parent section.
  const hrefs = groups.flatMap((group) => group.items)
  const deeper = (href: string) =>
    hrefs.some((other) => other.href.startsWith(`${href}/`) && matches(other.href, other.exact))
  const isActive = (item: { href: string; exact: boolean }) =>
    matches(item.href, item.exact) && !deeper(item.href)

  const toggle = (id: string) => {
    setCollapsed((current) => {
      const next = { ...current, [id]: !current[id] }
      if (!next[id]) delete next[id]
      writeCollapsed(storageKey, next)
      return next
    })
  }

  return (
    <nav className="a-nav" aria-label={ariaLabel}>
      {groups.map((group) => {
        const holdsCurrent = group.items.some(isActive)
        const open = holdsCurrent || !collapsed[group.id]
        const listId = `a-nav-${group.id}`
        return (
          <div className="a-nav-section" key={group.id} data-open={open}>
            <button
              type="button"
              className="a-nav-group"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => toggle(group.id)}
              disabled={holdsCurrent}
            >
              <span>{group.title}</span>
              <span className="a-nav-count">{group.items.length}</span>
              <svg className="a-nav-caret" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
            <div className="a-nav-items" id={listId} hidden={!open}>
              {group.items.map((item) => {
                const active = isActive(item)
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
                    {item.icon ? <Icon name={item.icon} size={18} /> : null}
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
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
