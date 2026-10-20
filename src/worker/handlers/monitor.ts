/**
 * Phase 6: `system.monitor`, every 15 minutes.
 *
 * Looks for the things that must reach a person, and tells the admins
 * (src/lib/monitoring/alerts.ts throttles each kind):
 *
 *   - the nightly backup is late (no success for 26 hours);
 *   - background jobs gave up after all their retries (dead letters);
 *   - an error spike (ERROR_SPIKE_THRESHOLD new occurrences, default 50,
 *     since the previous run);
 *   - payment notices from the provider failing to process.
 *
 * Then housekeeping: expired rate-limit windows, integration logs older than
 * 90 days, error groups not seen for 90 days.
 */

import { and, lt, sql } from 'drizzle-orm'

import { db } from '@/db'
import { errorEvents, integrationLogs } from '@/db/schema'
import { sendAlert } from '@/lib/monitoring/alerts'
import { backupStatus } from '@/lib/monitoring/health'
import { deadLettersSince } from '@/lib/monitoring/jobs'
import { WEBHOOK_PROVIDER } from '@/lib/integrations/webhook'
import { pruneRateLimits } from '@/lib/rate-limit'

import { enqueueIntegrationWebhook, type SystemMonitorJob } from '../queues'

const DAY_MS = 24 * 60 * 60 * 1000

function spikeThreshold(): number {
  const raw = Number(process.env.ERROR_SPIKE_THRESHOLD)
  return Number.isFinite(raw) && raw >= 5 ? Math.floor(raw) : 50
}

/**
 * How much a running total grew since the previous run. The previous total
 * is kept in `system_heartbeats` (`monitor:<name>`); the first run only
 * records it (returns 0), so an old backlog never alerts on deploy.
 */
async function growth(name: string, total: number): Promise<number> {
  const rows = await db.execute<{ previous: string | null }>(sql`
    with old as (
      select (details->>'total') as previous from system_heartbeats where name = ${`monitor:${name}`}
    )
    insert into system_heartbeats (name, last_ok_at, details, updated_at)
    values (${`monitor:${name}`}, now(), ${JSON.stringify({ total })}::jsonb, now())
    on conflict (name) do update set details = excluded.details, last_ok_at = now(), updated_at = now()
    returning (select previous from old) as previous
  `)
  const previous = rows[0]?.previous
  if (previous === null || previous === undefined) return 0
  return Math.max(0, total - Number(previous))
}

async function errorTotal(area?: string): Promise<number> {
  const rows = await db.execute<{ total: string | number | null }>(
    area === undefined
      ? sql`select coalesce(sum(count), 0) as total from error_events`
      : sql`select coalesce(sum(count), 0) as total from error_events where details->>'area' = ${area}`,
  )
  return Number(rows[0]?.total ?? 0)
}

export async function handleSystemMonitor(_job: SystemMonitorJob): Promise<object> {
  const sent: string[] = []

  // 1. Backup. Only once a backup has ever reported, or on a live server —
  //    a fresh staging box without the backup cron is not an emergency.
  const backup = await backupStatus()
  if (backup.stale && (backup.lastOkAt !== null || process.env.LIVE_MODE === 'true')) {
    const hours = backup.hoursAgo === null ? 0 : Math.round(backup.hoursAgo)
    if (await sendAlert('staff_alert_backup', 'backup', { hours }, 12)) sent.push('backup')
  }

  // 2. Dead letters in the last run's window (with a little overlap).
  const dead = await deadLettersSince(new Date(Date.now() - 20 * 60 * 1000)).catch(() => 0)
  if (dead > 0 && (await sendAlert('staff_alert_jobs', 'jobs', { count: dead }, 1))) {
    sent.push('jobs')
  }

  // 3. Error spike.
  const errors = await growth('errors', await errorTotal())
  if (
    errors >= spikeThreshold() &&
    (await sendAlert('staff_alert_errors', 'errors', { count: errors }, 1))
  ) {
    sent.push('errors')
  }

  // 4. Payment notices that failed to process.
  const payments = await growth('payment_webhook', await errorTotal('payment_webhook'))
  if (payments > 0 && (await sendAlert('staff_alert_payment', 'payment', { count: payments }, 1))) {
    sent.push('payment')
  }

  // 5. Supplier webhooks accepted but never handled (the queue was briefly
  //    unreachable, or the connection was paused and is active again).
  const waiting = await db.execute<{ id: string; integration_id: string }>(sql`
    select e.id, i.id as integration_id
      from webhook_events e
      join supplier_integrations i
        on e.provider_event_id like (i.id::text || ':%')
     where e.provider = ${WEBHOOK_PROVIDER}
       and e.processed_at is null
       and e.created_at < now() - interval '10 minutes'
       and e.created_at > now() - interval '7 days'
       and i.status <> 'paused'
     order by e.created_at
     limit 50
  `)
  for (const row of waiting) {
    await enqueueIntegrationWebhook({ integrationId: row.integration_id, webhookEventId: row.id })
  }

  // 6. Housekeeping.
  const now = Date.now()
  const rateLimits = await pruneRateLimits()
  const logs = await db
    .delete(integrationLogs)
    .where(lt(integrationLogs.createdAt, new Date(now - 90 * DAY_MS)))
    .returning({ id: integrationLogs.id })
  const stale = await db
    .delete(errorEvents)
    .where(and(lt(errorEvents.lastSeenAt, new Date(now - 90 * DAY_MS))))
    .returning({ id: errorEvents.id })

  return {
    alerts: sent,
    deadLetters: dead,
    newErrors: errors,
    paymentFailures: payments,
    requeuedWebhooks: waiting.length,
    pruned: { rateLimits, integrationLogs: logs.length, errorGroups: stale.length },
  }
}
