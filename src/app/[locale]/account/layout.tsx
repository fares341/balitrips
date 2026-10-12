/**
 * Account shell.
 *
 * The handoff rendered this as `<div className="bt-acct-scrim">` — a fixed,
 * full-viewport overlay mounted from `useState`. It had no URL, so nothing in
 * it could be bookmarked or shared; Back closed it instead of stepping between
 * sections; and any navigation destroyed it outright. The visual language is
 * unchanged, but it is now a layout wrapped around six nested routes.
 *
 * Two consequences of that move are handled here:
 *
 *  - **The close button is gone.** There is nothing to close: `/account` is a
 *    page, and the site header is still above it. `.bt-acct-scrim` and
 *    `.bt-acct-top` are deliberately not used — the first is `position: fixed`
 *    and would cover the header, the second is dialog chrome.
 *  - **Signed out renders nothing but the child.** `requireUser()` sends an
 *    unauthenticated visitor to `/account`, which is where sign-in lives, so
 *    the account chrome must not assume a user. Wrapping the sign-in pane in
 *    a sidebar full of empty tabs would be worse than useless.
 *
 * Dynamic by necessity: everything below reads the session.
 */

import { getTranslations, setRequestLocale } from 'next-intl/server'

import { HOME_HREF } from '@/components/layout/routes'
import { Breadcrumbs } from '@/components/shared'
import { contactLabel } from '@/lib/auth/phone'
import { getUser } from '@/lib/auth/session'

import { toLocale } from '../_seo-hreflang'
import { AccountMenu } from './account-menu'
import { AccountNav } from './account-nav'
import { ACCOUNT_TABS } from './_lib/nav'
import { SignOutButton } from './sign-out-button'

import './account.css'

/** Per-visitor, session-gated: there is nothing here to prerender or cache. */
export const dynamic = 'force-dynamic'

type LayoutParams = Promise<{ locale: string }>

export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: LayoutParams
}) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const user = await getUser()

  if (user === null) {
    return <div className="bt-acct-page">{children}</div>
  }

  const contact = contactLabel(user)
  const label = user.name ?? contact
  const initial = label.trim().charAt(0).toUpperCase() || 'T'

  return (
    <div className="bt-acct-page">
      <div className="wrap">
        <Breadcrumbs
          trail={[{ label: t('c_home'), href: HOME_HREF }, { label: t('acct_title') }]}
          label={t('c_breadcrumb')}
        />
      </div>

      <div className="bt-acct-pagehead">
        {/*
          Not an <h1>: each section owns the page's heading, and two h1s would
          leave a screen reader unsure which one names the document.
        */}
        <span style={{ fontWeight: 800, fontSize: 20 }}>{t('acct_title')}</span>
        <AccountMenu name={user.name} email={contact} items={ACCOUNT_TABS} />
      </div>

      <div className="bt-acct-grid">
        <aside className="bt-acct-side">
          <div className="bt-acct-user">
            <span className="bt-avatar bt-avatar-lg" aria-hidden="true">
              {initial}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15.5 }}>{label}</div>
              <div
                className="muted"
                style={{
                  fontSize: 12.5,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {contact}
              </div>
            </div>
          </div>

          <AccountNav />
          <SignOutButton />
        </aside>

        <main className="bt-acct-main">{children}</main>
      </div>
    </div>
  )
}
