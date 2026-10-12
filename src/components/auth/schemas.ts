/**
 * Validation for every auth form.
 *
 * The handoff validated nothing. `submitIn` and `submitUp` were
 * `e.preventDefault()` followed by an unconditional success, with `||
 * "Traveler"` and `|| "you@email.com"` papering over empty fields — so an
 * empty form signed you in as somebody called Traveler. It also declared
 * `password2` in state and never rendered a field for it, which is how a
 * confirm-password box goes missing.
 *
 * Every message here is a KEY into messages/{en,ar,id}.json, not a sentence.
 * zod has no idea which language the visitor is reading; the form resolves the
 * key through `useTranslations()` at render time.
 *
 * These rules are UX, not security. The same limits are re-declared on the
 * Better Auth instance in `@/lib/auth/server`, which is the actual boundary —
 * a client-side schema stops typos, not attackers.
 */

import { z } from 'zod'

import { locales } from '@/i18n/config'
import { looksLikeEmail, normalizePhone } from '@/lib/auth/phone'

/** Mirrors `emailAndPassword.minPasswordLength` in @/lib/auth/server. */
export const MIN_PASSWORD_LENGTH = 8
/** Mirrors `emailAndPassword.maxPasswordLength`. */
export const MAX_PASSWORD_LENGTH = 128
/** `users.name` is varchar(128). */
export const MAX_NAME_LENGTH = 128
/** `users.email` is varchar(256). */
export const MAX_EMAIL_LENGTH = 256
/** `users.phone` is varchar(32). */
export const MAX_PHONE_LENGTH = 32

/**
 * Required-then-shape ordering.
 *
 * `z.email()` alone reports "enter a valid email" for an empty box, which
 * reads as a correction of something the visitor has not typed yet. The
 * length check runs before the format check so a 300-character paste is
 * reported as too long rather than as malformed.
 */
const emailField = z
  .string()
  .trim()
  .min(1, 'co_err_required')
  .max(MAX_EMAIL_LENGTH, 'co_err_long')
  .pipe(z.email('co_err_email'))

const passwordField = z
  .string()
  .min(MIN_PASSWORD_LENGTH, 'auth_err_pw_short')
  .max(MAX_PASSWORD_LENGTH, 'co_err_long')

/**
 * الجوال مطلوب عند التسجيل (الوثيقة 3.1) وهو مفتاح دخول (3.2)، لذا يجب أن يكون
 * دولياً (+ أو 00 ثم رمز الدولة) كي يُوحَّد ويُطابق عند الدخول. الطول قبل الصيغة
 * كي يُبلَّغ اللصق الطويل كـ "طويل" لا "غير صالح".
 */
const phoneField = z
  .string()
  .trim()
  .min(1, 'co_err_required')
  .max(MAX_PHONE_LENGTH, 'co_err_long')
  .refine((value) => normalizePhone(value) !== null, 'auth_err_phone_intl')

/** خانة الدخول: بريد أو جوال دولي (الوثيقة 3.2). */
const identifierField = z
  .string()
  .trim()
  .min(1, 'co_err_required')
  .max(MAX_EMAIL_LENGTH, 'co_err_long')
  .refine(
    (value) =>
      looksLikeEmail(value) ? z.email().safeParse(value).success : normalizePhone(value) !== null,
    'auth_err_identifier',
  )

/**
 * ISO 3166-1 alpha-2, because `users.country` is varchar(2).
 *
 * The control is a `<select>` built from `./countries`, so this only fires on
 * a tampered payload — but the column is two characters wide and an oversized
 * value would surface as a 500 rather than a validation message.
 */
const countryField = z
  .string()
  .refine((value) => value === '' || /^[A-Z]{2}$/.test(value), 'auth_country_ph')

export const signInSchema = z.object({
  /** بريد أو رقم جوال. الاسم `email` لأن نقطة Better Auth تستقبله بهذا الاسم. */
  email: identifierField,
  // NOT `passwordField`: an existing account may predate the current minimum,
  // and telling the visitor their own password is "too short" at the sign-in
  // box is both wrong and a hint about what is stored.
  password: z.string().min(1, 'co_err_required'),
  rememberMe: z.boolean(),
})

export type SignInValues = z.infer<typeof signInSchema>

export const signUpSchema = z
  .object({
    name: z.string().trim().min(1, 'co_err_required').max(MAX_NAME_LENGTH, 'co_err_long'),
    email: emailField,
    phone: phoneField,
    country: countryField,
    /** الوثيقة 3.1: اللغة المفضلة (اختياري؛ الافتراضي لغة الصفحة). */
    locale: z.enum(locales).optional(),
    password: passwordField,
    password2: z.string(),
  })
  // Reported against `password2`, so the message lands under the box the
  // visitor has to fix rather than under the one they typed first.
  .refine((values) => values.password === values.password2, {
    message: 'auth_err_pw_match',
    path: ['password2'],
  })

export type SignUpValues = z.infer<typeof signUpSchema>

export const forgotPasswordSchema = z.object({
  email: emailField,
})

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    password2: z.string(),
  })
  .refine((values) => values.password === values.password2, {
    message: 'auth_err_pw_match',
    path: ['password2'],
  })

export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

/**
 * Flatten zod issues into `{ fieldName: messageKey }`.
 *
 * First issue per field wins: showing "required" and "too short" under one box
 * at the same time is noise.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const field = issue.path[0]
    if (typeof field !== 'string' || out[field] !== undefined) continue
    out[field] = issue.message
  }
  return out
}
