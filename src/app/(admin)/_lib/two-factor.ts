import { and, eq, like, sql } from 'drizzle-orm'

import { db } from '@/db'
import { users, verifications } from '@/db/schema'
import {
  hashRecoveryCode,
  openSecret,
  recoveryCodeMatches,
  TWO_FACTOR_PREFIXES,
  verifyTotp,
} from '@/lib/auth/totp'

import type { Tx } from './audit'

/**
 * Where two-factor state lives.
 *
 * The enrolment itself sits on `users` — `two_factor_enabled` and
 * `two_factor_secret` are already in the schema. Everything else needs a
 * place to live and the schema is owned by another part of the project, so
 * this uses `verifications`, Better Auth's generic
 * identifier/value/expires_at store, under three reserved prefixes:
 *
 *   two-factor:session:<sessionId>    this session passed the challenge
 *   two-factor:recovery:<userId>      hashed single-use recovery codes
 *   two-factor:last-step:<userId>     the TOTP step already spent
 *
 * That is a deliberate trade, not an accident: a `two_factor` table would be
 * tidier, but adding one means a migration in a schema several slices read,
 * and the store already has exactly the right shape — a keyed value with an
 * expiry. Rows are namespaced so they cannot collide with Better Auth's own
 * (`reset-password:…`, e-mail verification), and the expiry means the
 * framework's own cleanup collects them.
 *
 * The session marker is keyed by SESSION id, so it dies with the session: a
 * revoked or expired session cannot carry a satisfied second factor into a
 * new one, and signing out is enough to force a fresh challenge.
 */

/** Recovery codes do not expire on their own; the row is replaced, not aged out. */
const FAR_FUTURE = new Date('2099-12-31T00:00:00Z')

/** A session marker never outlives the session it describes. */
const SESSION_MARKER_HOURS = 12

export interface TwoFactorStatus {
  enabled: boolean
  /** A secret exists but has never been confirmed with a code. */
  pending: boolean
  recoveryCodesRemaining: number
}

/* --------------------------------------------------------------------------
   Generic keyed access
   -------------------------------------------------------------------------- */

async function readValue(identifier: string): Promise<string | null> {
  const [row] = await db
    .select({ value: verifications.value, expiresAt: verifications.expiresAt })
    .from(verifications)
    .where(eq(verifications.identifier, identifier))
    .limit(1)

  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) return null
  return row.value
}

/**
 * Replace a value.
 *
 * `verifications.identifier` has an index but no unique constraint, so this
 * deletes first rather than relying on an upsert that the schema cannot
 * express.
 */
async function writeValue(
  identifier: string,
  value: string,
  expiresAt: Date,
  tx?: Tx,
): Promise<void> {
  const runner = tx ?? db
  await runner.delete(verifications).where(eq(verifications.identifier, identifier))
  await runner.insert(verifications).values({ identifier, value, expiresAt })
}

async function clearValue(identifier: string, tx?: Tx): Promise<void> {
  await (tx ?? db).delete(verifications).where(eq(verifications.identifier, identifier))
}

/* --------------------------------------------------------------------------
   Enrolment
   -------------------------------------------------------------------------- */

export async function twoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const [row] = await db
    .select({ enabled: users.twoFactorEnabled, secret: users.twoFactorSecret })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const hashes = await recoveryHashes(userId)

  return {
    enabled: row?.enabled === true,
    pending: row?.enabled !== true && (row?.secret ?? null) !== null,
    recoveryCodesRemaining: hashes.length,
  }
}

/** The decrypted secret, or null when the account has never started enrolling. */
export async function readSecret(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ secret: users.twoFactorSecret })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!row?.secret) return null
  return openSecret(row.secret)
}

/* --------------------------------------------------------------------------
   Replay protection
   -------------------------------------------------------------------------- */

/**
 * Verify a code and burn its step.
 *
 * A TOTP code is valid for its whole 30-second period, so accepting one twice
 * makes a shoulder-surfed or phished code reusable inside that window. The
 * step is recorded and a repeat is refused even though the arithmetic still
 * says the code is correct.
 */
export async function verifyCodeOnce(
  userId: string,
  secret: string,
  code: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const result = verifyTotp(secret, code)
  if (!result.valid)
    return {
      ok: false,
      reason: 'That code is not valid. Check your phone’s clock and try the next one.',
    }

  const identifier = `${TWO_FACTOR_PREFIXES.replay}${userId}`
  const previous = await readValue(identifier)
  if (previous !== null && Number.parseInt(previous, 10) >= result.step) {
    return {
      ok: false,
      reason: 'That code has already been used. Wait for your authenticator to show the next one.',
    }
  }

  // Two periods of slack so a code cannot be reused after the window moves on.
  await writeValue(identifier, String(result.step), new Date(Date.now() + 5 * 60_000))
  return { ok: true }
}

