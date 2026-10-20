/**
 * Phase 6: the error log (`error_events`).
 *
 * One small recorder used by every place that can see an unexpected error:
 * `src/instrumentation.ts` (Next's `onRequestError` — route handlers, server
 * components, server actions, the proxy), the Studio's action error handler,
 * the worker, and the browser beacon (`/api/client-errors`). Rows are
 * grouped by fingerprint with a counter; text is scrubbed of personal data
 * and secrets (./scrub.ts) before it is stored.
 *
 * NEVER throws and never blocks for long: a broken error logger must not turn
 * one error into two. The console line stays — the container log is still
 * the first place the technical team looks.
 */

import { sql } from 'drizzle-orm'

import { db } from '@/db'

import { describeThrown, errorFingerprint, scrubPath, scrubText } from './scrub'

export type ErrorSource = 'route' | 'render' | 'action' | 'worker' | 'client' | 'proxy' | 'other'

export interface ErrorContext {
  source: ErrorSource
  path?: string | null
  /** Small, non-personal extras: route kind, queue name, job id… */
  details?: Record<string, string | number | boolean | null>
}

/**
 * The same fingerprint seen again within this window is counted in memory
 * and written with the next occurrence, so an error in a hot loop costs one
 * write a second rather than one per request.
 */
const COALESCE_MS = 1000
const recent = new Map<string, { at: number; pending: number }>()

export async function recordError(error: unknown, context: ErrorContext): Promise<void> {
  try {
    const described = describeThrown(error)
    const message = scrubText(described.message || '(no message)')
    const stack = described.stack ? scrubText(described.stack, 6000) : null
    const name = (described.name ?? 'Error').slice(0, 120)
    const fingerprint = errorFingerprint({
      source: context.source,
      name,
      message: described.message,
      stack: described.stack,
    })

    const now = Date.now()
    const seen = recent.get(fingerprint)
    if (seen && now - seen.at < COALESCE_MS) {
      seen.pending += 1
      return
    }
    const increment = 1 + (seen?.pending ?? 0)
    recent.set(fingerprint, { at: now, pending: 0 })
    if (recent.size > 500) {
      for (const [key, value] of recent) if (now - value.at > 60_000) recent.delete(key)
    }

    const details = {
      ...(context.details ?? {}),
      ...(described.digest ? { digest: described.digest } : {}),
    }
    const path = scrubPath(context.path)

    await db.execute(sql`
      insert into error_events
        (fingerprint, source, name, message, stack, path, count, first_seen_at, last_seen_at, details)
      values
        (${fingerprint}, ${context.source}, ${name}, ${message}, ${stack}, ${path},
         ${increment}, now(), now(), ${JSON.stringify(details)}::jsonb)
      on conflict (fingerprint) do update set
        count = error_events.count + ${increment},
        last_seen_at = now(),
        message = excluded.message,
        stack = coalesce(excluded.stack, error_events.stack),
        path = coalesce(excluded.path, error_events.path),
        details = excluded.details,
        resolved_at = null
    `)
  } catch (failure) {
    console.error('[monitoring] could not record an error', failure)
  }
}

/** Fire and forget, for synchronous call sites. */
export function reportError(error: unknown, context: ErrorContext): void {
  void recordError(error, context)
}
