'use client'

/**
 * What `/account` shows when nobody is signed in.
 *
 * `requireUser()` sends every gated route here, so this page is the site's
 * sign-in host and cannot itself demand a session — doing that would redirect
 * `/account` to `/account` forever.
 *
 * v3 package (screens 19/19b/19c): the sign-in form IS the page — a photo
 * beside the form — for every arrival (`/account`, `?next=/checkout`,
 * `?signin=1` from the Studio link, /login, /register, /forgot-password).
 */

import { useTranslations } from 'next-intl'

import { AuthModal, type AuthMode } from '@/components/auth'
import { useRouter } from '@/i18n/routing'
import type { SocialProviderId } from '@/lib/auth/server'

const ACCOUNT_HREF = '/account'

export type SignedOutPaneProps = {
  /** From `enabledSocialProviders()`. A button for an unconfigured provider is a 400. */
  providers: readonly SocialProviderId[]
  /**
   * Where to land after signing in. Already validated server-side as an
   * internal path — never pass a raw query parameter here.
   */
  next: string | null
  /**
   * Open the dialog straight away (`?signin=1`). The Studio sends staff here
   * when they open its link without a session, so they land on the form
   * rather than on a card with one more button to find.
   */
  autoOpen?: boolean
  /** Which form to show: sign in, create an account, or reset the password. */
  initialMode?: AuthMode
  /**
   * Why the visitor is being asked to sign in, shown as one line above the
   * form. Omit on /login itself, where the visitor chose to sign in.
   */
  reason?: SignInReason
}

export type SignInReason = 'favorites' | 'account' | 'trip'

/** The reason implied by where the visitor was going (an internal path). */
export function reasonFor(next: string | null): SignInReason {
  if (next === null) return 'account'
  if (next.startsWith('/account/favorites')) return 'favorites'
  if (/^\/(?:my-trip|trip|cart|checkout|account\/trip)(?:[/?#]|$)/.test(next)) return 'trip'
  return 'account'
}

export function SignedOutPane({
  providers,
  next,
  autoOpen: _autoOpen = false,
  initialMode = 'signin',
  reason,
}: SignedOutPaneProps) {
  const router = useRouter()
  const t = useTranslations()

  // The sign-in form is the page itself (v3 login.html), not a dialog over a
  // card: popups are for confirmations only. `?signin=1` and `?next=` land
  // on the same form.
  return (
    <>
      {reason !== undefined && (
        <p className="bt-auth-why" role="note">
          {t(`auth5_why_${reason}`)}
        </p>
      )}
      <AuthModal
        variant="page"
        open
        onClose={() => undefined}
        initialMode={initialMode}
        callbackPath={next ?? ACCOUNT_HREF}
        socialProviders={providers}
        onAuthenticated={() => {
          // AuthModal has already refreshed the router; this carries the
          // visitor back to whatever they were doing when they were stopped.
          if (next !== null) router.replace(next)
        }}
      />
    </>
  )
}
