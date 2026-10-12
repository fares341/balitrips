/**
 * `pdf.itinerary` handler — ALL Chromium work.
 *
 * Itineraries and vouchers share this one queue, and `index.ts` caps it at a
 * single concurrent job. A render peaks around 1.5 GiB inside the sidecar and
 * the droplet's 4 GiB are shared with Postgres; two at once is how a PDF
 * download becomes a database outage.
 *
 * The sweep DISCOVERS work, it does not do it. `itinerariesMissingDocuments`
 * can legitimately return 25 itineraries after Gotenberg has been down for an
 * afternoon, and rendering 25 × 3 locales inside one job would blow through
 * the queue's 15-minute expiry, be killed mid-render, retried from the start,
 * and killed again. Enqueuing one job per itinerary makes each unit small
 * enough to finish, and the cap still guarantees one Chromium at a time.
 */

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { auditLog, orders } from '@/db/schema'
import {
  generateItineraryDocuments,
  generateOrderVoucher,
  itinerariesMissingDocuments,
} from '@/lib/pdf'

import type { PdfJob } from '../queues'
import type { WorkerContext } from './context'

/**
 * Durable proof a voucher exists.
 *
 * There is no `order_documents` table — the object key IS the record, and
 * adding a table is not this slice's to do. But reconcile has to answer "does
 * this order already have a voucher?" without reaching into object storage on
 * every sweep, so the answer is written to `audit_log`, which already exists
 * for exactly this and gives support a straight answer to "was it issued?".
 */
export const VOUCHER_AUDIT_ACTION = 'pdf.voucher'

/** How many itineraries one sweep will fan out. */
const SWEEP_LIMIT = 25

/**
 * Statuses a voucher may be issued for.
 *
 * Mirrors the set inside `lib/pdf/voucher.ts`, which does not export it. It
 * is duplicated rather than imported-by-accident so that changing one without
 * the other is a visible divergence rather than a silent one: the library's
 * copy is the security boundary (it throws), this copy only decides whether
 * the job is worth attempting at all.
 */
const VOUCHERABLE = new Set(['paid', 'confirmed', 'partially_refunded'])

export async function handlePdfJob(job: PdfJob, context: WorkerContext): Promise<void> {
  switch (job.kind) {
    case 'itinerary':
      return renderItinerary(job.itineraryId, job.force ?? false)
    case 'itinerary_sweep':
      return sweepItineraries(context)
    case 'voucher':
      return renderVoucher(job.orderId)
  }
}

async function renderItinerary(itineraryId: string, force: boolean): Promise<void> {
  const documents = await generateItineraryDocuments(itineraryId, { force })

  const rendered = documents.filter((doc) => doc.rendered)
  const bytes = rendered.reduce((sum, doc) => sum + doc.bytes, 0)

  console.info('[pdf] itinerary documents up to date', {
    itineraryId,
    version: documents[0]?.version ?? null,
    rendered: rendered.map((doc) => doc.locale),
    skipped: documents.filter((doc) => !doc.rendered).map((doc) => doc.locale),
    bytes,
  })
}

async function sweepItineraries(context: WorkerContext): Promise<void> {
  const ids = await itinerariesMissingDocuments(SWEEP_LIMIT)

  if (ids.length === 0) {
    console.info('[pdf] sweep found nothing missing')
    return
  }

  let enqueued = 0
  for (const itineraryId of ids) {
    // Throttled on the itinerary id: an hourly sweep must not stack a second
    // render behind one that is still queued from the last hour.
    const id = await context.enqueuePdf(
      { kind: 'itinerary', itineraryId },
      { throttleKey: `itinerary:${itineraryId}`, throttleSeconds: 30 * 60 },
    )
    if (id !== null) enqueued += 1
  }

  console.info('[pdf] sweep fanned out', { missing: ids.length, enqueued })
}

async function renderVoucher(orderId: string): Promise<void> {
  const [order] = await db
    .select({ status: orders.status, orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!order) throw new Error(`No such order: ${orderId}`)

  /**
   * Checked here as well as inside the library, because the two failures are
   * different. A job queued on a payment that was later reversed is not a
   * fault to retry four times and then dead-letter — the answer will never
   * change. Return, and let the log say why.
   */
  if (!VOUCHERABLE.has(order.status)) {
    console.info('[pdf] skipping voucher for a non-payable order', {
      orderId,
      orderNumber: order.orderNumber,
      status: order.status,
    })
    return
  }

  const voucher = await generateOrderVoucher(orderId)

  await db.insert(auditLog).values({
    actorId: null,
    action: VOUCHER_AUDIT_ACTION,
    entityType: 'order',
    entityId: orderId,
    before: null,
    after: {
      objectKey: voucher.objectKey,
      locale: voucher.locale,
      bytes: voucher.bytes,
    },
  })

  console.info('[pdf] voucher rendered', {
    orderId,
    orderNumber: voucher.orderNumber,
    locale: voucher.locale,
    objectKey: voucher.objectKey,
    bytes: voucher.bytes,
  })
}

/**
 * Which of these orders already have a voucher.
 *
 * Answered in one query rather than per order: the reconcile sweep looks at
 * up to a hundred orders a run, and a hundred round trips every five minutes
 * to learn nothing is a cost with no benefit.
 */
export async function ordersWithVouchers(orderIds: readonly string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set()

  const rows = await db
    .select({ entityId: auditLog.entityId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, VOUCHER_AUDIT_ACTION),
        eq(auditLog.entityType, 'order'),
        inArray(auditLog.entityId, [...orderIds]),
      ),
    )

  return new Set(rows.flatMap((row) => (row.entityId === null ? [] : [row.entityId])))
}
