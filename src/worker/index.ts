/**
 * The background worker.
 *
 * One long-lived Node process next to the web app. It owns everything that
 * must not happen inside a request: sending mail, driving Chromium, truing up
 * payments against the provider, and handing fleet capacity back when a
 * checkout dies. `pnpm worker` runs it; on the droplet it is a second
 * container against the same database.
 *
 * FOUR THINGS THIS FILE IS RESPONSIBLE FOR
 *
 * 1. Refusing to start when it is misconfigured. A worker that boots without
 *    `DATABASE_URL` and dies on its first job fails ten minutes later, in a
 *    log nobody is reading, with an error about a connection string that says
 *    nothing about the deploy that caused it. The check is up front, it names
 *    the variable, and it says which queue stops working without it.
 *
 * 2. One Chromium at a time. `pdf.itinerary` runs at `localConcurrency: 1`,
 *    and every PDF job is enqueued into the same `chromium` group with
 *    `groupConcurrency: 1` so the cap holds across processes as well as
 *    within one. A render peaks around 1.5 GiB; the droplet has 4 GiB shared
 *    with Postgres, and the OOM killer picks the biggest resident process,
 *    which is Postgres. Two renders at once is a database outage.
 *
 * 3. Shutting down without losing work. SIGTERM stops the pollers, lets
 *    whatever is mid-flight finish inside a timeout, and only then closes the
 *    pool. Anything still running when the timeout expires is failed back to
 *    the queue by pg-boss so it is retried rather than silently lost — and
 *    that is the one shutdown that exits non-zero, because a container that
 *    was killed mid-render is a fact the orchestrator should see.
 *
 * 4. Never dropping a payload. A job that exhausts its retries is copied to
 *    its queue's dead-letter queue, which this worker also subscribes to, and
 *    the handler LOGS the payload. An order confirmation that vanished looks
 *    exactly like one that was never requested; the log is the difference.
 */

// THESE TWO IMPORTS MUST COME FIRST, IN THIS ORDER, AND NOTHING MAY BE MOVED
// ABOVE THEM. Both do their work as an import side effect: `./env` loads
// .env.local, then `./config` validates what it found and exits if the
// process cannot possibly work. Imports are evaluated in declaration order,
// and `@/db` throws at module scope when DATABASE_URL is unset — so anything
// below reaching it would die first, with a stack trace about a postgres
// client instead of the message naming the variable. Verified by running the
// worker with DATABASE_URL blank: it must print the settings list, not a
// `new postgres()` stack.
import { LOADED_ENV_FILES } from './env'
import { DEGRADED_QUEUES, EMAIL_CONCURRENCY, RUN_SCHEDULES, SHUTDOWN_TIMEOUT_MS } from './config'

import type { Job, JobResult, JobWithMetadata, PgBoss, WorkOptions } from 'pg-boss'

import { gotenbergHealthy, gotenbergUrl } from '@/lib/pdf'
import { isPrivateStorageAvailable } from '@/lib/storage'

import { handleCapacityJob } from './handlers/capacity'
import { handleNotifySweep, handleWhatsappJob } from './handlers/notify'
import { handleSecurityPruneJob } from './handlers/security'
import type { EnqueueOptions, WorkerContext } from './handlers/context'
import { handleEmailJob } from './handlers/email'
import { handlePdfJob } from './handlers/pdf'
import { handleReconcileJob } from './handlers/reconcile'
import {
  capacityJobSchema,
  securityPruneJobSchema,
  notifySweepJobSchema,
  whatsappJobSchema,
  createBoss,
  deadLetterQueue,
  emailJobSchema,
  ensureQueues,
  pdfJobSchema,
  QUEUE_NAMES,
  QUEUES,
  reconcileJobSchema,
  type PdfJob,
  type QueueName,
} from './queues'
import { liveModeWarnings } from '@/lib/live-mode'

/** Shows up in `pg_stat_activity`, which is how you tell the roles apart. */
const APPLICATION_NAME = 'bali-worker'

/* --------------------------------------------------------------------------
   Queue registration
   -------------------------------------------------------------------------- */

/**
 * `perJobResults` is on everywhere so a handler can settle its job precisely:
 * a payload the schema rejects goes STRAIGHT to the dead-letter queue instead
 * of burning four retries and half an hour of backoff to reach the same
 * answer, because no amount of retrying makes an invalid payload valid.
 */
