/**
 * Transactional mail for the auth flows.
 *
 * The handoff had no email at all — its "forgot password" screen set a boolean
 * and rendered "check your inbox" over a message that was never sent. This is
 * the real sender behind `sendResetPassword` in `./server`.
 *
 * It is now a thin adapter over `@/lib/email`: transport selection, HTML
 * escaping, the RTL-safe layout and the localized copy all live there and are
 * shared with the order and refund mail the worker sends. This file used to
 * own its own copy of all four, which is exactly the duplication that lets an
 * Arabic layout fix land in one template and not the others.
 *
 * Two behaviours are preserved deliberately:
 *
 *  1. **Copy is localized from the recipient's stored `users.locale`**, not
 *     from the locale of whoever triggered the send. A reset requested from a
 *     shared device must arrive in the account owner's language.
 *
 *  2. **Failure resolves, it does not throw.** Callers are auth endpoints
 *     whose response must be identical whether or not the address exists; a
 *     500 here would be an account-enumeration oracle. Failures are logged
 *     server-side, which is where an operator can act on them.
 *
 * Reset mail is also sent INLINE rather than queued, and that is not an
 * oversight. Queuing it would write a live, single-use password-reset token
 * into `pgboss.job.data`, where it would sit for the queue's retention period
 * in plain text and in every database backup taken during that window.
 */

import {
  sendEmail as sendViaTransport,
  renderPasswordResetEmail,
  renderWelcomeEmail,
  toMailLocale,
} from '@/lib/email'
import type { EmailMessage } from '@/lib/email'
import type { Locale } from '@/i18n/config'

export type { Locale }
export { toMailLocale }

/** Retained name for the message shape; `EmailMessage` is the same type. */
export type OutboundEmail = EmailMessage

/**
 * Send one message, swallowing failure.
 *
 * See note 2 in the header. Anything that wants to know whether delivery
 * succeeded should call `sendEmail` from `@/lib/email` and read the result.
 */
export async function sendEmail(message: OutboundEmail): Promise<void> {
  await sendViaTransport(message)
}

/**
 * Password-reset mail.
 *
 * `url` is the Better Auth callback, which validates the token and then
 * redirects to the locale-correct `/reset-password` page.
 */
export async function sendPasswordResetEmail(input: {
  to: string
  name: string | null
  url: string
  locale: Locale
}): Promise<void> {
  const rendered = renderPasswordResetEmail({
    locale: input.locale,
    name: input.name,
    url: input.url,
  })

  await sendViaTransport({ to: input.to, ...rendered })
}

/**
 * تأكيد البريد (رسالة الترحيب مع زر "أكّد بريدي").
 *
 * التأكيد لا يمنع الدخول (`requireEmailVerification: false`) لكنه يجعل
 * `email_verified_at` حقيقياً: الباقة العائلية تضيف الحساب المؤكَّد مباشرة.
 * تُرسل مباشرة لا عبر الطابور — الرابط يحمل رمزاً صالحاً (انظر الملاحظة أعلاه).
 */
export async function sendVerificationEmail(input: {
  to: string
  name: string | null
  url: string
  siteUrl: string
  locale: Locale
}): Promise<void> {
  const rendered = renderWelcomeEmail({
    locale: input.locale,
    name: input.name,
    verifyUrl: input.url,
    siteUrl: input.siteUrl,
  })
  await sendViaTransport({ to: input.to, ...rendered })
}
