'use client'

/**
 * Sign in / sign up / forgot password.
 *
 * Ported from `AuthModal` in design/handoff/sections-bt/auth.jsx. The layout,
 * the pill tabs, the side panel and the copy are the design's; almost nothing
 * behind them survived, because in the handoff:
 *
 *  - **Nothing was validated.** `submitIn` was `preventDefault()` followed by
 *    an unconditional `onAuthed({ name: form.name || "Traveler", email:
 *    form.email || "you@email.com" })`. An empty form signed you in.
 *  - **`password2` existed in state and had no field.** The confirm-password
 *    box was simply never rendered, so `password2` was dead state.
 *  - **The social buttons had no `onClick`.** Both were decorative.
 *  - **"Forgot password" sent nothing.** It set `sent = true` and rendered
 *    "check your inbox" over an email that was never dispatched — and it said
 *    so unconditionally, which, had it been wired to a real backend that
 *    reported failures, would have told an attacker exactly which addresses
 *    are registered. The neutral copy is now the *only* outcome this branch
 *    can produce; see `submitForgot`.
 *  - **The dialog shell was hand-rolled.** No focus trap, no focus restore,
 *    no portal. That is `<Modal>`'s job now.
 *  - **The side panel was a loremflickr photograph.** Someone else's picture,
 *    of somewhere that may not be Bali, with no licence. Replaced with the
 *    brand gradient the rest of the site already uses.
 *
 * This component is controlled: the caller owns `open`. It is deliberately
 * not mounted in the layout — the account page decides when a visitor needs
 * it, and mounting a dialog with three forms on every route would put the
 * whole auth client in the shell bundle.
 */

import { useMemo, useState, useSyncExternalStore } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Button, Modal } from '@/components/shared'
import { Icon, Logo } from '@/components/ui'
import { localeConfig, locales, type Locale } from '@/i18n/config'
import { getPathname, Link, useRouter } from '@/i18n/routing'
import type { SocialProviderId } from '@/lib/auth/server'

import { authClient, authErrorAction, authErrorKey } from './client'
import { countryOptions } from './countries'
import { prepareDeviceCookie } from './device-fingerprint'
import { FormError, FormNotice, SelectField, TextField } from './fields'
import {
  fieldErrors,
  forgotPasswordSchema,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_PHONE_LENGTH,
  signInSchema,
  signUpSchema,
} from './schemas'

export type AuthMode = 'signin' | 'signup' | 'forgot'

export type AuthModalProps = {
  open: boolean
  onClose: () => void
  /** Which pane to show when the dialog opens. */
  initialMode?: AuthMode
  /**
   * Where the OAuth round trip should land. Locale-agnostic path — the locale
   * prefix is added here. Defaults to the account page.
   */
  callbackPath?: string
  /**
   * Providers with credentials configured on the server. Get this from
   * `enabledSocialProviders()` in `@/lib/auth/server`; a button for an
   * unconfigured provider is a button that leads to a 400.
   */
  socialProviders?: readonly SocialProviderId[]
  /** Called after a successful email sign-in or sign-up. */
  onAuthenticated?: () => void
  /**
   * `page` renders the same forms as a page section (v3 login.html: a photo
   * beside the form) instead of a dialog — the package keeps popups for
   * confirmations only. `open`/`onClose` are then ignored.
   */
  variant?: 'modal' | 'page'
}

const DEFAULT_CALLBACK_PATH = '/account'
/** The photo beside the form on the sign-in page (v3 login.html). */
const AUTH_PHOTO = '/brand/penida-cove.webp'
const RESET_PATH = '/reset-password'

/** Which submit is in flight. `null` means the form is idle. */
type Pending = null | 'email' | SocialProviderId

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  country: '',
  /** اللغة المفضلة (الوثيقة 3.1). فارغ = لغة الصفحة. */
  language: '',
  password: '',
  password2: '',
}

type FormState = typeof EMPTY_FORM

/* --------------------------------------------------------------------------
   Provider marks
   -------------------------------------------------------------------------- */