type PerJobOptions = WorkOptions & { perJobResults: true }

const WORK_OPTIONS: Record<QueueName, PerJobOptions> = {
  [QUEUES.whatsapp]: {
    perJobResults: true,
    batchSize: 1,
    localConcurrency: 2,
    pollingIntervalSeconds: 5,
  },
  [QUEUES.notifySweep]: {
    perJobResults: true,
    batchSize: 1,
    localConcurrency: 1,
    pollingIntervalSeconds: 30,
  },

  [QUEUES.securityPrune]: {
    perJobResults: true,
    batchSize: 1,
    localConcurrency: 1,
    pollingIntervalSeconds: 30,
  },

  [QUEUES.email]: {
    perJobResults: true,
    batchSize: 1,
    localConcurrency: EMAIL_CONCURRENCY,
    pollingIntervalSeconds: 2,
  },

  /**
   * THE MEMORY CAP. `localConcurrency: 1` is one render per process;
   * `groupConcurrency: 1` makes it one render per CLUSTER, because every PDF
   * job is enqueued with `group: { id: 'chromium' }`. Local alone would let a
   * second replica start its own 1.5 GiB render against the same 4 GiB box.
   * Ungrouped jobs are unaffected by the group cap, so the group id on the
   * producer side is not optional — see `enqueuePdf` in ./queues.
   */
  [QUEUES.pdf]: {
    perJobResults: true,
    batchSize: 1,
    localConcurrency: 1,
    groupConcurrency: 1,
    pollingIntervalSeconds: 5,
  },

  [QUEUES.reconcile]: {
    perJobResults: true,
    batchSize: 1,
    localConcurrency: 1,
    pollingIntervalSeconds: 5,
  },

  [QUEUES.capacity]: {
    perJobResults: true,
    batchSize: 1,
    localConcurrency: 1,
    pollingIntervalSeconds: 10,
  },
}

interface InFlight {
  queue: string
  jobId: string
  startedAt: number
}

/**
 * What is running right now.
 *
 * pg-boss's own graceful stop waits for these, but it does not tell us
 * whether it succeeded — and "the deploy killed a render halfway" is exactly
 * the thing the exit code should carry.
 */
const inFlight = new Map<string, InFlight>()

interface Described {
  name: string
  message: string
  stack?: string
}

/**
 * Not every thrown thing is an `Error`.
 *
 * pg-boss emits its `error` event with a PLAIN OBJECT — it spreads the
 * original and re-attaches `message` and `stack` — so `String(value)` on it
 * produces the literal text `[object Object]` and the log says nothing at
 * all. That is the exact failure this function exists to prevent, and it was
 * observed during a shutdown test before the object branch was added.
 */
function describeError(error: unknown): Described {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    }
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    return {
      name: typeof record.name === 'string' ? record.name : 'NonError',
      message: typeof record.message === 'string' ? record.message : safeJson(error),
      ...(typeof record.stack === 'string' ? { stack: record.stack } : {}),
    }
  }

  return { name: 'NonError', message: String(error) }
}

/** JSON that cannot itself throw — a cyclic payload must not hide the error. */
function safeJson(value: unknown): string {
  try {
    const seen = new WeakSet<object>()
    return JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item !== 'object' || item === null) return item
      if (seen.has(item)) return '[circular]'
      seen.add(item)
      return item
    })
  } catch {
    return String(value)
  }
}

interface PayloadSchema<T> {
  parse(data: unknown): T
}

/**
 * Run one job and say how it ended.
 *
 * Payloads are parsed HERE rather than trusted, because job data is JSON in a
 * Postgres column: it outlives the release that wrote it, so a job enqueued
 * by the previous deploy can be handed to the next one. Validating at the
 * boundary turns that into a clean dead-letter with a readable message
 * instead of a TypeError from somewhere deep inside a template.
 */
