/**
 * `analytics.sweep` — phase 5 upkeep, every 10 minutes (one schedule per
 * queue in pg-boss, so the rarer tasks ride on the same run):
 *
 *  - always: write the server analytics events the database implies
 *    (purchases, payments, bookings, refunds, VIP, downloads, leads), send
 *    purchases to the ad platforms' server APIs (if switched on, marketing
 *    consent only), and send abandoned-checkout reminders (if switched on);
 *  - the :03 run of every hour: scheduled report emails that are due;
 *  - 03:03 UTC: delete event rows older than the retention setting.
 *
 * Every step is idempotent; a failure is logged and the next run retries.
 */

import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { analyticsEvents } from '@/db/schema'
import { sendCheckoutReminders } from '@/lib/analytics/abandoned'
import { forwardPurchases } from '@/lib/analytics/forward'
import { pruneAnalytics } from '@/lib/analytics/maintenance'
import { syncServerEvents } from '@/lib/analytics/server-events'
import { readMarketingSettings } from '@/lib/analytics/settings'
import { sendDueReports } from '@/lib/reports/scheduled'

import type { AnalyticsJob } from '../queues'

const DAY = 86_400_000

async function step(name: string, run: () => Promise<unknown>): Promise<void> {
  try {
    const result = await run()
    console.info(`[analytics] ${name}`, result)
  } catch (error) {
    console.error(`[analytics] ${name} failed`, error)
  }
}

export async function handleAnalyticsJob(job: AnalyticsJob, now = new Date()): Promise<void> {
  const settings = await readMarketingSettings()

  if (job.kind === 'prune') {
    await step('prune', () => pruneAnalytics(settings.retentionMonths, now))
    return
  }
  if (job.kind === 'reports') {
    await step('reports', () => sendDueReports(now))
    return
  }

  // sync — the first run on a database with no server events backfills a year.
  let days = job.days ?? 3
  if (job.days === undefined) {
    const [any] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(sql`${analyticsEvents.source} = 'server'`)
    if ((any?.n ?? 0) === 0) days = 400
  }
  await step('sync', () => syncServerEvents(new Date(now.getTime() - days * DAY)))
  await step('forward', () => forwardPurchases(settings))
  await step('reminders', () => sendCheckoutReminders(settings, now))
  if (now.getUTCMinutes() < 10) await step('reports', () => sendDueReports(now))
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 10) {
    await step('prune', () => pruneAnalytics(settings.retentionMonths, now))
  }
}
