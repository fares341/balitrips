'use client'

/**
 * Browser-side Better Auth client.
 *
 * Talks to `/api/auth/*` on the same origin, so it needs no configuration —
 * the base URL is inferred from `window.location` and cookies ride along
 * automatically.
 *
 * The `'use client'` directive is deliberate on a module that exports no
 * component: it makes importing this from a Server Component a build error
 * rather than a runtime one. Session reads on the server go through
 * `@/lib/auth/session`.
 */

import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'

import type { Auth } from '@/lib/auth/server'

/**
 * `inferAdditionalFields` is a types-only plugin: it teaches the client about
 * the extra user columns declared on the server (`role`, `locale`, `phone`,
 * `country`) so `signUp.email({ …, phone })` typechecks and `session.user.role`
 * is not `any`. `Auth` is imported with `import type`, so the server module —
 * and with it the database pool — is erased from this bundle.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
})

/* --------------------------------------------------------------------------
   Error mapping
   -------------------------------------------------------------------------- */

/** The error shape every `authClient` call returns on failure. */
export type AuthError = {
  code?: string | undefined
  message?: string | undefined
  status?: number | undefined
} | null

/**
 * Translate a Better Auth failure into a key from messages/*.json.
 *
 * Better Auth's own `message` strings are English and unlocalized, so they
 * are never rendered — the code is mapped to a catalogue key instead, and
 * anything unrecognised falls back to the generic `c_error`.
 *
 * Note the deliberate collapse of `USER_NOT_FOUND` and
 * `CREDENTIAL_ACCOUNT_NOT_FOUND` into the same "wrong email or password"
 * message as `INVALID_PASSWORD`. Distinguishing them would turn the sign-in
 * form into an account-existence oracle: an attacker could enumerate which of
 * a leaked address list are customers here, which is exactly the leak the
 * forgot-password flow is careful to avoid.
 */
export function authErrorKey(error: AuthError): string {
  // Throttled. Reported honestly — this is a fact about the caller's own
  // request rate, not about any account.
  if (error?.status === 429) return 'auth_err_ratelimit'

  switch (error?.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'INVALID_PASSWORD':
    case 'INVALID_EMAIL':
    case 'USER_NOT_FOUND':
    case 'CREDENTIAL_ACCOUNT_NOT_FOUND':
      return 'auth_err_credentials'

    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'auth_err_exists'

    // الجوال (الوثيقة 3.1). "مستخدم" لا يكشف شيئاً لا يكشفه "البريد مستخدم" أصلاً.
    case 'PHONE_TAKEN':
      return 'auth_err_phone_taken'
    case 'PHONE_REQUIRED':
      return 'auth_err_phone_intl'

    case 'PASSWORD_TOO_SHORT':
      return 'auth_err_pw_short'

    case 'PASSWORD_TOO_LONG':
      return 'co_err_long'

    // منع الدخول الأمني (src/lib/auth/server.ts). رسالة الحظر عامة عمداً:
    // لا نؤكد للمهاجم هل الحظر على الحساب أو الجهاز أو الشبكة.
    case 'DEVICE_LIMIT_REACHED':
      return 'auth_err_device_limit'
    case 'DEVICE_PENDING_APPROVAL':
      return 'auth_err_device_pending'
    case 'ACCOUNT_BANNED':
      return 'auth_err_banned'

    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return 'auth_reset_bad'

    default:
      return 'c_error'
  }
}
