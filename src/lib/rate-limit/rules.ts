/**
 * Rate limits shared by every app instance (Phase 6).
 *
 * Pure part: the rules and the fixed-window decision. The Postgres side
 * (./index.ts) runs the same decision as ONE atomic upsert, so two app
 * containers — or two requests in the same millisecond — share one counter.
 */

export interface RateRule {
  /** Window length in seconds. */
  window: number
  /** Requests allowed per window. */
  max: number
}

/**
 * The application's own limits (Better Auth's sign-in limits stay in
 * src/lib/auth/server.ts, now stored in the same table).
 */
export const RATE_RULES = {
  /** Contact form, per IP. */
  contact: { window: 60 * 60, max: 5 },
  /** Trying discount codes, per IP and per account. */
  coupon: { window: 10 * 60, max: 10 },
  /** New support tickets, per account. */
  ticket: { window: 60 * 60, max: 10 },
  /** WhatsApp verification codes requested, per IP (per-account caps live in phone-actions). */
  otpSend: { window: 60 * 60, max: 10 },
  /** Verification codes typed, per IP. */
  otpVerify: { window: 15 * 60, max: 20 },
  /** Browser error reports, per IP. */
  clientError: { window: 10 * 60, max: 30 },
  /** «Notify me when available» requests, per IP. */
  availabilityAlert: { window: 60 * 60, max: 8 },
  /** Inbound supplier webhooks, per connection. */
  webhook: { window: 60, max: 120 },
} as const satisfies Record<string, RateRule>

export type RateScope = keyof typeof RATE_RULES

export interface WindowState {
  count: number
  /** Epoch ms at which the current window ends. */
  expiresAt: number
}

export interface RateDecision {
  allowed: boolean
  /** Seconds until the window frees up (0 when allowed). */
  retryAfter: number
  next: WindowState
}

/**
 * One request against a fixed window. Mirrors the SQL in ./index.ts exactly:
 * an expired (or missing) window restarts at 1, otherwise the count goes up
 * by one, and the request is allowed while the count stays within `max`.
 * Refused requests are still counted, so hammering does not reopen the door.
 */
export function decideFixedWindow(
  state: WindowState | null,
  rule: RateRule,
  now: number,
): RateDecision {
  const fresh = state === null || state.expiresAt <= now
  const next: WindowState = fresh
    ? { count: 1, expiresAt: now + rule.window * 1000 }
    : { count: state.count + 1, expiresAt: state.expiresAt }
  const allowed = next.count <= rule.max
  return {
    allowed,
    retryAfter: allowed ? 0 : Math.max(1, Math.ceil((next.expiresAt - now) / 1000)),
    next,
  }
}

/** `<scope>:<subject>`, bounded to the column's 255 characters. */
export function rateKey(scope: string, subject: string): string {
  return `${scope}:${subject}`.slice(0, 255)
}

/** In-process store with the same semantics, for tests and as a last resort. */
export class MemoryWindowStore {
  readonly #rows = new Map<string, WindowState>()

  consume(key: string, rule: RateRule, now = Date.now()): RateDecision {
    const decision = decideFixedWindow(this.#rows.get(key) ?? null, rule, now)
    this.#rows.set(key, decision.next)
    return decision
  }
}
