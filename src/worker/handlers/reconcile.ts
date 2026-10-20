/**
 * `order.reconcile` handler — payment truth-up, plus post-payment follow-ups.
 *
 * WHY THIS EXISTS. Order state is driven by webhooks, and webhooks are lost.
 * The provider retries for a while and then gives up; a deploy restarts the
 * process mid-request; the webhook endpoint 500s because Postgres was busy.
 * Every one of those leaves a customer who has been charged looking at an
 * order that still says "pending" — and nothing in the request path will ever
 * notice, because there is no request. This sweep is the thing that notices.
 *
 * It is deliberately ONE-WAY. It can advance an order to `paid`; it can never
 * cancel one. A provider reporting "failed" for an intent the customer
 * abandoned is not evidence a paid booking should be torn down — expiry is
 * `capacity.release-expired`'s job, on its own clock, with its own guard
 * against cancelling something that has actually settled. Two code paths
 * racing to cancel the same order is how a paid customer loses their van.
 *
 * Everything here is safely re-runnable: the sweep runs every few minutes and
 * must be a cheap no-op when there is nothing wrong.
 */

import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import { applyPaidOrder } from '@/lib/orders/after-paid'
import { notifyOrderPaid } from '@/lib/notify/orders'
import { auditLog, orders, payments } from '@/db/schema'
import { getPaymentProvider, type PaymentStatus } from '@/lib/payments'
import { canTransition, type OrderStatus } from '@/lib/orders/state'
import { recordPaymentMethod } from '@/lib/orders/payment-method'

import type { ReconcileJob } from '../queues'
import type { WorkerContext } from './context'
import { ordersWithConfirmationEmail } from './email'
import { ordersWithInvoices, ordersWithVouchers } from './pdf'

/** Orders older than this are nobody's emergency; a human should look. */
const WINDOW_DAYS = 30

/** Per run, so one sweep cannot hold a connection for minutes. */
const SWEEP_LIMIT = 100

/** Statuses worth looking at at all. Terminal ones are settled history. */
const RECONCILABLE: readonly OrderStatus[] = ['pending', 'paid', 'confirmed', 'partially_refunded']

/** Statuses for which the customer should have paperwork. */
const CONFIRMABLE = new Set<OrderStatus>(['paid', 'confirmed', 'partially_refunded'])

/**
 * Payment statuses that are final. A provider read must never move a payment
 * out of one of these — the sandbox adapter's `getIntent` is a stub that
 * answers `processing` for every id it is given, and writing that back over a
 * settled payment would un-pay a real order.
 */
const TERMINAL_PAYMENT: ReadonlySet<PaymentStatus> = new Set(['succeeded', 'failed', 'cancelled'])

const AUDIT_ACTION = 'order.reconciled'

export interface ReconcileSummary {
  examined: number
  promoted: number
  providerChecks: number
  providerErrors: number
  emailsQueued: number
  vouchersQueued: number
}

interface Candidate {
  id: string
  orderNumber: string
  status: OrderStatus
}

export async function handleReconcileJob(
  job: ReconcileJob,
  context: WorkerContext,
): Promise<ReconcileSummary> {
  const candidates = await loadCandidates(job.orderId)

  const summary: ReconcileSummary = {
    examined: candidates.length,
    promoted: 0,
    providerChecks: 0,
    providerErrors: 0,
    emailsQueued: 0,
    vouchersQueued: 0,
  }

  if (candidates.length === 0) return summary

  const settled: Candidate[] = []

  for (const candidate of candidates) {
    let status = candidate.status

    if (status === 'pending') {
      if (await promoteFromLocalPayments(candidate)) {
        summary.promoted += 1
        status = 'paid'
        await notifyOrderPaid(candidate.id)
      } else {
        const outcome = await promoteFromProvider(candidate)
        summary.providerChecks += outcome.checks
        summary.providerErrors += outcome.errors
        if (outcome.promoted) {
          summary.promoted += 1
          status = 'paid'
          await notifyOrderPaid(candidate.id)
        }
      }
    }

    if (CONFIRMABLE.has(status)) settled.push({ ...candidate, status })
  }

  const followUps = await queueFollowUps(settled, context)
  summary.emailsQueued = followUps.emails
  summary.vouchersQueued = followUps.vouchers

  console.info('[reconcile] sweep complete', summary)
  return summary
}

/* --------------------------------------------------------------------------
   Candidates
   -------------------------------------------------------------------------- */

async function loadCandidates(orderId: string | undefined): Promise<Candidate[]> {
  const columns = {
    id: orders.id,
    orderNumber: orders.orderNumber,
    status: orders.status,
  }

  const rows =
    orderId === undefined
      ? await db
          .select(columns)
          .from(orders)
          .where(
            and(
              inArray(orders.status, [...RECONCILABLE]),
              // placedAt is null for an order written before the payment
              // intent existed, so fall back to the row's own age.
              sql`coalesce(${orders.placedAt}, ${orders.createdAt}) >= now() - ${`${WINDOW_DAYS} days`}::interval`,
            ),
          )
          .orderBy(asc(orders.createdAt))
          .limit(SWEEP_LIMIT)
      : await db.select(columns).from(orders).where(eq(orders.id, orderId)).limit(1)

  return rows.map((row) => ({ ...row, status: row.status as OrderStatus }))
}

/* --------------------------------------------------------------------------
   Truth-up
   -------------------------------------------------------------------------- */

/**
 * The common repair: the payment row says `succeeded` but the order was never
 * advanced, because the webhook handler died between the two writes or an
 * operator settled the payment by hand.
 */
