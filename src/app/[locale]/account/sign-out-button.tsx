'use client'

/**
 * Sign out.
 *
 * The handoff's `onSignOut` cleared a `localStorage` key, which is not a
 * sign-out: the session lived in the browser, so "signing out" on a shared
 * laptop left every server-side trace of the session intact. This revokes the
 * session row through Better Auth and then refreshes, so every Server
 * Component above re-renders signed out.
 */

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { authClient } from '@/components/auth'
import { Icon } from '@/components/ui'
import { HOME_HREF } from '@/components/layout/routes'
import { useRouter } from '@/i18n/routing'

export type SignOutButtonProps = {
  className?: string
  /** Rendered before the label. Defaults to the design's flipped arrow. */
  icon?: boolean
}

export function SignOutButton({ className = 'bt-acct-signout', icon = true }: SignOutButtonProps) {
  const t = useTranslations()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  const signOut = async () => {
    if (busy) return
    setBusy(true)

    try {
      await authClient.signOut()
    } catch (error) {
      // The cookie may already be gone (expired session, second tab). Falling
      // through to the redirect is right either way: the destination is a
      // public page, and the next server render is the authority.
      console.error('[account] sign out failed', error)
    }

    startTransition(() => {
      // `replace`, not `push`: Back must not return to a signed-in account
      // screen that no longer has a session behind it.
      router.replace(HOME_HREF)
      router.refresh()
    })
  }

  return (
    <button type="button" className={className} onClick={signOut} disabled={busy || pending}>
      {icon && <Icon name="arrow" size={17} color="var(--orange-deep)" className="flip" />}
      {busy || pending ? t('auth_working') : t('acct_signout')}
    </button>
  )
}