async function settle<T>(
  queue: QueueName,
  job: Job<unknown>,
  schema: PayloadSchema<T>,
  run: (payload: T) => Promise<unknown>,
): Promise<JobResult> {
  let payload: T
  try {
    payload = schema.parse(job.data)
  } catch (error) {
    console.error('[worker] payload does not match the queue contract; dead-lettering it', {
      queue,
      jobId: job.id,
      data: job.data,
      error: describeError(error),
    })
    return {
      id: job.id,
      status: 'deadletter',
      output: { reason: 'invalid_payload', error: describeError(error) },
    }
  }

  const key = `${queue}#${job.id}`
  const startedAt = Date.now()
  inFlight.set(key, { queue, jobId: job.id, startedAt })

  try {
    const output = await run(payload)
    console.info('[worker] completed', {
      queue,
      jobId: job.id,
      ms: Date.now() - startedAt,
      ...(output === undefined || output === null ? {} : { output }),
    })
    return {
      id: job.id,
      status: 'completed',
      output: output === undefined ? null : output,
    }
  } catch (error) {
    // Returned rather than thrown: throwing fails the whole batch, and this
    // job's own failure detail is what the dead-letter log needs to be useful.
    console.error('[worker] job failed; pg-boss will apply the retry policy', {
      queue,
      jobId: job.id,
      ms: Date.now() - startedAt,
      error: describeError(error),
    })
    return { id: job.id, status: 'failed', output: describeError(error) }
  } finally {
    inFlight.delete(key)
  }
}

async function register<T>(
  boss: PgBoss,
  queue: QueueName,
  schema: PayloadSchema<T>,
  run: (payload: T) => Promise<unknown>,
): Promise<void> {
  const options = WORK_OPTIONS[queue]

  await boss.work(queue, options, async (jobs: Job<unknown>[]) => {
    const results: JobResult[] = []
    for (const job of jobs) {
      results.push(await settle(queue, job, schema, run))
    }
    return results
  })

  console.info('[worker] listening', { queue, options })
}

/**
 * The dead-letter subscriber.
 *
 * This is the whole reason the queues declare a dead letter: a job that has
 * exhausted its retries would otherwise sit in a table nobody queries, which
 * is indistinguishable from having been dropped. The payload is logged in
 * full — it is the only remaining copy of what the customer was owed, and
 * whoever is on call needs enough to re-enqueue it by hand.
 *
 * It never throws. A dead-letter queue has no retries and no dead letter of
 * its own, so a throw here really would be the end of the trail.
 */
async function registerDeadLetters(boss: PgBoss): Promise<void> {
  for (const source of QUEUE_NAMES) {
    const dlq = deadLetterQueue(source)

    await boss.work(
      dlq,
      { includeMetadata: true, batchSize: 10, localConcurrency: 1, pollingIntervalSeconds: 30 },
      async (jobs: JobWithMetadata<unknown>[]) => {
        for (const job of jobs) {
          console.error('[worker] DEAD LETTER — this job will not run again without a human', {
            deadLetterQueue: dlq,
            sourceQueue: job.sourceName ?? source,
            sourceJobId: job.sourceId,
            retriesConsumed: job.sourceRetryCount,
            enqueuedAt: job.sourceCreatedOn ?? job.createdOn,
            payload: job.data,
            lastFailure: job.output,
          })
        }
      },
    )
  }

  console.info('[worker] listening on dead-letter queues', {
    queues: QUEUE_NAMES.map(deadLetterQueue),
  })
}

/* --------------------------------------------------------------------------
   Schedules
   -------------------------------------------------------------------------- */

interface ScheduleSpec {
  queue: QueueName
  cron: string
  data: object
  options?: Parameters<PgBoss['schedule']>[3]
}

/**
 * The self-healing part.
 *
 * Every producer in the web app enqueues on a best-effort basis and swallows
 * the failure, precisely because a queue blip must not turn a settled payment
 * into a 500. These sweeps are what makes that safe: they ask the database
 * what is actually missing rather than trusting that every enqueue succeeded.
 *
 * UTC on purpose. These are intervals, not office hours, and pinning the
 * timezone keeps them from shifting under a daylight-saving change.
 */
