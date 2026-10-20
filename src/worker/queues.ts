/**
 * Queue contract.
 *
 * Shared by both sides: the web app imports the `enqueue*` helpers, the worker
 * imports the names, schemas and settings. Keeping them in one file is what
 * stops a producer and a consumer drifting into disagreement about a payload
 * shape — a disagreement that shows up as a job failing in a background
 * process at 3am rather than as a type error.
 *
 * FOUR QUEUES, and no more:
 *
 *   email.send                every outbound transactional message
 *   pdf.itinerary             ALL Chromium work — itineraries and vouchers
 *   order.reconcile           payment truth-up, plus post-payment follow-ups
 *   capacity.release-expired  give the fleet back when a checkout dies
 *
 * Vouchers ride on `pdf.itinerary` rather than getting their own queue on
 * purpose. Two queues each capped at one concurrent job still permit two
 * simultaneous Chromium renders, and two renders is ~3 GiB on a 4 GiB box
 * shared with Postgres. One queue, one job, one Chromium.
 *
 * PAYLOADS ARE VALIDATED ON THE WAY OUT OF THE DATABASE. Job data is JSON in a
 * Postgres column; it survives deploys, so a job enqueued by the previous
 * release can be handled by the next one. `parse` at the handler boundary
 * turns that from a `TypeError` deep inside a template into a clean failure
 * with a readable message.
 */

import { PgBoss } from 'pg-boss'
import { z } from 'zod'

/**
 * pg-boss 12 exports the class as a NAMED export. `import PgBoss from
 * 'pg-boss'` was the v9 shape and is now `undefined` at runtime — an error
 * that surfaces as "PgBoss is not a constructor" on the first job.
 */

export const QUEUES = {
  email: 'email.send',
  pdf: 'pdf.itinerary',
  reconcile: 'order.reconcile',
  capacity: 'capacity.release-expired',
  securityPrune: 'security.prune',
  whatsapp: 'whatsapp.send',
  notifySweep: 'notify.sweep',
  /** Phase 4: task reminders and support escalation. */
  crmSweep: 'crm.sweep',

  /** Phase 5: server analytics events, ad-platform forwarding, retention, scheduled reports. */
  analytics: 'analytics.sweep',
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

export const QUEUE_NAMES: readonly QueueName[] = Object.values(QUEUES)

/**
 * Dead-letter queue for a queue.
 *
 * A job that exhausts its retries is copied here instead of vanishing. The
 * worker subscribes to every DLQ and logs the payload — see the
 * `deadLetterHandler` in `index.ts`. Silent loss is the failure mode this
 * exists to prevent: an order confirmation that is never sent looks exactly
 * like an order confirmation that was never requested.
 */
export function deadLetterQueue(name: QueueName): string {
  return `${name}.dlq`
}

/* --------------------------------------------------------------------------
   Payloads
   -------------------------------------------------------------------------- */

export const emailJobSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('welcome'),
    userId: z.uuid(),
    /**
     * Better Auth's verification callback. Optional because verification is
     * not currently required to sign in — see `emailAndPassword` in
     * `lib/auth/server.ts`.
     */
    verifyUrl: z.url().optional(),
  }),
  z.object({ kind: z.literal('order_confirmation'), orderId: z.uuid() }),
  z.object({ kind: z.literal('refund_notice'), orderId: z.uuid(), refundId: z.uuid().optional() }),
  /** Any row in `notifications` (src/lib/notify). */
  z.object({ kind: z.literal('notification'), notificationId: z.uuid() }),
])

export type EmailJob = z.infer<typeof emailJobSchema>

export const pdfJobSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('itinerary'),
    itineraryId: z.uuid(),
    /** Re-render locales that already exist for this version. */
    force: z.boolean().optional(),
  }),
  /** Scheduled: find published itineraries missing a document and fix them. */
  z.object({ kind: z.literal('itinerary_sweep') }),
  z.object({ kind: z.literal('voucher'), orderId: z.uuid() }),
  /** Phase 4: the invoice of a paid order (rendered once, then kept). */
  z.object({ kind: z.literal('invoice'), orderId: z.uuid() }),

  /** Phase 5: a report exported as PDF (row in `report_exports`). */
  z.object({ kind: z.literal('report'), exportId: z.uuid() }),
])