/**
 * Brand glyphs, inline.
 *
 * Google's mark must keep its own colours to satisfy their branding terms, so
 * it cannot go through `<Icon>`, which paints everything `currentColor`.
 */
function ProviderMark({ provider }: { provider: SocialProviderId }) {
  if (provider === 'google') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.9 2.5 2.8 6.6 2.8 11.7S6.9 21 12 21c5.3 0 8.8-3.7 8.8-9 0-.6-.06-1-.15-1.5z"
        />
      </svg>
    )
  }

  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16.4 12.6c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8s-1.7-.8-2.9-.8c-1.5 0-2.9.9-3.6 2.2-1.6 2.7-.4 6.7 1.1 8.9.7 1.1 1.6 2.3 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.6.7 2.8.7c1.2 0 1.9-1.1 2.6-2.1.8-1.2 1.2-2.4 1.2-2.4s-2.1-.8-2.1-3.2zM14.3 6.3c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 2-.5 2.5-1.2z" />
    </svg>
  )
}

const subscribeNothing = () => () => undefined
const isClient = () => true
const isServer = () => false

function Divider({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        color: 'var(--muted)',
        fontSize: 12.5,
      }}
    >
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      {label}
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  )
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AuthModal({
  open,
  onClose,
  initialMode = 'signin',
  callbackPath = DEFAULT_CALLBACK_PATH,
  socialProviders = [],
  onAuthenticated,
  variant = 'modal',
}: AuthModalProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const router = useRouter()

  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [rememberMe, setRememberMe] = useState(true)
  /** موافقة واتساب (الوثيقة 19.3/20.1) — اختيارية وغير محددة افتراضياً. */
  const [whatsappOptIn, setWhatsappOptIn] = useState(false)
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [forgotSubmitted, setForgotSubmitted] = useState(false)

  /*
   * Reopening the dialog must not show the previous attempt's errors, the
   * previous visitor's email, or a stale "check your inbox".
   *
   * Adjusted during render rather than in an effect: React's documented
   * "adjusting state when a prop changes" pattern. An effect would paint the
   * dialog once with the old contents — including a half-typed email address
   * from whoever used the device last — and only then clear it.
   */
  const [lastOpen, setLastOpen] = useState(open)
  if (lastOpen !== open) {
    setLastOpen(open)
    if (open) {
      setMode(initialMode)
      setForm(EMPTY_FORM)
      setWhatsappOptIn(false)
      setErrors({})
      setFormError(null)
      setPending(null)
      setForgotSubmitted(false)
    }
  }

  /*
   * Country names come from the runtime's CLDR data, which differs between
   * Node and the browser. The page variant is server-rendered, so the list is
   * built only once hydrated (the server and the first client render show
   * the placeholder alone) — otherwise React reports a text mismatch.
   */
  const hydrated = useSyncExternalStore(subscribeNothing, isClient, isServer)
  const countries = useMemo(() => (hydrated ? countryOptions(locale) : []), [hydrated, locale])

  const headingId = 'bt-auth-heading'
  /** The page variant's heading is the page's h1. */
  const AuthHeading = variant === 'page' ? 'h1' : 'h3'
  const busy = pending !== null

  const update = (key: keyof FormState) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    // Clearing on edit rather than on blur: the visitor is already fixing it,
    // and leaving the red border up while they type reads as "still wrong".
    // The language select is `language` in the form but `locale` in the schema.
    const errorKey = key === 'language' ? 'locale' : key
    setErrors((current) => {
      if (current[errorKey] === undefined) return current
      const next = { ...current }
      delete next[errorKey]
      return next
    })
  }

  const switchMode = (next: AuthMode) => {
    setMode(next)
    setErrors({})
    setFormError(null)
    setForgotSubmitted(false)
  }

  /* ---- Submits --------------------------------------------------------- */

  const submitSignIn = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return

    const parsed = signInSchema.safeParse({
      email: form.email,
      password: form.password,
      rememberMe,
    })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      setFormError(null)
      return
    }

    setErrors({})
    setFormError(null)
    setPending('email')

    await prepareDeviceCookie()
    const { error } = await authClient.signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
      rememberMe: parsed.data.rememberMe,
    })

    if (error) {
      setPending(null)
      setFormError(authErrorKey(error))
      return
    }

    // الإدارة والموظفون يدخلون مباشرة على لوحة التحكم. المسار السري لا يصل
    // للمتصفح إلا لجلسة تملك صلاحية الدخول (`/api/admin-link`).
    const adminHref = await fetch('/api/admin-link', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((response) => (response.ok ? response.json() : { href: null }))
      .then((data: { href: string | null }) => data.href)
      .catch(() => null)
    if (adminHref !== null) {
      window.location.assign(adminHref)
      return
    }

    // The session cookie is set; every Server Component that reads it is now
    // stale. Refresh before handing control back, so the page the visitor
    // returns to is already signed in.
    router.refresh()
    setPending(null)
    onAuthenticated?.()
    onClose()
  }

  const submitSignUp = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return

    const parsed = signUpSchema.safeParse({
      name: form.name,
      email: form.email,
      phone: form.phone,
      country: form.country,
      locale: form.language === '' ? undefined : form.language,
      password: form.password,
      password2: form.password2,
    })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      setFormError(null)
      return
    }

    setErrors({})
    setFormError(null)
    setPending('email')

    const { name, email, phone, country, password } = parsed.data
    const preferredLocale = parsed.data.locale ?? locale

    await prepareDeviceCookie()
    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      // `phone`, `country` and `locale` are declared as additional user fields
      // on the server, which is what allows them through; anything not
      // declared there is dropped rather than persisted. They are re-validated
      // and clamped in `databaseHooks.user.create.before`.
      phone,
      country: country === '' ? undefined : country,
      locale: preferredLocale,
      whatsappOptIn,
      marketingConsent,
    })

    if (error) {
      setPending(null)
      setFormError(authErrorKey(error))
      return
    }

    setPending(null)
    onAuthenticated?.()
    onClose()
    // حساب بالجوال وحده: الرقم لم يُثبت بعد. نأخذه مباشرة لصفحة الحساب حيث
    // إشعار التحقق برمز واتساب — رقم غير مؤكَّد لا يستعيد كلمة المرور، وقد
    // يُسحب منه إن أثبت صاحبه الحقيقي ملكيته (انظر verifyPhoneCodeAction).
    if (email.trim() === '') router.push('/account')
    else router.refresh()
  }

  /**
   * Request a reset link.
   *
   * The outcome the visitor sees does NOT depend on whether the address is
   * registered. Better Auth's endpoint is already uniform — it fakes the token
   * generation and the verification lookup for an unknown address so the
   * timing matches — and this handler keeps it that way by rendering the same
   * neutral notice for success and for failure alike. The single exception is
   * a 429, which describes the requester's own rate, not any account.
   */
  const submitForgot = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return

    const parsed = forgotPasswordSchema.safeParse({ email: form.email })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      setFormError(null)
      return
    }

    setErrors({})
    setFormError(null)
    setPending('email')

    const { error } = await authClient.requestPasswordReset({
      email: parsed.data.email,
      // Better Auth validates the token, then redirects here with `?token=`
      // (or `?error=INVALID_TOKEN`). `getPathname` applies the `as-needed`
      // locale prefix, so an Arabic reader lands on the Arabic page.
      redirectTo: getPathname({ href: RESET_PATH, locale }),
    })

    setPending(null)

    if (error?.status === 429) {
      setFormError('auth_err_ratelimit')
      return
    }

    if (error) {
      // Logged, not shown. A visible failure here would be a difference the
      // visitor can observe, and differences are what enumeration exploits.
      console.error('[auth] password reset request failed', error)
    }

    setForgotSubmitted(true)
  }

  const startSocial = async (provider: SocialProviderId) => {
    if (busy) return
    setFormError(null)
    setPending(provider)

    await prepareDeviceCookie()
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: getPathname({ href: callbackPath, locale }),
    })

    // On success the client has already navigated to the provider; this only
    // runs when the request itself failed.
    if (error) {
      setPending(null)
      setFormError(error.status === 429 ? 'auth_err_ratelimit' : 'auth_err_social')
    }
  }

  /* ---- Pieces ---------------------------------------------------------- */

  const socialBlock =
    socialProviders.length === 0 ? null : (
      <>
        <Divider label={t('auth_or')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {socialProviders.map((provider) => (
            <Button
              key={provider}
              type="button"
              variant="ghost"
              block
              style={{ gap: 10 }}
              disabled={busy}
              onClick={() => void startSocial(provider)}
            >
              <ProviderMark provider={provider} />
              {pending === provider
                ? t('auth_working')
                : t(provider === 'google' ? 'auth_google' : 'auth_apple')}
            </Button>
          ))}
        </div>
      </>
    )

  const signInPane = (
    <form onSubmit={submitSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <AuthHeading id={headingId} style={{ fontSize: 26 }}>
          {t('auth_signin_t')}
        </AuthHeading>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14.5 }}>
          {t('auth_signin_sub')}
        </p>
      </div>

      <FormError messageKey={formError} />
      {/* الوثيقة 14.2: بلغ حد الأجهزة — رابط الترقية لباقة عائلية. */}
      {formError !== null && authErrorAction(formError) !== null && (
        <Link
          href={authErrorAction(formError)?.href ?? '/plans'}
          onClick={onClose}
          style={{ fontWeight: 700, marginTop: -8 }}
        >
          {t(authErrorAction(formError)?.labelKey ?? 'auth_err_device_limit_cta')} →
        </Link>
      )}

      {/* الوثيقة 3.2: الدخول بالبريد أو رقم الجوال. */}
      <TextField
        label={t('auth_identifier')}
        type="text"
        inputMode="email"
        value={form.email}
        onChange={update('email')}
        placeholder={t('auth_identifier_ph')}
        autoComplete="username"
        maxLength={MAX_EMAIL_LENGTH}
        error={errors.email}
        disabled={busy}
        autoFocus
      />
      <TextField
        label={t('auth_password')}
        type="password"
        value={form.password}
        onChange={update('password')}
        placeholder="••••••••"
        autoComplete="current-password"
        maxLength={MAX_PASSWORD_LENGTH}
        error={errors.password}
        disabled={busy}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          fontSize: 13.5,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            disabled={busy}
            style={{ width: 16, height: 16, accentColor: 'var(--orange)' }}
          />
          {t('auth_remember')}
        </label>
        <Link
          // H18: a real link (works without JS and shows in the page);
          // with JS it switches the form in place.
          href="/forgot-password"
          onClick={(event) => {
            event.preventDefault()
            if (!busy) switchMode('forgot')
          }}
          aria-disabled={busy || undefined}
          style={{
            background: 'none',
            border: 0,
            textDecoration: 'none',
            color: 'var(--orange-ink)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 13.5,
            padding: 0,
          }}
        >
          {t('auth_forgot_link')}
        </Link>
      </div>

      <Button type="submit" variant="orange" block disabled={busy}>
        {pending === 'email' ? t('auth_working') : t('auth_in_btn')}
      </Button>

      {socialBlock}

      <p className="center muted" style={{ fontSize: 13.5, margin: 0 }}>
        {t('auth_no_acct')}{' '}
        <Link
          // H18: a real link (works without JS and shows in the page);
          // with JS it switches the form in place.
          href="/register"
          onClick={(event) => {
            event.preventDefault()
            if (!busy) switchMode('signup')
          }}
          aria-disabled={busy || undefined}
          style={{
            background: 'none',
            border: 0,
            textDecoration: 'none',
            color: 'var(--orange-ink)',
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
            fontSize: 13.5,
          }}
        >
          {t('auth_tab_up')}
        </Link>
      </p>
    </form>
  )

  const signUpPane = (
    <form onSubmit={submitSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <AuthHeading id={headingId} style={{ fontSize: 26 }}>
          {t('auth_signup_t')}
        </AuthHeading>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14.5 }}>
          {t('auth_signup_sub')}
        </p>
      </div>

      <FormError messageKey={formError} />

      <TextField
        label={t('auth_name')}
        value={form.name}
        onChange={update('name')}
        autoComplete="name"
        maxLength={MAX_NAME_LENGTH}
        error={errors.name}
        disabled={busy}
        autoFocus
      />
      <TextField
        label={t('auth_email_optional')}
        type="email"
        inputMode="email"
        value={form.email}
        onChange={update('email')}
        placeholder="you@email.com"
        autoComplete="email"
        maxLength={MAX_EMAIL_LENGTH}
        error={errors.email}
        disabled={busy}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TextField
          label={t('auth_phone')}
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={update('phone')}
          placeholder="+62 ···"
          autoComplete="tel"
          maxLength={MAX_PHONE_LENGTH}
          error={errors.phone}
          disabled={busy}
        />
        {/*
          A select, not the handoff's free-text box whose placeholder was
          "UAE" — `users.country` is varchar(2), so three characters was a
          guaranteed 500. Labels come from the browser's own CLDR data.
        */}
        <SelectField
          label={t('auth_country')}
          optionalLabel={t('co_optional')}
          value={form.country}
          onChange={update('country')}
          placeholder={t('auth_country_ph')}
          options={countries.map((option) => ({ value: option.code, label: option.label }))}
          autoComplete="country"
          error={errors.country}
          disabled={busy}
        />
      </div>

      <SelectField
        label={t('auth_language')}
        optionalLabel={t('co_optional')}
        value={form.language}
        onChange={update('language')}
        placeholder={t('auth_language_ph')}
        options={locales.map((code) => ({ value: code, label: localeConfig[code].label }))}
        error={errors.locale}
        disabled={busy}
      />

      <TextField
        label={t('auth_password')}
        type="password"
        value={form.password}
        onChange={update('password')}
        placeholder="••••••••"
        autoComplete="new-password"
        maxLength={MAX_PASSWORD_LENGTH}
        error={errors.password}
        hint={t('auth_err_pw_short')}
        disabled={busy}
      />
      {/* The field the handoff kept state for and never rendered. */}
      <TextField
        label={t('auth_password2')}
        type="password"
        value={form.password2}
        onChange={update('password2')}
        placeholder="••••••••"
        autoComplete="new-password"
        maxLength={MAX_PASSWORD_LENGTH}
        error={errors.password2}
        disabled={busy}
      />

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 13.5,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={whatsappOptIn}
          onChange={(event) => setWhatsappOptIn(event.target.checked)}
          disabled={busy}
          style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--orange)' }}
        />
        {t('auth_whatsapp_optin')}
      </label>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          fontSize: 13.5,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={marketingConsent}
          onChange={(event) => setMarketingConsent(event.target.checked)}
          disabled={busy}
          style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--orange)' }}
        />
        {t('auth_marketing_optin')}
      </label>

      <Button type="submit" variant="orange" block disabled={busy}>
        {pending === 'email' ? t('auth_working') : t('auth_up_btn')}
      </Button>

      <p className="center muted" style={{ fontSize: 12, margin: 0 }}>
        {t('auth_terms')}
      </p>

      {socialBlock}

      <p className="center muted" style={{ fontSize: 13.5, margin: 0 }}>
        {t('auth_has_acct')}{' '}
        <button
          type="button"
          onClick={() => switchMode('signin')}
          disabled={busy}
          style={{
            background: 'none',
            border: 0,
            color: 'var(--orange-ink)',
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
            fontSize: 13.5,
          }}
        >
          {t('auth_tab_in')}
        </button>
      </p>
    </form>
  )

  const forgotPane = (
    <form onSubmit={submitForgot} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <AuthHeading id={headingId} style={{ fontSize: 26 }}>
          {t('auth_forgot_t')}
        </AuthHeading>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14.5 }}>
          {t('auth_forgot_sub')}
        </p>
      </div>

      <FormError messageKey={formError} />

      {forgotSubmitted ? (
        <FormNotice>{t('auth_sent')}</FormNotice>
      ) : (
        <>
          <TextField
            label={t('auth_identifier')}
            type="text"
            inputMode="email"
            value={form.email}
            onChange={update('email')}
            placeholder={t('auth_identifier_ph')}
            autoComplete="username"
            maxLength={MAX_EMAIL_LENGTH}
            error={errors.email}
            disabled={busy}
            autoFocus
          />
          <Button type="submit" variant="orange" block disabled={busy}>
            {pending === 'email' ? t('co_sending') : t('auth_send_btn')}
          </Button>
        </>
      )}

      <button
        type="button"
        onClick={() => switchMode('signin')}
        disabled={busy}
        style={{
          background: 'none',
          border: 0,
          color: 'var(--orange-ink)',
          fontWeight: 700,
          cursor: 'pointer',
          fontSize: 14,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'start',
        }}
      >
        {/*
          "Back" points at the start of the line — left under LTR, right under
          RTL. The `arrow` glyph points right, so the wrapper mirrors it
          unconditionally and the inner `.flip` (which base.css applies only
          under `dir="rtl"`) mirrors it back. Net result: correct in both.
        */}
        <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}>
          <Icon name="arrow" size={16} className="flip" />
        </span>
        {t('auth_back')}
      </button>
    </form>
  )

  if (variant === 'page') {
    return (
      <section className="auth-page" aria-labelledby={headingId}>
        <div className="auth-media" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand photo */}
          <img src={AUTH_PHOTO} alt="" />
          <span className="auth-cap">{t('auth4_photo_cap')}</span>
        </div>
        <div className="auth-form">
          <div className="auth-form-in">
            <div className="bt-modal-body">
              {mode !== 'forgot' && (
                <div className="bt-auth-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'signin'}
                    className={mode === 'signin' ? 'on' : ''}
                    onClick={() => switchMode('signin')}
                    disabled={busy}
                  >
                    {t('auth_tab_in')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'signup'}
                    className={mode === 'signup' ? 'on' : ''}
                    onClick={() => switchMode('signup')}
                    disabled={busy}
                  >
                    {t('auth_tab_up')}
                  </button>
                </div>
              )}

              {mode === 'signin' && signInPane}
              {mode === 'signup' && signUpPane}
              {mode === 'forgot' && forgotPane}
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={headingId}
      closeLabel={t('acct_close')}
      scrimClassName="bt-modal-scrim"
      panelClassName="bt-modal"
    >
      {/* Desktop-only side panel. See the header note: the handoff's
          loremflickr photograph is replaced by the brand gradient. */}
      <div className="bt-modal-aside" style={{ background: 'var(--forest)' }} aria-hidden="true">
        <div
          className="bt-modal-aside-veil"
          style={{
            background:
              'linear-gradient(160deg, rgba(27,63,34,0.55), rgba(27,63,34,0.95) 60%), radial-gradient(120% 90% at 80% 0%, rgba(255,144,0,0.45), transparent 65%)',
          }}
        />
        <div className="bt-modal-aside-inner">
          <div
            style={{
              background: 'rgba(255,251,248,0.92)',
              display: 'inline-block',
              padding: '8px 12px',
              borderRadius: 12,
              alignSelf: 'start',
            }}
          >
            <Logo height={26} />
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, color: '#fff' }}>
              {t('foot_tagline')}
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,251,248,0.85)', marginTop: 8 }}>
              {t('hero_kicker')}
            </div>
          </div>
        </div>
      </div>

      <div className="bt-modal-body">
        {mode !== 'forgot' && (
          <div className="bt-auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              className={mode === 'signin' ? 'on' : ''}
              onClick={() => switchMode('signin')}
              disabled={busy}
            >
              {t('auth_tab_in')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={mode === 'signup' ? 'on' : ''}
              onClick={() => switchMode('signup')}
              disabled={busy}
            >
              {t('auth_tab_up')}
            </button>
          </div>
        )}

        {mode === 'signin' && signInPane}
        {mode === 'signup' && signUpPane}
        {mode === 'forgot' && forgotPane}
      </div>
    </Modal>
  )
}
