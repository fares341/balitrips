/**
 * Who is looking at this page.
 *
 * `@/lib/entitlements` takes a user id and answers what that user has paid
 * for. Nothing in the repo yet answers the prior question — Better Auth is a
 * dependency but the auth module has not landed — so this resolves the viewer
 * from the session cookie directly.
 *
 * Deliberately narrow and deliberately provisional:
 *
 *  - it only ever *reads*, and it fails closed to `null` on anything unexpected
 *    (no cookie, unknown token, expired row, soft-deleted user, database
 *    error). A null viewer renders the signed-out page, which is the safe
 *    default for a paywall;
 *  - it grants nothing. Entitlement still comes from the `entitlements` table
 *    via `loadEntitlements`, so the worst a bad read can do is fail to show
 *    someone the "Active" badge they already paid for;
 *  - it does not verify the cookie's HMAC suffix. The token itself is a
 *    high-entropy value that only exists because the server issued it and
 *    stored it, so the lookup is the check; the signature is defence in depth
 *    that belongs in the auth module.
 *
 * Replace every call site with the auth module's own `getSession()` the moment
 * it exists — this file should not outlive it.
 *
 * Route-private: `_viewer` is not a route segment. Server-only — `cookies()`
 * throws anywhere else, and importing this into a Client Component would drag
 * the Postgres driver into the browser.
 */

import { cookies } from 'next/headers'
import { and, eq, gt, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { sessions, users } from '@/db/schema'

/**
 * Cookie names Better Auth writes, most specific first.
 *
 * The `__Secure-` prefix is what production uses over HTTPS; the bare name is
 * what `next dev` sees. Checking both means the page behaves the same locally
 * and deployed.
 */
const SESSION_COOKIE_NAMES = [
  // `advanced.cookiePrefix: 'bt'` in src/lib/auth/server.ts. The names this
  // list used to carry were Better Auth's *defaults* (`better-auth.*`), which
  // this app never sets — so this helper returned null for every signed-in
  // visitor, and /plans showed paying customers the "buy" buttons.
  '__Secure-bt.session_token',
  'bt.session_token',
] as const

/**
 * The signed cookie is `<token>.<signature>`. Only the token half is stored in
 * `sessions.token`, so the suffix is dropped before the lookup.
 */
function tokenFrom(raw: string): string | null {
  const token = raw.split('.')[0]?.trim() ?? ''
  return token === '' ? null : token
}

/**
 * The signed-in user's id, or null.
 *
 * Calling this opts the caller into dynamic rendering — it reads a cookie.
 * Keep it behind a `<Suspense>` boundary so the rest of the page can still be
 * prerendered, and never call it from a page whose content is identical for
 * every visitor.
 */
export async function currentUserId(): Promise<string | null> {
  const jar = await cookies()

  let token: string | null = null
  for (const name of SESSION_COOKIE_NAMES) {
    const raw = jar.get(name)?.value
    if (raw !== undefined) {
      token = tokenFrom(raw)
      if (token !== null) break
    }
  }

  if (token === null) return null

  try {
    const rows = await db
      .select({ userId: sessions.userId })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.token, token),
          // An expired session is not a session. Compared in SQL so the check
          // uses the database clock rather than the web box's.
          gt(sessions.expiresAt, new Date()),
          // A soft-deleted account keeps its rows; it must not keep its access.
          isNull(users.deletedAt),
        ),
      )
      .limit(1)

    return rows[0]?.userId ?? null
  } catch {
    // A page that shows plans must still render when the database is
    // unreachable. Signed-out is the correct degraded state: it withholds a
    // badge, it never grants one.
    return null
  }
}