export type PdfJob = z.infer<typeof pdfJobSchema>

export const reconcileJobSchema = z.object({
  /** Omit to sweep every order that needs attention. */
  orderId: z.uuid().optional(),
})

export type ReconcileJob = z.infer<typeof reconcileJobSchema>

export const capacityJobSchema = z.object({
  /** How long a `pending` order may hold fleet capacity. */
  olderThanMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
})

export type CapacityJob = z.infer<typeof capacityJobSchema>

/** تنظيف سجل النشاط والتنبيهات المغلقة القديمة. */
export const securityPruneJobSchema = z.object({
  /** يتجاوز `ACTIVITY_RETENTION_DAYS` لتشغيل يدوي. */
  retentionDays: z.number().int().min(7).max(3650).optional(),
})

export type SecurityPruneJob = z.infer<typeof securityPruneJobSchema>

export const whatsappJobSchema = z.object({ notificationId: z.uuid() })
export type WhatsappJob = z.infer<typeof whatsappJobSchema>

/** Daily: plans that expire in the next few days get a reminder. */
export const notifySweepJobSchema = z.object({
  withinDays: z.number().int().min(1).max(30).optional(),
})
export type NotifySweepJob = z.infer<typeof notifySweepJobSchema>

/** Every 15 minutes: remind assignees of due tasks, escalate unanswered urgent tickets. */
export const crmSweepJobSchema = z.object({
  /** Overrides SUPPORT_ESCALATE_HOURS for a manual run. */
  escalateAfterHours: z.number().int().min(1).max(168).optional(),
})
export type CrmSweepJob = z.infer<typeof crmSweepJobSchema>

/**
 * Phase 5 analytics upkeep (all idempotent):
 *  - sync     every 10 minutes: server events from the database, purchases to
 *             the ad platforms' server APIs, abandoned checkout reminders;
 *  - prune    daily: delete event rows older than the retention setting;
 *  - reports  hourly: send the scheduled report emails that are due.
 */
export const analyticsJobSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('sync'),
    /** Look back this many days (default 3; the first run goes back a year). */
    days: z.number().int().min(1).max(800).optional(),
  }),
  z.object({ kind: z.literal('prune') }),
  z.object({ kind: z.literal('reports') }),
])
export type AnalyticsJob = z.infer<typeof analyticsJobSchema>

/* --------------------------------------------------------------------------
   Queue settings
   -------------------------------------------------------------------------- */

export interface QueueSettings {
  retryLimit: number
  retryDelay: number
  retryBackoff: boolean
  /**
   * OPTIONAL, and it must be OMITTED — not set to 0 — when `retryBackoff` is
   * false. pg-boss 12 asserts `retryDelayMax can only be set if retryBackoff
   * is true` and treats the key being *present* as "set", so a
   * `retryDelayMax: 0` alongside `retryBackoff: false` throws out of
   * `createQueue` and takes the whole worker down at boot.
   */
  retryDelayMax?: number
  /** How long a job may sit in `active` before it is considered abandoned. */
  expireInSeconds: number
  deleteAfterSeconds: number
}

const HOUR = 3600
const DAY = 24 * HOUR

