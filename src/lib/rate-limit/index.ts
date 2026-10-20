/**
 * Postgres-backed rate limiting (Phase 6).
 *
 * The old limiter lived in each process's memory: two app containers meant
 * two buckets, so every limit doubled, and a deploy reset them all. Counters
 * now live in `rate_limits`, and one statement both reads and bumps a counter
 * under the row lock — concurrent requests on any number of instances are
 * counted exactly once each.
 *
 * Fails OPEN on a database error (logged): a limiter that turns a database
 * hiccup into "nobody can sign in" is worse than one that briefly limits
 * nothing, and the database being down stops the protected action anyway.
 */

import { lt, sql } from 'drizzle-orm'

import { db } from '@/db'
import { rateLimits } from '@/db/schema'

import { RATE_RULES, rateKey, type RateRule, type RateScope } from './rules'

export * from './rules'

export interface RateResult {
  allowed: boolean
  retryAfter: number
}

/** One request against `key` under `rule`, atomically. */
export async function consumeKey(key: string, rule: RateRule): Promise<RateResult> {
  try {
    const rows = await db.execute<{ count: number; retry_after: number }>(sql`
      insert into rate_limits (key, count, window_started_at, expires_at)
      values (${key}, 1, now(), now() + make_interval(secs => ${rule.window}))
      on conflict (key) do update set
        count = case when rate_limits.expires_at <= now() then 1 else rate_limits.count + 1 end,
        window_started_at = case when rate_limits.expires_at <= now() then now()
          else rate_limits.window_started_at end,
        expires_at = case when rate_limits.expires_at <= now()
          then now() + make_interval(secs => ${rule.window}) else rate_limits.expires_at end
      returning count, greatest(1, ceil(extract(epoch from (expires_at - now()))))::int as retry_after
    `)
    const row = rows[0]
    if (!row) return { allowed: true, retryAfter: 0 }
    const count = Number(row.count)
    return count <= rule.max
      ? { allowed: true, retryAfter: 0 }
      : { allowed: false, retryAfter: Number(row.retry_after) }
  } catch (error) {
    console.error('[rate-limit] counter unavailable; allowing the request', { key, error })
    return { allowed: true, retryAfter: 0 }
  }
}

/** One request by `subject` (an IP, an account id) in one of the app's scopes. */
export async function consumeRateLimit(scope: RateScope, subject: string): Promise<RateResult> {
  return consumeKey(rateKey(scope, subject), RATE_RULES[scope])
}

/** Several subjects at once (e.g. IP and account): refused if any one is. */
export async function consumeRateLimits(
  scope: RateScope,
  subjects: readonly (string | null | undefined)[],
): Promise<RateResult> {
  let worst: RateResult = { allowed: true, retryAfter: 0 }
  for (const subject of subjects) {
    if (!subject) continue
    const result = await consumeRateLimit(scope, subject)
    if (!result.allowed && result.retryAfter >= worst.retryAfter) worst = result
  }
  return worst
}

/** Housekeeping (worker): drop windows that ended a day ago. */
export async function pruneRateLimits(): Promise<number> {
  const removed = await db
    .delete(rateLimits)
    .where(lt(rateLimits.expiresAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
    .returning({ key: rateLimits.key })
  return removed.length
}

/* --------------------------------------------------------------------------
   Better Auth
   -------------------------------------------------------------------------- */

interface BetterAuthRateLimit {
  key: string
  count: number
  lastRequest: number
}

const BA_PREFIX = 'auth:'

/**
 * `rateLimit.customStorage` for Better Auth: its sign-in, sign-up and reset
 * limits in the same shared table. `consume` is the atomic path Better Auth
 * uses when a storage provides one; `get`/`set` exist for its older code path.
 */
export const betterAuthRateLimitStorage = {
  async get(key: string): Promise<BetterAuthRateLimit | null> {
    try {
      const rows = await db.execute<{ count: number; last_request: string | number | null }>(sql`
        select count, last_request from rate_limits where key = ${BA_PREFIX + key}
      `)
      const row = rows[0]
      if (!row) return null
      return { key, count: Number(row.count), lastRequest: Number(row.last_request ?? 0) }
    } catch (error) {
      console.error('[rate-limit] auth counter read failed', error)
      return null
    }
  },

  async set(key: string, value: BetterAuthRateLimit): Promise<void> {
    try {
      await db.execute(sql`
        insert into rate_limits (key, count, window_started_at, expires_at, last_request)
        values (${BA_PREFIX + key}, ${value.count}, now(), now() + interval '1 day', ${value.lastRequest})
        on conflict (key) do update set
          count = excluded.count,
          last_request = excluded.last_request,
          expires_at = excluded.expires_at
      `)
    } catch (error) {
      console.error('[rate-limit] auth counter write failed', error)
    }
  },

  async consume(
    key: string,
    rule: { window: number; max: number },
  ): Promise<{ allowed: boolean; retryAfter: number | null }> {
    const result = await consumeKey(BA_PREFIX + key, rule)
    return { allowed: result.allowed, retryAfter: result.allowed ? null : result.retryAfter }
  },
}
