/**
 * Phase 6: deep health checks — the database, the job queue, file storage,
 * the PDF renderer, and the nightly backup.
 *
 * `/api/health` stays a liveness probe that touches nothing (the reverse
 * proxy uses it to route traffic, and a slow query must never take a healthy
 * container out of rotation). These checks run only for `/api/health/deep`
 * (admin token or `system.read`) and for Studio → System health.
 */

import { eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { systemHeartbeats } from '@/db/schema'
import { gotenbergHealthy, gotenbergUrl } from '@/lib/pdf'
import { getStorageConfig, isPrivateStorageAvailable } from '@/lib/storage'

// Bundled at build time: the standalone server has no drizzle/ folder on disk.
import journal from '../../../drizzle/meta/_journal.json'

export type CheckState = 'ok' | 'warn' | 'down'

export interface Check {
  name: 'database' | 'queue' | 'storage' | 'pdf' | 'backup'
  state: CheckState
  ms: number
  /** Short technical detail for the "advanced" fold. Never a secret. */
  detail: string
}

async function timed(
  name: Check['name'],
  run: () => Promise<{ state: CheckState; detail: string }>,
  timeoutMs = 4000,
): Promise<Check> {
  const started = Date.now()
  try {
    const result = await Promise.race([
      run(),
      new Promise<{ state: CheckState; detail: string }>((resolve) =>
        setTimeout(
          () => resolve({ state: 'down', detail: `no answer in ${timeoutMs} ms` }),
          timeoutMs,
        ),
      ),
    ])
    return { name, ...result, ms: Date.now() - started }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { name, state: 'down', detail: message.slice(0, 200), ms: Date.now() - started }
  }
}

/** A backup older than this is "late" (nightly at 02:30, plus slack). */
export const BACKUP_STALE_HOURS = 26

export interface BackupStatus {
  lastOkAt: Date | null
  hoursAgo: number | null
  stale: boolean
  details: Record<string, unknown> | null
}

export async function backupStatus(now = new Date()): Promise<BackupStatus> {
  const [row] = await db
    .select({ lastOkAt: systemHeartbeats.lastOkAt, details: systemHeartbeats.details })
    .from(systemHeartbeats)
    .where(eq(systemHeartbeats.name, 'backup'))
    .limit(1)
  if (!row) return { lastOkAt: null, hoursAgo: null, stale: true, details: null }
  const hoursAgo = (now.getTime() - row.lastOkAt.getTime()) / 3_600_000
  return {
    lastOkAt: row.lastOkAt,
    hoursAgo: Math.round(hoursAgo * 10) / 10,
    stale: hoursAgo > BACKUP_STALE_HOURS,
    details: row.details ?? null,
  }
}

export async function runHealthChecks(): Promise<Check[]> {
  return Promise.all([
    timed('database', async () => {
      await db.execute(sql`select 1`)
      return { state: 'ok', detail: 'select 1' }
    }),
    timed('queue', async () => {
      // to_regclass: a database where no worker has started yet has no
      // pg-boss schema — that is "not installed yet", not an error.
      const installed = await db.execute<{ t: string | null }>(
        sql`select to_regclass('pgboss.version')::text as t`,
      )
      if (!installed[0]?.t) return { state: 'warn', detail: 'pg-boss schema not installed yet' }
      const rows = await db.execute<{ version: number }>(
        sql`select version from pgboss.version limit 1`,
      )
      const version = rows[0]?.version
      return version === undefined
        ? { state: 'warn', detail: 'pg-boss schema not installed yet' }
        : { state: 'ok', detail: `pg-boss schema v${version}` }
    }),
    timed('storage', async () => {
      const config = getStorageConfig()
      if (config === null) {
        return isPrivateStorageAvailable()
          ? { state: 'warn', detail: 'local private storage only (no object storage)' }
          : { state: 'down', detail: 'no storage configured' }
      }
      // Any HTTP answer from the endpoint means it is reachable.
      const response = await fetch(config.endpoint, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      })
      return { state: 'ok', detail: `object storage reachable (HTTP ${response.status})` }
    }),
    timed('pdf', async () => {
      const healthy = await gotenbergHealthy(3000)
      const host = (() => {
        try {
          return new URL(gotenbergUrl()).host
        } catch {
          return 'gotenberg'
        }
      })()
      return healthy
        ? { state: 'ok', detail: `${host} healthy` }
        : { state: 'down', detail: `${host} not answering` }
    }),
    timed('backup', async () => {
      const status = await backupStatus()
      if (status.lastOkAt === null) return { state: 'warn', detail: 'no backup recorded yet' }
      return {
        state: status.stale ? 'down' : 'ok',
        detail: `last successful backup ${status.hoursAgo} h ago`,
      }
    }),
  ])
}

export function overallState(checks: readonly Check[]): CheckState {
  if (checks.some((check) => check.state === 'down')) return 'down'
  if (checks.some((check) => check.state === 'warn')) return 'warn'
  return 'ok'
}

/* --------------------------------------------------------------------------
   Migrations
   -------------------------------------------------------------------------- */

interface JournalEntry {
  idx: number
  when: number
  tag: string
}

/** The migrations this build ships. */
function shippedMigrations(): JournalEntry[] {
  return (journal as { entries?: JournalEntry[] }).entries ?? []
}

export interface MigrationRow {
  tag: string
  applied: boolean
}

/**
 * Applied migrations from Drizzle's own table, matched to this build's
 * journal by their timestamp (`created_at` is the journal's `when`).
 */
export async function migrationStatus(): Promise<{
  rows: MigrationRow[]
  appliedCount: number
  journalFound: boolean
}> {
  const applied = await db.execute<{ created_at: string | number }>(
    sql`select created_at from drizzle.__drizzle_migrations order by created_at`,
  )
  const appliedWhen = new Set(applied.map((row) => Number(row.created_at)))
  const shipped = shippedMigrations()
  const rows = shipped.map((entry) => ({ tag: entry.tag, applied: appliedWhen.has(entry.when) }))
  return { rows, appliedCount: applied.length, journalFound: shipped.length > 0 }
}
