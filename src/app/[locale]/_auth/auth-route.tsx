/**
 * /login, /register, /forgot-password — v3 screens 19, 19b, 19c.
 *
 * The same forms as /account (signed out), each opening on its own tab, as
 * pages rather than a dialog. A signed-in visitor goes straight to /account.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import type { AuthMode } from '@/components/auth'
import { redirect } from '@/i18n/routing'
import { enabledSocialProviders } from '@/lib/auth/server'
import { getUser } from '@/lib/auth/session'

import { toLocale } from '../_seo-hreflang'
import { SignedOutPane } from '../account/signed-out-pane'

import '../account/account.css'

const TITLE: Record<AuthMode, string> = {
  signin: 'auth_tab_in',
  signup: 'auth_tab_up',
  forgot: 'auth4_forgot_t',
}

export async function authMetadata(mode: AuthMode, raw: string): Promise<Metadata> {
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })
  return { title: t(TITLE[mode]), robots: { index: false, follow: true } }
}

export async function AuthRoute({ mode, raw }: { mode: AuthMode; raw: string }) {
  const locale = toLocale(raw)
  setRequestLocale(locale)
  if ((await getUser()) !== null) redirect({ href: '/account', locale })

  return (
    <main className="bt-acct-page">
      <SignedOutPane providers={enabledSocialProviders()} next={null} initialMode={mode} />
    </main>
  )
}
