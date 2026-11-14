/**
 * /login, /register, /forgot-password — v3 screens 19, 19b, 19c.
 *
 * The same forms as /account (signed out), each opening on its own tab, as
 * pages rather than a dialog. A signed-in visitor goes straight to /account.
 *
 * `?next=/checkout` (checkout's "sign in" and "create an account") brings the
 * traveller back to where they were once signed in or signed up — validated
 * as an internal path, like /account's own `?next=`.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import type { AuthMode } from '@/components/auth'
import { redirect } from '@/i18n/routing'
import { enabledSocialProviders } from '@/lib/auth/server'
import { getUser } from '@/lib/auth/session'

import { toLocale } from '../_seo-hreflang'
import { reasonFor, safeNext } from '../account/sign-in-reason'
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

export type AuthSearch = Promise<Record<string, string | string[] | undefined>>

export async function AuthRoute({
  mode,
  raw,
  searchParams,
}: {
  mode: AuthMode
  raw: string
  searchParams?: AuthSearch
}) {
  const locale = toLocale(raw)
  setRequestLocale(locale)
  const next = safeNext((await searchParams)?.next)
  if ((await getUser()) !== null) redirect({ href: next ?? '/account', locale })

  return (
    <main className="bt-acct-page">
      <SignedOutPane
        providers={enabledSocialProviders()}
        next={next}
        initialMode={mode}
        // Sent here from somewhere (checkout): say why. Plain /login: no line.
        reason={next === null ? undefined : reasonFor(next)}
      />
    </main>
  )
}
