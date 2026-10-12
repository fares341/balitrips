/**
 * Authentication UI.
 *
 * Everything here is a Client Component or a client-only helper — importing
 * any of it from a Server Component pulls the Better Auth browser client into
 * that page's bundle. Server-side session reads live in `@/lib/auth/session`
 * and share nothing with this folder.
 *
 * `<AuthModal>` is controlled and unmounted by default. It is not wired into
 * the layout on purpose: the account page owns "is this visitor signed in",
 * and a dialog carrying three forms and the auth client has no business in
 * the shell bundle of a marketing page.
 *
 * Typical use:
 *
 * ```tsx
 * // page.tsx (Server Component)
 * import { enabledSocialProviders } from '@/lib/auth/server'
 * <SignedOutPane providers={enabledSocialProviders()} />
 *
 * // signed-out-pane.tsx ('use client')
 * <AuthModal open={open} onClose={close} socialProviders={providers} />
 * ```
 */

export { AuthModal } from './auth-modal'
export type { AuthMode, AuthModalProps } from './auth-modal'

export { ResetPasswordForm } from './reset-password-form'
export type { ResetPasswordFormProps } from './reset-password-form'

export { authClient, authErrorKey } from './client'
export type { AuthError } from './client'

export { FormError, FormNotice, SelectField, TextField } from './fields'
export type { SelectFieldProps, TextFieldProps } from './fields'

export { countryOptions, COUNTRY_CODES } from './countries'
export type { CountryOption } from './countries'

export {
  fieldErrors,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_PHONE_LENGTH,
  MIN_PASSWORD_LENGTH,
} from './schemas'
export type {
  ForgotPasswordValues,
  ResetPasswordValues,
  SignInValues,
  SignUpValues,
} from './schemas'
