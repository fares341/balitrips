import { baliDate, BALI_OFFSET_MS } from './period'

/** When scheduled report emails go out, and which days they cover. Pure (tested). */

const SEND_HOUR_BALI = 7

/** Is a schedule due now? Pure (tested). */
export function scheduleDue(frequency: string, lastSentAt: Date | null, now: Date): boolean {
  const local = new Date(now.getTime() + BALI_OFFSET_MS)
  if (local.getUTCHours() < SEND_HOUR_BALI) return false
  // Today's send moment (07:00 Bali) as an instant.
  const todaySend = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), SEND_HOUR_BALI) -
      BALI_OFFSET_MS,
  )
  if (frequency === 'weekly' && local.getUTCDay() !== 1) return false
  return lastSentAt === null || lastSentAt < todaySend
}

/** The period a schedule reports on, as report URL parameters. */
export function schedulePeriod(frequency: string, now: Date): Record<string, string> {
  const yesterday = baliDate(new Date(now.getTime() - 86_400_000))
  if (frequency === 'weekly') {
    const from = baliDate(new Date(now.getTime() - 7 * 86_400_000))
    return { period: 'custom', from, to: yesterday }
  }
  return { period: 'yesterday' }
}
