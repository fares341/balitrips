'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Sidebar links.
 *
 * The only client component in the admin, and it exists for one reason:
 * highlighting the current section needs the pathname. Hrefs are resolved on
 * the server from `ADMIN_BASE_PATH` and passed in, so the configured path
 * never has to reach the browser bundle as configuration.
 *
 * `next/link` and `next/navigation` deliberately, NOT the next-intl
 * navigation helpers — those add a locale prefix, and the admin has none.
 */

export interface SideNavGroup {
  title: string
  items: { href: string; label: string; exact: boolean }[]
}

export function SideNav({ groups }: { groups: SideNavGroup[] }) {
  const pathname = usePathname()

  return (
    <nav className="a-nav" aria-label="Admin sections">
      {groups.map((group) => (
        <div key={group.title}>
          <div className="a-nav-group">{group.title}</div>
          {group.items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
                {item.label}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
