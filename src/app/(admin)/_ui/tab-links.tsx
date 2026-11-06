'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Section tab links; the longest matching tab is the current one. */
export function TabLinks({
  tabs,
  label,
}: {
  tabs: { href: string; label: string; exact: boolean }[]
  label: string
}) {
  const pathname = usePathname()
  const hit = (tab: { href: string; exact: boolean }) =>
    tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
  const current = tabs
    .filter(hit)
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
  return (
    <nav className="a-subtabs" aria-label={label}>
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={tab.href === current ? 'page' : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