const SCHEDULES: readonly ScheduleSpec[] = [
  {
    // 09:07 Bali time (01:07 UTC): plan-expiry reminders arrive in the morning.
    queue: QUEUES.notifySweep,
    cron: '7 1 * * *',
    data: {},
    options: { tz: 'Etc/UTC' },
  },
  {
    // يومياً 03:17 UTC — خارج ذروة بالي (UTC+8).
    queue: QUEUES.securityPrune,
    cron: '17 3 * * *',
    data: {},
    options: { tz: 'Etc/UTC' },
  },
  {
    queue: QUEUES.reconcile,
    cron: '*/5 * * * *',
    data: {},
    options: { tz: 'Etc/UTC' },
  },
  {
    queue: QUEUES.capacity,
    cron: '*/10 * * * *',
    data: {},
    options: { tz: 'Etc/UTC' },
  },
  {
    queue: QUEUES.pdf,
    cron: '25 * * * *',
    // Hourly, not every few minutes: the sweep only finds work after a
    // publish that failed to render, and it fans out into Chromium jobs.
    data: { kind: 'itinerary_sweep' } satisfies PdfJob,
    // The group id, so a scheduled sweep counts against the same cluster-wide
    // Chromium cap as everything else on this queue.
    options: { tz: 'Etc/UTC', group: { id: 'chromium' } },
  },
]

/**
 * No `singletonKey` here, deliberately.
 *
 * It would read like a guard against two replicas both firing the same cron
 * minute, and it is not one: these queues use the `standard` policy, under
 * which a singleton key without `singletonSeconds` is an inert label. The
 * real guard is inside pg-boss — the timekeeper enqueues each cron tick onto
 * its own internal queue with `singletonSeconds: 60`, so only one replica's
 * tick survives. A key here would be config that implies a promise nothing
 * keeps.
 */

async function registerSchedules(boss: PgBoss): Promise<void> {
  if (!RUN_SCHEDULES) {
    console.warn('[worker] schedules are disabled (WORKER_SCHEDULES=false)')
    return
  }

  for (const spec of SCHEDULES) {
    await boss.schedule(spec.queue, spec.cron, spec.data, spec.options)
  }

  console.info(
    '[worker] schedules registered',
    SCHEDULES.map((spec) => `${spec.queue} @ ${spec.cron}`),
  )
}

/* --------------------------------------------------------------------------
   Handler context
   -------------------------------------------------------------------------- */

/**
 * Bound to the worker's OWN boss.
 *
 * Not the `enqueue*` helpers in ./queues: those lazily build a second PgBoss
 * with its own pool, which inside this process would mean two pools and two
 * schema checks for jobs the instance already in memory can insert directly.
 */
function createContext(boss: PgBoss): WorkerContext {
  async function send(
    queue: QueueName,
    data: object,
    sendOptions: object,
    enqueueOptions: EnqueueOptions | undefined,
  ): Promise<string | null> {
    try {
      if (
        enqueueOptions?.throttleKey !== undefined &&
        enqueueOptions.throttleSeconds !== undefined
      ) {
        // Returns null when a job with this key was created inside the
        // window — which is the point: the sweeps re-decide from durable
        // state that has not changed yet.
        return await boss.sendThrottled(
          queue,
          data,
          sendOptions,
          enqueueOptions.throttleSeconds,
          enqueueOptions.throttleKey,
        )
      }
      return await boss.send(queue, data, sendOptions)
    } catch (error) {
      // A handler that could not fan out has still done its own work; the
      // next scheduled sweep will try again.
      console.error('[worker] could not enqueue follow-up work', { queue, data, error })
      return null
    }
  }

  return {
    enqueueEmail: (job, options) => send(QUEUES.email, job, {}, options),
    // Every PDF job carries the chromium group id, which is what makes
    // `groupConcurrency: 1` a cluster-wide cap rather than a local one.
    enqueuePdf: (job, options) => send(QUEUES.pdf, job, { group: { id: 'chromium' } }, options),
  }
}

/* --------------------------------------------------------------------------
   Shutdown
   -------------------------------------------------------------------------- */

let shuttingDown = false

