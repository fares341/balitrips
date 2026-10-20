/**
 * Phase 6: background job monitor (pg-boss) for Studio → System health.
 *
 * Counts come from pg-boss itself (`getQueues`); the lists of failed and
 * dead-lettered jobs read `pgboss.job` directly, because pg-boss's own finder
 * returns every retained job of a queue (a week of e-mails) with no limit.
 *
 * Dead letters are consumed by the worker's logger (src/worker/index.ts), so
 * pg-boss's `redrive` — which only moves unconsumed ones — does not apply.
 * "Run again" therefore sends the stored payload back to its source queue and
 * deletes the dead letter, in that order: a crash in between leaves a
 * duplicate dead letter, never a lost job.
 */

import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { deadLetterQueue, getBoss, QUEUE_NAMES, type QueueName } from '@/worker/queues'

export interface QueueRow {
  name: string
  isDeadLetter: boolean
  ready: number
  deferred: number
  active: number
  failed: number
  total: number
}

export async function queueOverview(): Promise<QueueRow[]> {
  const boss = await getBoss()
  const queues = await boss.getQueues()
  const known = new Set<string>([...QUEUE_NAMES, ...QUEUE_NAMES.map(deadLetterQueue)])
  return queues
    .filter((queue) => known.has(queue.name))
    .map((queue) => ({
      name: queue.name,
      isDeadLetter: queue.name.endsWith('.dlq'),
      ready: queue.readyCount,
      deferred: queue.deferredCount,
      active: queue.activeCount,
      failed: queue.failedCount,
      total: queue.totalCount,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface JobRow {
  id: string
  name: string
  state: string
  retryCount: number
  createdOn: Date
  completedOn: Date | null
  sourceName: string | null
  /** The last failure's message (from `output`), scrubbed by the caller for display. */
  error: string | null
}

function errorOf(output: unknown): string | null {
  if (output === null || output === undefined) return null
  if (typeof output === 'object') {
    const record = output as Record<string, unknown>
    if (typeof record.message === 'string') return record.message
    const nested = record.error as Record<string, unknown> | undefined
    if (nested && typeof nested.message === 'string') return nested.message
    if (typeof record.reason === 'string') return record.reason
  }
  return String(output).slice(0, 300)
}

/** Recent failed jobs (after all retries) and dead letters. */
export async function problemJobs(limit = 50): Promise<{ failed: JobRow[]; dead: JobRow[] }> {
  // Starting the producer installs pg-boss's schema on a database where no
  // worker has run yet, so the query below always has a table to read.
  await getBoss()
  const dlqs = QUEUE_NAMES.map(deadLetterQueue)
  const rows = await db.execute<{
    id: string
    name: string
    state: string
    retry_count: number
    created_on: string | Date
    completed_on: string | Date | null
    source_name: string | null
    output: unknown
  }>(sql`
    (select id, name, state::text as state, retry_count, created_on, completed_on, source_name, output
       from pgboss.job
      where state = 'failed' and name in ${[...QUEUE_NAMES]}
      order by completed_on desc nulls last
      limit ${limit})
    union all
    (select id, name, state::text as state, retry_count, created_on, completed_on, source_name, output
       from pgboss.job
      where name in ${dlqs}
      order by created_on desc
      limit ${limit})
  `)
  const mapped = rows.map(
    (row): JobRow => ({
      id: row.id,
      name: row.name,
      state: row.state,
      retryCount: Number(row.retry_count),
      createdOn: new Date(row.created_on),
      completedOn: row.completed_on ? new Date(row.completed_on) : null,
      sourceName: row.source_name,
      error: errorOf(row.output),
    }),
  )
  return {
    failed: mapped.filter((row) => !row.name.endsWith('.dlq')),
    dead: mapped.filter((row) => row.name.endsWith('.dlq')),
  }
}

function sourceOf(deadLetter: string): QueueName | null {
  const source = deadLetter.replace(/\.dlq$/, '')
  return (QUEUE_NAMES as readonly string[]).includes(source) ? (source as QueueName) : null
}

/** Run a dead-lettered job again on its source queue, then drop the dead letter. */
export async function retryDeadLetter(deadLetter: string, id: string): Promise<boolean> {
  const source = sourceOf(deadLetter)
  if (source === null) return false
  const rows = await db.execute<{ data: unknown }>(sql`
    select data from pgboss.job where name = ${deadLetter} and id = ${id} limit 1
  `)
  const row = rows[0]
  if (!row) return false
  const boss = await getBoss()
  const data = typeof row.data === 'object' && row.data !== null ? row.data : {}
  const options = source === 'pdf.itinerary' ? { group: { id: 'chromium' } } : {}
  const sent = await boss.send(source, data as object, options)
  if (sent === null) return false
  await boss.deleteJob(deadLetter, id)
  return true
}

export async function deleteDeadLetter(deadLetter: string, id: string): Promise<boolean> {
  if (sourceOf(deadLetter) === null) return false
  const boss = await getBoss()
  await boss.deleteJob(deadLetter, id)
  return true
}

/** Put a failed job back in its queue (pg-boss `retry`). */
export async function retryFailedJob(queue: string, id: string): Promise<boolean> {
  if (!(QUEUE_NAMES as readonly string[]).includes(queue)) return false
  const boss = await getBoss()
  await boss.retry(queue, id)
  return true
}

/** Dead letters created since `since` (for alerts). */
export async function deadLettersSince(since: Date): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from pgboss.job
     where name in ${QUEUE_NAMES.map(deadLetterQueue)} and created_on > ${since.toISOString()}::timestamptz
  `)
  return Number(rows[0]?.n ?? 0)
}