/* --------------------------------------------------------------------------
   Recovery codes
   -------------------------------------------------------------------------- */

export async function recoveryHashes(userId: string): Promise<string[]> {
  const value = await readValue(`${TWO_FACTOR_PREFIXES.recovery}${userId}`)
  if (value === null) return []

  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

export async function storeRecoveryCodes(
  userId: string,
  codes: readonly string[],
  tx?: Tx,
): Promise<void> {
  await writeValue(
    `${TWO_FACTOR_PREFIXES.recovery}${userId}`,
    JSON.stringify(codes.map(hashRecoveryCode)),
    FAR_FUTURE,
    tx,
  )
}

/**
 * Spend one recovery code.
 *
 * Single use: the hash is removed on success, so a code copied out of a
 * password manager cannot be replayed by whoever else has that manager.
 */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const hashes = await recoveryHashes(userId)
  const matched = recoveryCodeMatches(code, hashes)
  if (matched === null) return false

  const remaining = hashes.filter((hash) => hash !== matched)
  await writeValue(
    `${TWO_FACTOR_PREFIXES.recovery}${userId}`,
    JSON.stringify(remaining),
    FAR_FUTURE,
  )
  return true
}

/* --------------------------------------------------------------------------
   Failed-attempt limit
   -------------------------------------------------------------------------- */

/**
 * محاولات خاطئة متتالية قبل القفل. التحدي Server Action، فحدود Better Auth
 * (على /api/auth فقط) لا تشمله: بلا هذا الحد يخمّن من سرق كلمة المرور الرمز
 * المكوّن من 6 أرقام بلا توقف.
 */
export const MAX_CHALLENGE_FAILURES = 5
export const CHALLENGE_LOCK_MINUTES = 15
const FAIL_PREFIX = 'two-factor:fail:'

async function readFailures(runner: Tx | typeof db, userId: string): Promise<number> {
  const [row] = await runner
    .select({ value: verifications.value, expiresAt: verifications.expiresAt })
    .from(verifications)
    .where(eq(verifications.identifier, `${FAIL_PREFIX}${userId}`))
    .limit(1)
  if (!row || row.expiresAt.getTime() < Date.now()) return 0
  return Number.parseInt(row.value, 10) || 0
}

/** يحجز محاولة: يزيد العدّاد ذرّياً ويعيد العدد الجديد. النافذة تتجدد مع كل محاولة. */
export async function reserveChallengeAttempt(userId: string): Promise<number> {
  const identifier = `${FAIL_PREFIX}${userId}`
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${identifier}))`)
    const next = (await readFailures(tx, userId)) + 1
    await writeValue(
      identifier,
      String(next),
      new Date(Date.now() + CHALLENGE_LOCK_MINUTES * 60_000),
      tx,
    )
    return next
  })
}

export async function clearChallengeFailures(userId: string): Promise<void> {
  await clearValue(`${FAIL_PREFIX}${userId}`)
}

/* --------------------------------------------------------------------------
   Per-session challenge state
   -------------------------------------------------------------------------- */

export async function markSessionVerified(sessionId: string, userId: string): Promise<void> {
  await writeValue(
    `${TWO_FACTOR_PREFIXES.session}${sessionId}`,
    userId,
    new Date(Date.now() + SESSION_MARKER_HOURS * 3600_000),
  )
}

export async function isSessionVerified(sessionId: string, userId: string): Promise<boolean> {
  // The stored value is the user id, so a recycled session identifier cannot
  // satisfy the challenge for a different account.
  return (await readValue(`${TWO_FACTOR_PREFIXES.session}${sessionId}`)) === userId
}

export async function clearSessionVerification(sessionId: string, tx?: Tx): Promise<void> {
  await clearValue(`${TWO_FACTOR_PREFIXES.session}${sessionId}`, tx)
}

/**
 * Drop every satisfied-challenge marker for a user.
 *
 * Called when their second factor is reset or their sessions are revoked —
 * whatever the reason, every existing session has to prove itself again.
 */
export async function clearAllVerifications(userId: string, tx?: Tx): Promise<void> {
  const runner = tx ?? db

  const rows = await runner
    .select({
      id: verifications.id,
      identifier: verifications.identifier,
      value: verifications.value,
    })
    .from(verifications)
    .where(
      and(
        like(verifications.identifier, `${TWO_FACTOR_PREFIXES.session}%`),
        eq(verifications.value, userId),
      ),
    )

  for (const row of rows) {
    await runner.delete(verifications).where(eq(verifications.id, row.id))
  }
}
