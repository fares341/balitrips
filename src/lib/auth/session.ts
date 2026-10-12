/**
 * Session access for Server Components, Server Actions and route handlers.
 *
 * Everything that needs to know who is signed in goes through here, so the
 * three rules that matter are enforced in one place:
 *
 *  1. **`role` is read from the session, never from the client.** The
 *     prototype kept the whole user in `localStorage`, which means the role
 *     was a string the visitor could edit.
 *  2. **A soft-deleted user is signed out.** `users.deleted_at` is this
 *     project's invention; Better Auth knows nothing about it and would keep
 *     honouring the session row of an account that has been removed.
 *  3. **An unrecognised role is not trusted.** `users.role` is a `varchar`,
 *     so a bad migration or a manual `UPDATE` can put anything in it. A value
 *     outside the enum degrades to `customer`, which grants nothing — the
 *     safe direction to fail.
 *
 * `getSession()` is wrapped in React's `cache`, so a page that calls it in
 * the layout, in a section and in a server action pays for at most one
 * lookup per render. That lookup is usually free anyway: the cookie cache
 * configured in ./server answers it without touching Postgres.
 *
 * Calling any of these reads `headers()` and therefore opts the caller out of
 * static rendering. That is correct for gated surfaces and wrong for content
 * pages — do not reach for `getSession()` in a page that should be
 * prerendered.
 */

import { cache } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getLocale } from 'next-intl/server'

import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { redirect } from '@/i18n/routing'
import { AuthorizationError, can, isRole, type Capability, type Role } from '@/lib/auth/roles'

import { isUserBanned } from '@/lib/security/bans'

import { auth } from './server'

/** Where an unauthenticated visitor is sent. The account page hosts sign-in. */
const SIGN_IN_HREF = '/account'

export type SessionUser = {
  id: string
  email: string
  /** Nullable in the database; social sign-in may not supply one. */
  name: string | null
  image: string | null
  role: Role
  locale: Locale
  phone: string | null
  country: string | null
  emailVerified: boolean
}

export type AuthSession = {
  user: SessionUser
  /** Session id, for revocation UIs. */
  sessionId: string
  expiresAt: Date
}

/* --------------------------------------------------------------------------
   Normalization
   -------------------------------------------------------------------------- */

function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * A date that may have been round-tripped through the session cookie cache.
 *
 * The cache is JSON, so a `Date` written on one request comes back as an ISO
 * string on the next. Both shapes have to be understood, or a deleted account
 * would be re-admitted the moment its session came from the cache.
 */
function isSet(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  return typeof value === 'string' && value !== ''
}

function toUser(raw: Record<string, unknown>): SessionUser {
  const role = raw.role
  const locale = raw.locale

  return {
    id: String(raw.id),
    email: String(raw.email),
    name: asString(raw.name),
    image: asString(raw.image),
    // See rule 3 in the header: unknown roles get nothing.
    role: typeof role === 'string' && isRole(role) ? role : 'customer',
    locale: typeof locale === 'string' && isLocale(locale) ? locale : defaultLocale,
    phone: asString(raw.phone),
    country: asString(raw.country),
    emailVerified: raw.emailVerified === true,
  }
}

/* --------------------------------------------------------------------------
   Reads
   -------------------------------------------------------------------------- */

/**
 * The current session, or `null`.
 *
 * Never throws and never redirects — use it for surfaces that render
 * differently signed in and signed out (the header, a "save this place"
 * button) rather than for gating.
 */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  const result = await auth.api.getSession({ headers: await headers() })
  if (result === null) return null

  const raw = result.user as unknown as Record<string, unknown>
  // Rule 2: the row still exists and the session is still valid, but the
  // account is gone.
  if (isSet(raw.deletedAt)) return null
  // المحظور يُعامل كغير مسجّل. الحظر يحذف جلساته أيضاً، لكن كوكي التخزين
  // المؤقت قد يبقى حتى 5 دقائق — هذا يغلق تلك النافذة عند أول تحديث له.
  if (
    isUserBanned({
      status: typeof raw.status === 'string' ? raw.status : 'active',
      bannedUntil: (raw.bannedUntil as Date | string | null | undefined) ?? null,
    })
  ) {
    return null
  }

  return {
    user: toUser(raw),
    sessionId: String(result.session.id),
    expiresAt: new Date(result.session.expiresAt),
  }
})

/** The current user, or `null`. Convenience over `getSession()`. */
export async function getUser(): Promise<SessionUser | null> {
  return (await getSession())?.user ?? null
}

/**
 * The current user, or a redirect to sign-in.
 *
 * Returns `SessionUser` rather than `SessionUser | null`, so call sites do not
 * carry a null check that can be forgotten.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession()
  if (session !== null) return session.user

  // next-intl's redirect keeps the visitor in their language: an Arabic
  // reader bounced to `/account` would silently switch to English.
  //
  // It is typed `never` and throws NEXT_REDIRECT, but TypeScript only applies
  // never-return narrowing to a name with an explicit type annotation, and
  // this one is destructured out of `createNavigation()`. Hence the
  // unreachable throw below, which is what makes the signature honest.
  redirect({ href: SIGN_IN_HREF, locale: await getLocale() })
  throw new Error('unreachable: redirect() did not throw')
}

export type RequireCapabilityOptions = {
  /**
   * What to do when the user is signed in but lacks the capability.
   *
   * `'not-found'` (default) renders a 404. The admin lives behind an
   * environment-configured path, and a 403 there would confirm to a customer
   * who guessed the path that something is at the other end of it.
   *
   * `'throw'` raises `AuthorizationError` instead, which is what a Server
   * Action or route handler wants — `notFound()` inside an action produces a
   * confusing client error rather than a rejected mutation.
   */
  denied?: 'not-found' | 'throw'
}

/**
 * Gate on a named capability.
 *
 * This is an authorization boundary and it runs inside the handler, never
 * only in `proxy.ts` — one missed matcher pattern there would expose a route,
 * and matcher patterns are exactly the kind of thing that drifts.
 */
export async function requireCapability(
  capability: Capability,
  options: RequireCapabilityOptions = {},
): Promise<SessionUser> {
  const user = await requireUser()

  if (!can(user.role, capability)) {
    if (options.denied === 'throw') throw new AuthorizationError(capability)
    notFound()
  }

  return user
}

/**
 * Non-throwing capability check, for deciding whether to *render* something.
 *
 * Use it to hide a button; never use it in place of `requireCapability()` on
 * the action behind that button.
 */
export async function hasCapability(capability: Capability): Promise<boolean> {
  const user = await getUser()
  return user !== null && can(user.role, capability)
}