async function shutdown(boss: PgBoss, reason: string): Promise<void> {
  if (shuttingDown) {
    console.warn(`[worker] already shutting down; ignoring ${reason}`)
    return
  }
  shuttingDown = true

  const startedAt = Date.now()
  console.info(`[worker] ${reason} — draining`, {
    inFlight: [...inFlight.values()].map((job) => `${job.queue}#${job.jobId}`),
    timeoutMs: SHUTDOWN_TIMEOUT_MS,
  })

  let exitCode = 0

  try {
    // graceful: stop the pollers first, then wait for what is already running.
    // close: release the pool afterwards so the process can actually exit.
    await boss.stop({ graceful: true, close: true, timeout: SHUTDOWN_TIMEOUT_MS })
  } catch (error) {
    console.error('[worker] shutdown failed', describeError(error))
    exitCode = 1
  }

  if (inFlight.size > 0) {
    // pg-boss has failed these back to the queue, so they will be retried —
    // but a job killed mid-flight may have left half its work done, and the
    // orchestrator should not record this as a clean stop.
    console.error('[worker] the grace period expired with jobs still running', {
      abandoned: [...inFlight.values()].map((job) => ({
        queue: job.queue,
        jobId: job.jobId,
        runningForMs: Date.now() - job.startedAt,
      })),
    })
    exitCode = 1
  }

  console.info('[worker] stopped', { ms: Date.now() - startedAt, exitCode })
  process.exit(exitCode)
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  for (const warning of liveModeWarnings()) console.error(`[worker] LIVE_MODE config: ${warning}`)
  // The environment was already checked, and a fatal gap already exited the
  // process, while `./config` was being imported. See the note there.
  const boss = createBoss({ applicationName: APPLICATION_NAME, role: 'worker' })

  // Without a listener pg-boss's EventEmitter throws on 'error' and takes the
  // process down — a transient query failure inside maintenance would kill a
  // worker that is otherwise healthy.
  boss.on('error', (error) => console.error('[worker] pg-boss error', describeError(error)))
  boss.on('warning', (warning) => console.warn('[worker] pg-boss warning', warning))

  // `migrate` and `createSchema` are both on (see ./queues), so this installs
  // the pgboss schema on a fresh database and migrates it on an existing one,
  // under an advisory lock so two workers starting together serialise.
  await boss.start()
  await ensureQueues(boss)

  console.info('[worker] connected', {
    envFiles: LOADED_ENV_FILES,
    schemaVersion: await boss.schemaVersion(),
    queues: [...QUEUE_NAMES],
  })

  const context = createContext(boss)

  await register(boss, QUEUES.email, emailJobSchema, (job) => handleEmailJob(job))
  await register(boss, QUEUES.pdf, pdfJobSchema, (job) => handlePdfJob(job, context))
  await register(boss, QUEUES.reconcile, reconcileJobSchema, (job) =>
    handleReconcileJob(job, context),
  )
  await register(boss, QUEUES.capacity, capacityJobSchema, (job) => handleCapacityJob(job))
  await register(boss, QUEUES.whatsapp, whatsappJobSchema, (job) => handleWhatsappJob(job))
  await register(boss, QUEUES.notifySweep, notifySweepJobSchema, (job) => handleNotifySweep(job))
  await register(boss, QUEUES.securityPrune, securityPruneJobSchema, (job) =>
    handleSecurityPruneJob(job),
  )

  await registerDeadLetters(boss)
  await registerSchedules(boss)

  // Diagnostics, not gates. The queue is the right place to discover that
  // Gotenberg is down — the job retries with backoff and the sweep repairs
  // whatever was missed — but saying so at boot turns a confusing afternoon
  // of dead-letters into one obvious line.
  if (!DEGRADED_QUEUES.has(QUEUES.pdf)) {
    const healthy = await gotenbergHealthy()
    if (!healthy) {
      console.warn(`[worker] Gotenberg is not answering at ${gotenbergUrl()}; PDF jobs will retry`)
    }
    if (!isPrivateStorageAvailable()) {
      console.warn(
        '[worker] neither object storage nor PRIVATE_STORAGE_DIR is configured; rendered PDFs have nowhere to go',
      )
    }
  }

  process.once('SIGTERM', () => void shutdown(boss, 'SIGTERM'))
  process.once('SIGINT', () => void shutdown(boss, 'SIGINT'))

  // A worker whose state is unknown should die and be restarted, loudly,
  // rather than keep claiming jobs it may not be able to finish.
  process.on('uncaughtException', (error) => {
    console.error('[worker] uncaught exception', describeError(error))
    void shutdown(boss, 'uncaught exception').finally(() => process.exit(1))
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[worker] unhandled rejection', describeError(reason))
    void shutdown(boss, 'unhandled rejection').finally(() => process.exit(1))
  })

  console.info('[worker] ready')
}

main().catch((error) => {
  console.error('[worker] failed to start', describeError(error))
  process.exit(1)
})