export const QUEUE_SETTINGS: Record<QueueName, QueueSettings> = {
  /** يومي ومتساوي النتيجة عند التكرار؛ محاولتان تكفيان. */
  /** Meta outages are short; back off and give up after ~1h. */
  [QUEUES.whatsapp]: {
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
    retryDelayMax: HOUR,
    expireInSeconds: 120,
    deleteAfterSeconds: 7 * DAY,
  },

  [QUEUES.notifySweep]: {
    retryLimit: 2,
    retryDelay: 300,
    retryBackoff: false,
    expireInSeconds: 10 * 60,
    deleteAfterSeconds: 7 * DAY,
  },

  /** Idempotent; the next run picks up anything a failed one missed. */
  [QUEUES.analytics]: {
    retryLimit: 1,
    retryDelay: 120,
    retryBackoff: false,
    expireInSeconds: 10 * 60,
    deleteAfterSeconds: 3 * DAY,
  },

  [QUEUES.securityPrune]: {
    retryLimit: 2,
    retryDelay: 300,
    retryBackoff: false,
    expireInSeconds: 10 * 60,
    deleteAfterSeconds: 7 * DAY,
  },

  /** Idempotent (each task is reminded once, each ticket escalated once); the next run retries. */
  [QUEUES.crmSweep]: {
    retryLimit: 1,
    retryDelay: 120,
    retryBackoff: false,
    expireInSeconds: 5 * 60,
    deleteAfterSeconds: 3 * DAY,
  },

  /**
   * Mail. Provider outages are measured in minutes, so back off rather than
   * hammering: 30s, 60s, 120s, 240s, 480s. Five attempts spans ~15 minutes,
   * which covers a Resend blip without holding a job for a day.
   */
  [QUEUES.email]: {
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    retryDelayMax: HOUR,
    expireInSeconds: 120,
    deleteAfterSeconds: 7 * DAY,
  },

  /**
   * Chromium. Generous expiry because a cold sidecar plus a 14-day itinerary
   * in three locales is genuinely slow, and a job killed mid-render leaves a
   * half-uploaded object.
   */
  [QUEUES.pdf]: {
    retryLimit: 4,
    retryDelay: 60,
    retryBackoff: true,
    retryDelayMax: 30 * 60,
    expireInSeconds: 15 * 60,
    deleteAfterSeconds: 14 * DAY,
  },

  /**
   * Reconciliation is idempotent and re-runs on a schedule anyway, so a
   * failure here is not urgent — three tries and let the next sweep pick it
   * up.
   */
  [QUEUES.reconcile]: {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    retryDelayMax: 15 * 60,
    expireInSeconds: 5 * 60,
    deleteAfterSeconds: 7 * DAY,
  },

  [QUEUES.capacity]: {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    retryDelayMax: 15 * 60,
    expireInSeconds: 5 * 60,
    deleteAfterSeconds: 7 * DAY,
  },
}

/**
 * Dead letters are kept for a month and never retried automatically. Whatever
 * put them there needs a human, and a month is long enough to survive a
 * holiday.
 */
const DEAD_LETTER_SETTINGS: QueueSettings = {
  retryLimit: 0,
  retryDelay: 0,
  retryBackoff: false,
  // No retryDelayMax: see the note on QueueSettings. Nothing here is ever
  // retried, so a ceiling on the backoff would be meaningless even if
  // pg-boss accepted it.
  expireInSeconds: 5 * 60,
  deleteAfterSeconds: 30 * DAY,
}

/**
 * Create every queue and bring its settings up to date.
 *
 * `create_queue` is `ON CONFLICT DO NOTHING`, so it will not change the
 * settings of a queue that already exists — which would silently pin the
 * retry policy to whatever the very first deploy used. `updateQueue`
 * afterwards makes this file the source of truth on every boot.
 *
 * Dead-letter queues are created first: a queue cannot reference one that does
 * not exist yet.
 */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of QUEUE_NAMES) {
    const dlq = deadLetterQueue(name)
    await boss.createQueue(dlq, DEAD_LETTER_SETTINGS)
    await boss.updateQueue(dlq, DEAD_LETTER_SETTINGS)
  }

  for (const name of QUEUE_NAMES) {
    const settings = { ...QUEUE_SETTINGS[name], deadLetter: deadLetterQueue(name) }
    await boss.createQueue(name, settings)
    await boss.updateQueue(name, settings)
  }
}

/* --------------------------------------------------------------------------
   Producer
   -------------------------------------------------------------------------- */

export interface BossOptions {
  /** Shows up in `pg_stat_activity`, which is how you tell them apart. */
  applicationName: string
  /** Producers do no maintenance and run no schedules. */
  role: 'producer' | 'worker'
}

export function createBoss(options: BossOptions): PgBoss {
  const connectionString = process.env.DATABASE_URL
  if (connectionString === undefined || connectionString === '') {
    throw new Error('DATABASE_URL is not set — the job queue lives in Postgres')
  }

  return new PgBoss({
    connectionString,
    application_name: options.applicationName,
    /**
     * Small pools on purpose. Postgres shares 4 GiB with Next, the worker and
     * Chromium, and every backend costs memory. A producer needs one
     * connection to insert a row.
     */
    max: options.role === 'worker' ? 4 : 2,
    // Only the worker runs maintenance, archiving and cron. A web replica
    // doing it too would multiply the load by the replica count for no gain.
    supervise: options.role === 'worker',
    schedule: options.role === 'worker',
    /**
     * Both roles may migrate. pg-boss takes an advisory lock around its
     * migration, so concurrent starts serialise safely — and a producer that
     * refused to install the schema would make `pnpm dev` fail whenever the
     * worker had not been started yet.
     */
    migrate: true,
  })
}

