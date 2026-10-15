/**
 * Personal information — and, when nobody is signed in, the site's sign-in
 * page.
 *
 * This route deliberately calls `getUser()` rather than `requireUser()`. Every
 * other account route requires a session, and `requireUser()` redirects to
 * `/account` when there is none — so requiring one *here* would redirect this
 * page to itself until the browser gave up. `SIGN_IN_HREF` in
 * `@/lib/auth/session` points at this file for exactly that reason.
 */

import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { db } from '@/db'
import { users } from '@/db/schema'
import { enabledSocialProviders } from '@/lib/auth/server'
import { isPlaceholderEmail } from '@/lib/auth/phone'
import { getUser } from '@/lib/auth/session'
import { BLOCKED_MESSAGE_KEYS, type BlockedReason } from '@/lib/security/require'

import { toLocale } from '../_seo-hreflang'
import { accountMetadata } from './_lib/meta'
import { ProfileForm } from './profile-form'
import { SignedOutPane } from './signed-out-pane'
import { VerifyEmailNotice } from './verify-email-notice'
import { VerifyPhoneNotice } from './verify-phone-notice'

type PageParams = Promise<{ locale: string }>
type PageSearch = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_profile')
}

/**
 * Where to go after signing in.
 *
 * Only ever an internal path. A `?next=` that a link can set is a redirect a
 * phishing page can aim at its own domain, so anything with a scheme or a
 * protocol-relative `//` is discarded rather than sanitised.
 */
function safeNext(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null
  // `/\evil.com` يطبّعه المتصفح إلى `//evil.com`.
  if (!/^\/(?![/\\])/.test(value)) return null
  return value
}

export default async function AccountProfilePage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: PageSearch
}) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const user = await getUser()
  const query = await searchParams

  // تحويل من `requireActiveUser()`: جهاز مُزال، أو حظر جهاز/IP/حساب، أو جلسة أنهتها الإدارة.
  const blocked =
    typeof query.blocked === 'string' && query.blocked in BLOCKED_MESSAGE_KEYS
      ? (query.blocked as BlockedReason)
      : null
  const blockedNotice =
    blocked === null ? null : (
      <div role="alert" className="card" style={{ padding: 14, marginBottom: 18 }}>
        {t(BLOCKED_MESSAGE_KEYS[blocked])}
      </div>
    )

  if (user === null) {
    return (
      <>
        {blockedNotice}
        <SignedOutPane
          providers={enabledSocialProviders()}
          next={safeNext(query.next)}
          autoOpen={query.signin === '1'}
        />
      </>
    )
  }

  const format = await getFormatter({ locale })

  // بعد رابط التأكيد. Better Auth يُلحق `?error=` بالرابط كما هو، فقد يصل
  // الخطأ داخل قيمة `verified` (`1?error=invalid_token`) أو كمعامل مستقل.
  const verifiedParam = typeof query.verified === 'string' ? query.verified : ''
  const badVerifyLink =
    query.error === 'invalid_token' ||
    query.error === 'token_expired' ||
    /error=(invalid_token|token_expired)/.test(verifiedParam)

  // "Member since" is a real fact about the row, not the handoff's
  // `user.since || "Jun 2026"` — which printed June 2026 for every account
  // ever created.
  const rows = await db
    .select({
      createdAt: users.createdAt,
      phone: users.phoneNormalized,
      phoneVerifiedAt: users.phoneVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1)

  const memberSince = rows[0]?.createdAt ?? null
  // حساب الجوال وحده (الوثيقة 3.1): بريده بديل داخلي لا يُعرض ولا يُطلب تأكيده.
  const phoneOnly = isPlaceholderEmail(user.email)
  const label = user.name ?? (phoneOnly ? (user.phone ?? '') : user.email)
  const initial = label.trim().charAt(0).toUpperCase() || 'T'

  return (
    <section aria-labelledby="bt-acct-profile-h">
      {blockedNotice}
      {verifiedParam === '1' && user.emailVerified && (
        <div role="status" className="card" style={{ padding: 14, marginBottom: 18 }}>
          {t('acct_verify_done')}
        </div>
      )}
      {badVerifyLink ? (
        <div role="alert" className="card" style={{ padding: 14, marginBottom: 18 }}>
          {t('acct_verify_bad_link')}
        </div>
      ) : null}
      {!user.emailVerified && !phoneOnly && <VerifyEmailNotice email={user.email} />}
      {rows[0]?.phone && rows[0].phoneVerifiedAt === null ? (
        <VerifyPhoneNotice phone={rows[0].phone} />
      ) : null}
      <div className="bt-acct-sechead">
        <h1 id="bt-acct-profile-h">{t('acct_profile_t')}</h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <span
          className="bt-avatar"
          style={{ width: 72, height: 72, fontSize: 28 }}
          aria-hidden="true"
        >
          {initial}
        </span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>{label}</div>
          {memberSince !== null && (
            <div className="muted" style={{ fontSize: 13.5 }}>
              {t('acct_member')} {format.dateTime(memberSince, { month: 'short', year: 'numeric' })}
            </div>
          )}
        </div>
      </div>

      <ProfileForm
        initial={{
          name: user.name ?? '',
          email: phoneOnly ? '' : user.email,
          phone: user.phone ?? '',
          country: user.country ?? '',
          locale: user.locale,
        }}
        displayLocale={locale}
      />
    </section>
  )
}
