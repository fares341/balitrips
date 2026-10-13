'use client'

/**
 * Set a new password from an emailed link.
 *
 * THIS SCREEN DOES NOT EXIST IN THE HANDOFF. Its "forgot password" branch set
 * `sent = true`, rendered "check your inbox", and stopped — there was no mail,
 * no token, and nowhere for a link to land. This is the other half.
 *
 * The token is read on the client, from the query string, for two reasons.
 * It keeps the page itself statically renderable (no `searchParams` in the
 * Server Component, so nothing forces it to origin), and it keeps a
 * single-use credential out of the server render path — and therefore out of
 * anything that logs render arguments.
 *
 * Better Auth's `/reset-password/:token` callback validates the token before
 * redirecting here, so arriving without one, or with `?error=INVALID_TOKEN`,
 * both mean the same thing: the link is spent. The two are shown identically.
 */

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/shared'
import { Link } from '@/i18n/routing'

import { authClient, authErrorKey } from './client'
import { AuthModal } from './auth-modal'
import { FormError, FormNotice, TextField } from './fields'
import { fieldErrors, MAX_PASSWORD_LENGTH, resetPasswordSchema } from './schemas'
import type { SocialProviderId } from '@/lib/auth/server'

const ACCOUNT_HREF = '/account'

export type ResetPasswordFormProps = {
  /** Passed through to the sign-in dialog opened after a successful reset. */
  socialProviders?: readonly SocialProviderId[]
}

export function ResetPasswordForm({ socialProviders = [] }: ResetPasswordFormProps) {
  const t = useTranslations()
  const searchParams = useSearchParams()

  const token = searchParams.get('token')
  const callbackError = searchParams.get('error')

  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)

  const linkIsDead = token === null || token === '' || callbackError !== null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending || token === null) return

    const parsed = resetPasswordSchema.safeParse({ password, password2 })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      setFormError(null)
      return
    }

    setErrors({})
    setFormError(null)
    setPending(true)

    const { error } = await authClient.resetPassword({
      newPassword: parsed.data.password,
      token,
    })

    setPending(false)

    if (error) {
      setFormError(authErrorKey(error))
      return
    }

    // Deliberately no auto-sign-in. `revokeSessionsOnPasswordReset` has just
    // ended every session for this account, which is the point of a reset;
    // silently minting a fresh one here would undo half of it on the very
    // device that may have been the problem.
    setPassword('')
    setPassword2('')
    setDone(true)
  }

  const signInDialog = (
    <AuthModal
      open={signInOpen}
      onClose={() => setSignInOpen(false)}
      initialMode={done ? 'signin' : 'forgot'}
      socialProviders={socialProviders}
      callbackPath={ACCOUNT_HREF}
    />
  )

  if (linkIsDead) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <FormError messageKey="auth_reset_bad" />
        <Button type="button" variant="orange" onClick={() => setSignInOpen(true)}>
          {t('auth_send_btn')}
        </Button>
        <Link href={ACCOUNT_HREF} style={{ color: 'var(--orange-ink)', fontWeight: 700 }}>
          {t('auth_back')}
        </Link>
        {signInDialog}
      </div>
    )
  }

  if (done) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <FormNotice>{t('auth_reset_done')}</FormNotice>
        <Button type="button" variant="orange" onClick={() => setSignInOpen(true)}>
          {t('auth_in_btn')}
        </Button>
        {signInDialog}
      </div>
    )
  }

  return (
    <>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormError messageKey={formError} />

        <TextField
          label={t('auth_reset_new')}
          type="password"
          value={password}
          onChange={(value) => {
            setPassword(value)
            setErrors(({ password: _password, ...rest }) => rest)
          }}
          placeholder="••••••••"
          autoComplete="new-password"
          maxLength={MAX_PASSWORD_LENGTH}
          hint={t('auth_err_pw_short')}
          error={errors.password}
          disabled={pending}
          autoFocus
        />
        <TextField
          label={t('auth_password2')}
          type="password"
          value={password2}
          onChange={(value) => {
            setPassword2(value)
            setErrors(({ password2: _password2, ...rest }) => rest)
          }}
          placeholder="••••••••"
          autoComplete="new-password"
          maxLength={MAX_PASSWORD_LENGTH}
          error={errors.password2}
          disabled={pending}
        />

        <Button type="submit" variant="orange" block disabled={pending}>
          {pending ? t('auth_working') : t('auth_reset_btn')}
        </Button>

        <Link
          href={ACCOUNT_HREF}
          style={{ color: 'var(--orange-ink)', fontWeight: 700, fontSize: 14 }}
        >
          {t('auth_back')}
        </Link>
      </form>
      {signInDialog}
    </>
  )
}
