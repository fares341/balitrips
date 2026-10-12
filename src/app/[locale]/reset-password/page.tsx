/**
 * Reset password.
 *
 * THIS PAGE HAS NO EQUIVALENT IN THE HANDOFF. The prototype's forgot-password
 * branch set a boolean and rendered "check your inbox" — there was no mail, no
 * token, and no screen for the link to reach. This is where the link from
 * `sendPasswordResetEmail` actually lands, after Better Auth's
 * `/reset-password/:token` callback has validated the token and redirected
 * here with `?token=` (or `?error=INVALID_TOKEN`).
 *
 * The Server Component reads no `searchParams`, no cookies and no headers, so
 * the shell prerenders for all three locales and the reset token never enters
 * a server render. `<ResetPasswordForm>` reads the query string in the
 * browser, which is why it sits behind a Suspense boundary — `useSearchParams`
 * suspends during prerender.
 *
 * `noindex, nofollow`: this URL is only ever reached from a private email and
 * has nothing to offer a crawler.
 */

import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'

import { ResetPasswordForm } from '@/components/auth'
import { Breadcrumbs } from '@/components/shared'
import { locales, type Locale } from '@/i18n/config'
import { routing } from '@/i18n/routing'

import { pageMetadata } from '../_meta'

const RESET_HREF = '/reset-password'

type PageParams = Promise<{ locale: string }>

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  const t = await getTranslations({ locale })

  return {
    ...pageMetadata({
      locale: locale as Locale,
      path: RESET_HREF,
      title: t('auth_reset_t'),
      description: t('auth_reset_sub'),
    }),
    robots: { index: false, follow: false },
  }
}

export default async function ResetPasswordPage({ params }: { params: PageParams }) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  setRequestLocale(locale)

  const t = await getTranslations({ locale })

  return (
    <main className="wrap" style={{ paddingBlock: '32px 72px' }}>
      <Breadcrumbs
        label={t('c_breadcrumb')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('auth_reset_t') }]}
      />

      <div
        style={{
          maxWidth: 460,
          marginInline: 'auto',
          marginBlockStart: 32,
          background: 'var(--white)',
          border: '1px solid var(--line)',
          borderRadius: 24,
          padding: 28,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <h1 style={{ fontSize: 26, margin: 0 }}>{t('auth_reset_t')}</h1>
        <p className="muted" style={{ margin: '8px 0 24px', fontSize: 14.5 }}>
          {t('auth_reset_sub')}
        </p>

        {/*
          No `socialProviders` on purpose. Reading them means reading env, and
          this page is prerendered — the build container has no OAuth
          credentials, so the list would be baked empty. It costs nothing
          here: the sign-in sheet opened from this screen is for the password
          the visitor has just set, and anyone who wanted Google never needed
          a reset link.
        */}
        <Suspense fallback={<p className="muted">{t('c_loading')}</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  )
}
