import { lt } from 'drizzle-orm'

import { db } from '@/db'
import { analyticsEvents, clientErrors, reportExports, visitorAttribution } from '@/db/schema'

/**
 * Retention: our own event rows are kept for `retentionMonths` (Studio →
 * Marketing & tracking, default 13), then deleted. Map error reports are
 * kept 90 days, PDF export records 30 days.
 *
 * Orders, payments and bookings are NOT touched: they are business records,
 * and every financial report reads them, not these events.
 */
export function retentionCutoff(months: number, now = new Date()): Date {
  const cutoff = new Date(now.getTime())
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months)
  return cutoff
}

export async function pruneAnalytics(
  retentionMonths: number,
  now = new Date(),
): Promise<{ events: number; visitors: number; errors: number; exports: number }> {
  const cutoff = retentionCutoff(retentionMonths, now)
  const events = await db
    .delete(analyticsEvents)
    .where(lt(analyticsEvents.createdAt, cutoff))
    .returning({ id: analyticsEvents.id })
  const visitors = await db
    .delete(visitorAttribution)
    .where(lt(visitorAttribution.lastSeenAt, cutoff))
    .returning({ id: visitorAttribution.anonId })
  const errors = await db
    .delete(clientErrors)
    .where(lt(clientErrors.createdAt, new Date(now.getTime() - 90 * 86_400_000)))
    .returning({ id: clientErrors.id })
  const exports = await db
    .delete(reportExports)
    .where(lt(reportExports.createdAt, new Date(now.getTime() - 30 * 86_400_000)))
    .returning({ id: reportExports.id })
  return {
    events: events.length,
    visitors: visitors.length,
    errors: errors.length,
    exports: exports.length,
  }
}