let producer: PgBoss | null = null
let producerStarting: Promise<PgBoss> | null = null

/**
 * The shared producer, started lazily on first use.
 *
 * Lazy because most requests never enqueue anything, and paying for a pool
 * plus a schema check on every cold start of the web process would be a tax
 * on page loads that have nothing to do with jobs.
 */
export async function getBoss(): Promise<PgBoss> {
  if (producer !== null) return producer
  if (producerStarting !== null) return producerStarting

  producerStarting = (async () => {
    const instance = createBoss({ applicationName: 'bali-producer', role: 'producer' })
    // Without a listener, pg-boss's EventEmitter throws on 'error' and takes
    // the process with it.
    instance.on('error', (error) => console.error('[queue] producer error', error))
    await instance.start()
    await ensureQueues(instance)
    producer = instance
    return instance
  })()

  try {
    return await producerStarting
  } catch (error) {
    // Let the next caller try again rather than caching a dead instance.
    producerStarting = null
    throw error
  }
}

/** For a graceful shutdown of a process that only produces. */
export async function stopBoss(): Promise<void> {
  const instance = producer
  producer = null
  producerStarting = null
  if (instance !== null) await instance.stop({ graceful: true, close: true })
}

/* --------------------------------------------------------------------------
   Enqueue helpers
   -------------------------------------------------------------------------- */

/**
 * Enqueue, never throw.
 *
 * Callers are request handlers and webhook endpoints. A queue that is briefly
 * unreachable must not turn a successful payment into a 500 — the scheduled
 * reconcile sweep finds anything that was missed, which is precisely why that
 * sweep exists. The failure is logged loudly and the caller carries on.
 */
async function enqueue(
  name: QueueName,
  data: object,
  options: Parameters<PgBoss['send']>[2] = {},
): Promise<string | null> {
  try {
    const boss = await getBoss()
    return await boss.send(name, data, options)
  } catch (error) {
    console.error('[queue] could not enqueue', { queue: name, data, error })
    return null
  }
}

export async function enqueueEmail(job: EmailJob): Promise<string | null> {
  return enqueue(QUEUES.email, job)
}

export async function enqueueWhatsapp(job: WhatsappJob): Promise<string | null> {
  return enqueue(QUEUES.whatsapp, job)
}

/**
 * Enqueue Chromium work.
 *
 * Every PDF job carries the same group id. `groupConcurrency: 1` on the worker
 * turns that into a CLUSTER-WIDE guarantee of one render at a time — stronger
 * than `localConcurrency`, which only constrains a single process and would
 * let two workers each start a 1.5 GiB render.
 */
export async function enqueuePdf(job: PdfJob): Promise<string | null> {
  return enqueue(QUEUES.pdf, job, { group: { id: 'chromium' } })
}

/**
 * Render an itinerary's PDFs. Call this from the admin publish action.
 *
 * Safe to call more than once: the handler skips locales that already have a
 * document for the current version.
 */
export async function enqueueItineraryPdf(
  itineraryId: string,
  force = false,
): Promise<string | null> {
  return enqueuePdf({ kind: 'itinerary', itineraryId, ...(force ? { force: true } : {}) })
}

export async function enqueueVoucherPdf(orderId: string): Promise<string | null> {
  return enqueuePdf({ kind: 'voucher', orderId })
}

export async function enqueueInvoicePdf(orderId: string): Promise<string | null> {
  return enqueuePdf({ kind: 'invoice', orderId })
}

export async function enqueueReportPdf(exportId: string): Promise<string | null> {
  return enqueuePdf({ kind: 'report', exportId })
}

export async function enqueueAnalytics(job: AnalyticsJob): Promise<string | null> {
  return enqueue(QUEUES.analytics, job)
}

export async function enqueueReconcile(job: ReconcileJob = {}): Promise<string | null> {
  return enqueue(QUEUES.reconcile, job)
}

export async function enqueueCapacityRelease(job: CapacityJob = {}): Promise<string | null> {
  return enqueue(QUEUES.capacity, job)
}
