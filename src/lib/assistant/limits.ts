/**
 * Abuse limits for the assistants.
 *
 * Every message costs money (an OpenRouter call), so the public endpoint is
 * limited in three layers:
 *
 *   1. burst limits in memory, per IP and per browser session (sliding window);
 *   2. a daily message cap per IP, counted in Postgres (`assistant_usage`), so
 *      it survives a restart and holds across processes;
 *   3. a global daily budget in USD from Studio settings: once today's spend
 *      reaches it, the assistant answers "unavailable" until midnight UTC.
 *
 * The repo had no reusable rate-limit helper (Better Auth keeps its own,
 * in-process and private), so (1) lives here. It is in-memory on purpose: the
 * app runs as one Node process per container, the window is minutes long, and
 * (2) and (3) are the durable backstops.
 *
 * The limiter is pure apart from the clock, which is injected for the tests.
 */

export interface LimitResult {
  ok: boolean
  /** Milliseconds until the oldest hit leaves the window (0 when ok). */
  retryAfterMs: number
}

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>()

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
    /** Upper bound on tracked keys, so a flood of fresh IPs cannot grow memory. */
    private readonly maxKeys = 20_000,
  ) {}

  /** Record a hit for `key` if allowed. A refused hit is not recorded. */
  hit(key: string): LimitResult {
    const now = this.now()
    const since = now - this.windowMs
    const recent = (this.hits.get(key) ?? []).filter((at) => at > since)

    if (recent.length >= this.limit) {
      this.hits.set(key, recent)
      const oldest = recent[0] ?? now
      return { ok: false, retryAfterMs: Math.max(0, oldest + this.windowMs - now) }
    }

    recent.push(now)
    this.hits.delete(key)
    this.hits.set(key, recent)
    if (this.hits.size > this.maxKeys) this.evict(since)
    return { ok: true, retryAfterMs: 0 }
  }

  /** Remaining hits for `key` in the current window. */
  remaining(key: string): number {
    const since = this.now() - this.windowMs
    const recent = (this.hits.get(key) ?? []).filter((at) => at > since)
    return Math.max(0, this.limit - recent.length)
  }

  get size(): number {
    return this.hits.size
  }

  private evict(since: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((at) => at <= since)) this.hits.delete(key)
    }
    // Still too many: drop the least recently used (Map keeps insertion order,
    // and `hit` re-inserts on every use).
    while (this.hits.size > this.maxKeys) {
      const first = this.hits.keys().next()
      if (first.done) break
      this.hits.delete(first.value)
    }
  }
}

/** Burst limits shared by the public endpoint (one instance per process). */
export const PUBLIC_LIMITS = {
  /** Messages per IP per minute. A hotel's shared Wi-Fi is the reason it is not lower. */
  perIpPerMinute: new SlidingWindowLimiter(10, 60_000),
  /** Messages per browser session per 10 minutes. */
  perSessionPer10Min: new SlidingWindowLimiter(20, 10 * 60_000),
  /** Confirmation clicks per session per 10 minutes. */
  confirmsPerSession: new SlidingWindowLimiter(10, 10 * 60_000),
}

/** Staff: generous, but a stuck script must not run up a bill. */
export const STUDIO_LIMITS = {
  perUserPerMinute: new SlidingWindowLimiter(12, 60_000),
}

/* --------------------------------------------------------------------------
   Daily caps (the numbers; the counting lives in ./store.ts)
   -------------------------------------------------------------------------- */

/** Today's UTC date as `YYYY-MM-DD`: the key of the daily counters. */
export function usageDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export interface DailyState {
  ipMessages: number
  globalMessages: number
  globalCostMicros: number
}

export type DailyVerdict = 'ok' | 'ip_cap' | 'budget'

export function dailyVerdict(
  state: DailyState,
  caps: { messagesPerIp: number; budgetUsd: number },
): DailyVerdict {
  if (caps.budgetUsd <= 0 || state.globalCostMicros >= Math.round(caps.budgetUsd * 1_000_000))
    return 'budget'
  if (state.ipMessages >= caps.messagesPerIp) return 'ip_cap'
  return 'ok'
}

/* --------------------------------------------------------------------------
   Input limits
   -------------------------------------------------------------------------- */

export const MAX_INPUT_CHARS = 1000
/** Turns (one user + one assistant message each) replayed to the model. */
export const MAX_HISTORY_TURNS = 16

/** Trim the visitor's text; null when empty or over the limit. */
export function cleanInput(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
  if (text === '' || text.length > MAX_INPUT_CHARS) return null
  return text
}

/** The last `turns` user/assistant exchanges, oldest first. */
export function trimHistory<T extends { role: string }>(
  messages: readonly T[],
  turns = MAX_HISTORY_TURNS,
): T[] {
  const max = turns * 2
  const tail = messages.slice(-max)
  // Never start on an assistant message: the model would read it as a reply
  // to nothing.
  const firstUser = tail.findIndex((message) => message.role === 'user')
  return firstUser === -1 ? [] : tail.slice(firstUser)
}
