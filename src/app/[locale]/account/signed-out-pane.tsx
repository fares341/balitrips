'use client'

/**
 * What `/account` shows when nobody is signed in.
 *
 * `requireUser()` sends every gated route here, so this page is the site's
 * sign-in host and cannot itself demand a session — doing that would redirect
 * `/account` to `/account` forever.
 *
 * The dialog opens by itself only when the visitor was sent here mid-flow
 * (`?next=/checkout`). Arriving at the account page under your own steam and
 * being met by a modal you did not ask for is the sort of thing the handoff
 * did; a visible card with a button is not.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { AuthModal } from '@/components/auth'
import { Button } from '@/components/shared'
import { Icon } from '@/components/ui'
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
}

export function SignedOutPane({ providers, next }: SignedOutPaneProps) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(next !== null)

  return (
    <div className="wrap" style={{ paddingBlock: 40 }}>
      <div
        className="card"
        style={{
          maxWidth: 560,
          marginInline: 'auto',
          padding: 32,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <span
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--ivory-2)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Icon name="user" size={30} color="var(--forest)" />
        </span>

        <h1 style={{ fontSize: 'clamp(24px,4vw,32px)' }}>{t('acct_signin_t')}</h1>
        <p className="lede" style={{ margin: 0, maxWidth: '42ch' }}>
          {t('acct_signin_b')}
        </p>

        <Button variant="orange" onClick={() => setOpen(true)} style={{ marginTop: 6 }}>
          {t('acct_signin_cta')}
        </Button>
      </div>

      <AuthModal
        open={open}
        onClose={() => setOpen(false)}
        callbackPath={next ?? ACCOUNT_HREF}
        socialProviders={providers}
        onAuthenticated={() => {
          // AuthModal has already refreshed the router; this carries the
          // visitor back to whatever they were doing when they were stopped.
          if (next !== null) router.replace(next)
        }}
      />
    </div>
  )
}