async function promoteFromLocalPayments(candidate: Candidate): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Lock first. A webhook for this order may be landing right now, and two
    // writers both reading "pending" would both try to advance it.
    const [locked] = await tx
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, candidate.id))
      .for('update')
      .limit(1)

    if (!locked || locked.status !== 'pending') return false

    const [succeeded] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.orderId, candidate.id), eq(payments.status, 'succeeded')))
      .limit(1)

    if (!succeeded) return false

    // Belt and braces: the state machine is the authority on what may follow
    // what, even when this function only ever asks for one transition.
    if (!canTransition('pending', 'paid')) return false

    await tx.update(orders).set({ status: 'paid' }).where(eq(orders.id, candidate.id))
    // نفس ما يجريه webhook عند الدفع (الباقات، الحجوزات، الموردون)؛ متساوي النتيجة.
    await applyPaidOrder(tx, candidate.id)

    await tx.insert(auditLog).values({
      actorId: null,
      action: AUDIT_ACTION,
      entityType: 'order',
      entityId: candidate.id,
      before: { status: 'pending' },
      after: { status: 'paid', reason: 'settled payment found by the reconcile sweep' },
    })

    console.warn('[reconcile] advanced an order the webhook never finished', {
      orderId: candidate.id,
      orderNumber: candidate.orderNumber,
    })

    return true
  })
}

interface ProviderOutcome {
  checks: number
  errors: number
  promoted: boolean
}

/**
 * Ask the PSP what actually happened.
 *
 * Only for payments still in flight at OUR end and only for the provider that
 * is currently configured — asking a sandbox adapter about a Stripe id gets a
 * confident, wrong answer.
 */
async function promoteFromProvider(candidate: Candidate): Promise<ProviderOutcome> {
  const outcome: ProviderOutcome = { checks: 0, errors: 0, promoted: false }

  let provider
  try {
    provider = getPaymentProvider()
  } catch (error) {
    // Misconfiguration, not a transient fault. Log once per sweep-order and
    // let the local-payment path keep working.
    console.error('[reconcile] no usable payment provider', error)
    outcome.errors += 1
    return outcome
  }

  const inFlight = await db
    .select({
      id: payments.id,
      providerPaymentId: payments.providerPaymentId,
      status: payments.status,
    })
    .from(payments)
    .where(and(eq(payments.orderId, candidate.id), eq(payments.provider, provider.name)))

  for (const payment of inFlight) {
    if (payment.providerPaymentId === null) continue
    if (TERMINAL_PAYMENT.has(payment.status as PaymentStatus)) continue

    outcome.checks += 1

    let reported: PaymentStatus
    try {
      reported = (await provider.getIntent(payment.providerPaymentId)).status
    } catch (error) {
      // A provider outage is not this job's failure. The sweep is scheduled;
      // the next run asks again, and throwing here would only roll back the
      // useful work already done for other orders.
      console.error('[reconcile] could not read the intent back from the provider', {
        orderId: candidate.id,
        providerPaymentId: payment.providerPaymentId,
        error,
      })
      outcome.errors += 1
      continue
    }

    if (reported === payment.status) continue

    await db
      .update(payments)
      .set({ status: reported })
      // Re-check the status in the WHERE clause: a webhook may have settled
      // this row while the network call was in flight, and the provider's
      // answer is older than that.
      .where(and(eq(payments.id, payment.id), eq(payments.status, payment.status)))

    console.info('[reconcile] payment status corrected from the provider', {
      orderId: candidate.id,
      providerPaymentId: payment.providerPaymentId,
      from: payment.status,
      to: reported,
    })

    if (reported === 'succeeded' && (await promoteFromLocalPayments(candidate))) {
      outcome.promoted = true
      // طريقة الدفع (بطاقة/Apple Pay…) — أفضل جهد، لا يعطّل التسوية.
      await recordPaymentMethod(provider, payment.providerPaymentId)
    }
  }

  return outcome
}

/* --------------------------------------------------------------------------
   Follow-ups
   -------------------------------------------------------------------------- */

async function queueFollowUps(
  settled: readonly Candidate[],
  context: WorkerContext,
): Promise<{ emails: number; vouchers: number }> {
  if (settled.length === 0) return { emails: 0, vouchers: 0 }

  const ids = settled.map((order) => order.id)
  // Two queries for the whole batch rather than two per order: a sweep looks
  // at up to a hundred orders and almost always finds nothing to do.
  const [confirmed, vouchered, invoiced, numbered] = await Promise.all([
    ordersWithConfirmationEmail(ids),
    ordersWithVouchers(ids),
    ordersWithInvoices(ids),
    db
      .select({ id: orders.id })
      .from(orders)
      .where(and(inArray(orders.id, ids), sql`${orders.invoiceNumber} is not null`)),
  ])
  const hasNumber = new Set(numbered.map((row) => row.id))

  let emails = 0
  let vouchers = 0

  for (const order of settled) {
    if (!confirmed.has(order.id)) {
      const id = await context.enqueueEmail(
        { kind: 'order_confirmation', orderId: order.id },
        { throttleKey: `order_confirmation:${order.id}`, throttleSeconds: 15 * 60 },
      )
      if (id !== null) emails += 1
    }

    // Phase 4: the invoice of a paid order, rendered once.
    if (hasNumber.has(order.id) && !invoiced.has(order.id)) {
      await context.enqueuePdf(
        { kind: 'invoice', orderId: order.id },
        { throttleKey: `invoice:${order.id}`, throttleSeconds: 30 * 60 },
      )
    }

    if (!vouchered.has(order.id)) {
      const id = await context.enqueuePdf(
        { kind: 'voucher', orderId: order.id },
        { throttleKey: `voucher:${order.id}`, throttleSeconds: 30 * 60 },
      )
      if (id !== null) vouchers += 1
    }
  }

  return { emails, vouchers }
}
