import Link from 'next/link'

import { can } from '@/lib/auth/roles'

import { adminHref } from '../_lib/admin-path'
import { setAdminLocale } from '../_lib/i18n-actions'
import type { AdminSession, TwoFactorGate } from '../_lib/session'
import { SECURITY_PATH } from '../_lib/session'
import { uiI18n } from './i18n-server'
import { Icon, type IconName } from './icons'
import { NAV_GROUPS } from './nav'
import { SideFrame, SideNav, type SideNavGroup } from './side-nav'

/** One glyph per sidebar link, keyed by the link's dictionary key. */
const NAV_ICONS: Record<string, IconName> = {
  'nav.dashboard': 'home',
  'nav.inbox': 'inbox',
  'nav.assistant': 'sparkle',
  'nav.notify': 'bell',
  'nav.customers': 'users',
  'nav.leads': 'message',
  'nav.tasks': 'check',
  'nav.support': 'send',
  'nav.duplicates': 'users',
  'nav.discounts': 'tag',
  'nav.profit': 'pulse',
  'nav.reconciliation': 'clipboard',
  'nav.orders': 'bag',
  'nav.payments': 'card',
  'nav.plans': 'layers',
  'nav.vip': 'star',
  'nav.entitlements': 'key',
  'nav.capacity': 'car',
  'nav.places': 'pin',
  'nav.map': 'map',
  'nav.itineraries': 'route',
  'nav.activities': 'compass',
  'nav.packages': 'box',
  'nav.articles': 'article',
  'nav.landmarks': 'landmark',
  'nav.reviews': 'star',
  'nav.taxonomy': 'tag',
  'nav.media': 'image',
  'nav.files': 'file',
  'nav.protection': 'shield',
  'nav.alerts': 'alert',
  'nav.sessions': 'pulse',
  'nav.devices': 'phone',
  'nav.activity': 'list',
  'nav.translations': 'globe',
  'nav.config': 'sliders',
  'nav.whatsapp': 'message',
  'nav.audit': 'clipboard',
  'nav.security': 'lock',
}

/**
 * The admin frame: sidebar (a drawer on phones), identity, language switch,
 * and the slot everything renders into.
 */
export async function Shell({
  session,
  twoFactor,
  children,
}: {
  session: AdminSession
  twoFactor: TwoFactorGate
  children: React.ReactNode
}) {
  const { t, locale } = await uiI18n()
  const otherLocale = locale === 'ar' ? 'en' : 'ar'

  const groups: SideNavGroup[] = NAV_GROUPS.map((group) => ({
    title: t(group.titleKey),
    items: group.items
      .filter((item) => can(session.role, item.capability))
      .map((item) => ({
        href: adminHref(item.path),
        label: t(item.labelKey),
        exact: item.exact ?? false,
        icon: NAV_ICONS[item.labelKey],
      })),
  })).filter((group) => group.items.length > 0)

  const brand = (
    <>
      <span className="a-brand-mark" aria-hidden="true">
        B
      </span>
      <span className="a-brand-text">
        {t('shell.brand')}
        <small>{t('shell.studio')}</small>
      </span>
    </>
  )

  return (
    <div className="a-shell">
      <a className="a-skip" href="#a-content">
        {t('shell.skip_to_content')}
      </a>

      <SideFrame brand={brand} menuLabel={t('shell.menu')} closeLabel={t('shell.close_menu')}>
        <SideNav groups={groups} ariaLabel={t('nav.aria')} />

        <div className="a-side-foot">
          <form action={setAdminLocale} className="a-lang">
            <input type="hidden" name="locale" value={otherLocale} />
            <button
              type="submit"
              className="a-lang-btn"
              lang={otherLocale}
              title={t('shell.switch_language')}
            >
              <Icon name="globe" size={18} />
              <span>{t('shell.lang_other')}</span>
            </button>
          </form>

          <div className="a-me">
            <span className="a-me-avatar" aria-hidden="true">
              {(session.name ?? session.email).trim().charAt(0).toUpperCase()}
            </span>
            <span className="a-me-text">
              <b>{session.name ?? session.email}</b>
              <span>{t(`shell.role_${session.role}`)}</span>
            </span>
          </div>
        </div>
      </SideFrame>

      {/*
        The banner appears only while there is something to do about it —
        the account has not enrolled, or this session has not answered the
        challenge. A warning that cannot be cleared trains people to ignore
        warnings, so once the second factor is satisfied this disappears
        entirely.
      */}
      <main className="a-main" id="a-content" tabIndex={-1}>
        {twoFactor === 'satisfied' ? null : (
          <div className="a-flash warn" role="status">
            <Icon name="lock" size={20} />
            <span>
              {twoFactor === 'enrol' ? t('shell.twofa_enrol') : t('shell.twofa_challenge')}{' '}
              <Link href={adminHref(SECURITY_PATH)}>
                {twoFactor === 'enrol'
                  ? t('shell.twofa_enrol_link')
                  : t('shell.twofa_challenge_link')}
              </Link>
            </span>
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
      <div className="a-head-text">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="a-actions">{actions}</div> : null}
    </header>
  )
}
