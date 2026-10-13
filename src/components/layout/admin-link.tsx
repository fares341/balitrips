'use client'

/**
 * Studio shortcut in the header, for users who can actually open it.
 *
 * Asked once per page load, not per navigation: the header is mounted above
 * the route slot and survives client-side navigation, so the module-level
 * promise below is shared by every page the visitor moves through. A fetch in
 * the component without it would fire on every route change.
 *
 * Renders nothing at all for everyone else — no hidden element, no disabled
 * button, no `display: none`. A link that exists in the DOM and is merely
 * invisible still hands the admin path to anyone who opens devtools.
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'

/**
 * Shared across mounts and navigations. `undefined` means "not asked yet";
 * a resolved `null` means "asked, and this visitor is not an admin", which is
 * remembered so the question is not re-asked on every page.
 */
let pending: Promise<string | null> | undefined

function adminHrefOnce(): Promise<string | null> {
  pending ??= fetch('/api/admin-link', { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : { href: null }))
    .then((data: { href: string | null }) => data.href)
    // A failed request must not break the header for anyone; the shortcut is
    // a convenience and the admin is reachable by URL regardless.
    .catch(() => null)
  return pending
}

export function AdminLink() {
  const t = useTranslations()
  const [href, setHref] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void adminHrefOnce().then((value) => {
      if (!cancelled) setHref(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (href === null) return null

  return (
    <a href={href} className="icon-btn" aria-label={t('nav_studio')} title={t('nav_studio')}>
      <Icon name="shield" size={18} />
    </a>
  )
}
