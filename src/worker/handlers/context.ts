/**
 * What a handler may do to the world beyond its own database transaction.
 *
 * Two handlers need to enqueue further work: the PDF sweep discovers
 * itineraries with missing documents and turns each into its own render job,
 * and reconcile hands post-payment follow-ups to the queues that own them.
 *
 * They do NOT reach for the `enqueue*` helpers in `../queues`. Those helpers
 * are the WEB app's producer: they lazily construct a second `PgBoss` with
 * its own connection pool. Inside the worker that would mean two pools, two
 * schema checks and two `error` listeners in one process, for jobs the boss
 * already sitting in memory can insert directly. The context is passed in
 * from `index.ts` instead, bound to the worker's own instance.
 *
 * It is also the seam that makes the handlers testable without a queue at
 * all — a fake context records what would have been enqueued.
 */

import type { EmailJob, PdfJob } from '../queues'

export interface EnqueueOptions {
  /**
   * Collapse repeats: at most one job with this key is created per window.
   *
   * The sweeps re-run every few minutes and decide what to enqueue from
   * durable state — an audit row, a missing document. That state does not
   * change until the job they just enqueued actually FINISHES, so without a
   * throttle a five-minute sweep would queue the same voucher render twelve
   * times an hour while the first one is still waiting for Chromium.
   */
  throttleKey?: string
  throttleSeconds?: number
}

export interface WorkerContext {
  /** Returns the new job id, or null when throttled or the insert failed. */
  enqueueEmail(job: EmailJob, options?: EnqueueOptions): Promise<string | null>
  enqueuePdf(job: PdfJob, options?: EnqueueOptions): Promise<string | null>
}
