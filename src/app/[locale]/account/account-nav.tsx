'use client'

/**
 * Section navigation.
 *
 * Six `<Link>`s to six real URLs, replacing the handoff's
 * `<button onClick={() => setTab(n.key)}>`. That difference is the whole point
 * of the port: `/account/invoices` can be bookmarked, shared with support,
 * opened in a new tab and reached with the Back button, and none of those were
 * possible when the section lived in `useState`.
 *
 * 'use client' buys exactly one thing — `usePathname()`, to mark the active
 * tab. Everything it renders is otherwise static.
 */

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'
import { Link, usePathname } from '@/i18n/routing'

import { ACCOUNT_TABS, isActiveTab } from './_lib/nav'

export function AccountNav() {
  const t = useTranslations()
  const pathname = usePathname()

  return (
    <nav className="bt-acct-nav" aria-label={t('acct_title')}>
      {ACCOUNT_TABS.map((tab) => {
        const active = isActiveTab(pathname, tab.href)

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? 'bt-acct-navlink on' : 'bt-acct-navlink'}
            // The styling alone does not tell a screen reader which section is
            // open; the handoff had no equivalent at all.
            aria-current={active ? 'page' : undefined}
          >
            {/*
              An active tab's glyph is coloured by the stylesheet — ivory on
              the mobile pill, orange on the desktop rail — and a CSS rule
              beats the `stroke` presentation attribute, so no colour is
              passed in that case.
            */}
            <Icon name={tab.icon} size={18} {...(active ? {} : { color: 'var(--forest-soft)' })} />
            <span>{t(tab.key)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
