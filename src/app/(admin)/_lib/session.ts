import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { can, isElevated, requiresTwoFactor, type Role } from '@/lib/auth/roles'
import type { Capability } from '@/lib/auth/roles'
import { getSession } from '@/lib/auth/session'

import { adminHref } from './admin-path'
import { isSessionVerified, twoFactorStatus } from './two-factor'

/**
 * The admin's authorization gate.
 *
 * Built on `@/lib/auth/session`, which owns Better Auth, the cookie cache and
 * the soft-delete and unknown-role rules. This wrapper adds the two things
 * the admin needs on top of it:
 *
 *  1. **Every failure is a 404, including "not signed in".** The shared
 *     `requireCapability()` redirects an anonymous visitor to `/account`,
 *     which is right for the customer-facing gated pages and wrong here — a
 *     redirect confirms that something exists at the guessed path, which is
 *     the one fact `ADMIN_BASE_PATH` is trying not to leak.
 *  2. **The caller's IP**, which every audit row records so a mutation is
 *     always attributable.
 *  3. **Two-factor enforcement.** `roles.ts` has always said TOTP is
 *     mandatory for staff and admin; until now nothing acted on it. Every
 *     capability check below is also a second-factor check, so an elevated
 *     session that has not passed the challenge cannot read a page OR run an
 *     action — it is bounced to the enrolment screen instead.
 *
 * Called at the top of EVERY admin page and EVERY admin server action,
 * including read-only ones. The proxy rewrite that maps the configured base
 * path onto these routes is routing, not authorization: one missed matcher
 * pattern there would silently expose a route, so nothing here depends on it
 * having run.
 */

/** Where enrolment and the challenge live. Exempt from the 2FA gate itself. */
export const SECURITY_PATH = '/security'

export interface AdminSession {
  userId: string
  email: string
  name: string | null
  role: Role
  /**
   * The session row's id. Two-factor state is keyed by it, so the satisfied
   * challenge dies with the session rather than following the account.
   */
  sessionId: string
  /** Recorded on every audit row. */
  ipAddress: string | null
}

function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first.slice(0, 64)
  }
  return headerList.get('x-real-ip')?.slice(0, 64) ?? null
}

/** The caller, or null when there is no live elevated session. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const session = await getSession()
  if (!session) return null

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    sessionId: session.sessionId,
    ipAddress: clientIp(await headers()),
  }
}

/**
 * Role gate only — NO second-factor check.
 *
 * Exactly two callers may use this: the shell layout, which must render
 * around the enrolment screen, and the enrolment/challenge screens
 * themselves. Anywhere else it would be a hole, because the second factor is
 * the point.
 */
export async function requireElevated(): Promise<AdminSession> {
  const session = await getAdminSession()

  if (!session || !isElevated(session.role)) {
    console.warn(
      `[admin] denied entry for ${session ? `${session.email} (${session.role})` : 'anonymous'}`,
    )
    notFound()
  }

  return session
}

/**
 * Gate on a named capability. Never returns for a caller that is not
 * entitled — it renders the 404 instead.
 */
export async function requireCapability(capability: Capability): Promise<AdminSession> {
  const session = await getAdminSession()

  if (!session || !isElevated(session.role) || !can(session.role, capability)) {
    // Logged server-side so a genuine misconfiguration is diagnosable
    // without the response telling an attacker anything.
    console.warn(
      `[admin] denied ${capability} for ${session ? `${session.email} (${session.role})` : 'anonymous'}`,
    )
    notFound()
  }

  await enforceTwoFactor(session)

  return session
}

export type TwoFactorGate = 'satisfied' | 'enrol' | 'challenge'

/**
 * What this session still owes.
 *
 * Read-only — use it to render an explanation. The enforcement is
 * `enforceTwoFactor()`, which every capability check performs.
 */
export async function twoFactorGate(session: AdminSession): Promise<TwoFactorGate> {
  if (!requiresTwoFactor(session.role)) return 'satisfied'

  const status = await twoFactorStatus(session.userId)
  if (!status.enabled) return 'enrol'

  return (await isSessionVerified(session.sessionId, session.userId)) ? 'satisfied' : 'challenge'
}

/**
 * Send an elevated session that has not proved a second factor to the screen
 * that lets it.
 *
 * A redirect rather than a 404: the caller is a known, authenticated member
 * of staff, and there is an action they can take. `redirect()` throws, so
 * this never returns in that case — including inside a server action, where
 * it aborts the mutation before any work is done.
 */
export async function enforceTwoFactor(session: AdminSession): Promise<void> {
  const gate = await twoFactorGate(session)
  if (gate === 'satisfied') return

  console.warn(`[admin] two-factor ${gate} required for ${session.email}`)
  redirect(adminHref(SECURITY_PATH))
}
