/** "Extend by N days" (Studio → Access) — pure. */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The new end of a dated grant extended by `days`: from its current end, or
 * from `now` when it has already ended (an expired grant comes back for
 * exactly `days`, not for whatever is left after the gap).
 */
export function extendedExpiry(expiresAt: Date, days: number, now: Date): Date {
  const from = expiresAt.getTime() > now.getTime() ? expiresAt.getTime() : now.getTime()
  return new Date(from + days * DAY_MS)
}
