import Link from 'next/link'

import { can } from '@/lib/auth/roles'

import { adminHref } from '../_lib/admin-path'
import type { AdminSession, TwoFactorGate } from '../_lib/session'
import { SECURITY_PATH } from '../_lib/session'
import { NAV_GROUPS } from './nav'
import { SideNav, type SideNavGroup } from './side-nav'

/**
 * The admin frame: sidebar, identity, and the slot everything renders into.
 */
export function Shell({
  session,
  twoFactor,
  children,
}: {
  session: AdminSession
  twoFactor: TwoFactorGate
  children: React.ReactNode
}) {
  const groups: SideNavGroup[] = NAV_GROUPS.map((group) => ({
    title: group.title,
    items: group.items
      .filter((item) => can(session.role, item.capability))
      .map((item) => ({
        href: adminHref(item.path),
        label: item.label,
        exact: item.exact ?? false,
      })),
  })).filter((group) => group.items.length > 0)

  return (
    <div className="a-shell">
      <aside className="a-side">
        <div className="a-brand">
          Bali Trips
          <small>Studio</small>
        </div>

        <SideNav groups={groups} />

        <div className="a-side-foot">
          <div style={{ fontWeight: 700 }}>{session.name ?? session.email}</div>
          <div>{session.email}</div>
          <div style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>
            {session.role}
          </div>
        </div>
      </aside>

      {/*
        The banner appears only while there is something to do about it —
        the account has not enrolled, or this session has not answered the
        challenge. A warning that cannot be cleared trains people to ignore
        warnings, so once the second factor is satisfied this disappears
        entirely.
      */}
      <main className="a-main">
        {twoFactor === 'satisfied' ? null : (
          <div className="a-flash warn" role="status">
            {twoFactor === 'enrol'
              ? 'Two-factor authentication is required for your role and is not set up yet. '
              : 'This session has not passed the two-factor challenge. '}
            <Link href={adminHref(SECURITY_PATH)}>
              {twoFactor === 'enrol' ? 'Set it up now' : 'Enter a code'}
            </Link>
            .
          </div>
        )}
        {children}
      </main>
    </div>
  )
}

/** Page title block, with an optional action cluster on the trailing side. */
export function PageHead({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="a-head">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="a-actions">{actions}</div> : null}
    </header>
  )
}
