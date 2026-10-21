import Link from 'next/link'

import type { Role } from '@/lib/auth/roles'

import { adminHref } from '../_lib/admin-path'
import { canOpen } from '../_lib/route-access'

/**
 * A link to another Studio page, shown as a link only to a role that can open
 * that page (`route-access.ts`). For anyone else the label stays as plain
 * text (`fallback="text"`, the default — a plan's name in a table) or the
 * link disappears (`fallback="hide"` — a button such as "Back to plans").
 *
 * Presentation only: the target page checks the capability itself.
 */
export function StudioLink({
  role,
  path,
  fallback = 'text',
  className,
  children,
}: {
  role: Role
  /** Relative to the Studio base, as `adminHref()` takes it. */
  path: string
  fallback?: 'text' | 'hide'
  className?: string
  children: React.ReactNode
}) {
  if (canOpen(role, path)) {
    return (
      <Link className={className} href={adminHref(path)}>
        {children}
      </Link>
    )
  }
  if (fallback === 'hide') return null
  // A button-styled link would look clickable; only plain styling is kept.
  return <span className={className?.includes('a-btn') ? undefined : className}>{children}</span>
}
