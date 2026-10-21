/**
 * `email.send` handler.
 *
 * Loads the recipient and the order from the database rather than trusting a
 * payload snapshot: a job may sit in the queue across a deploy, a retry, and a
 * refund, and the message must describe the world as it is when it is sent,
 * not as it was when it was queued. The payload carries ids and nothing else.
 *
 * IDEMPOTENCE. pg-boss retries, the reconcile sweep re-runs every few minutes,
 * and a webhook can be replayed — so "have we already told this customer?" has
 * to be answerable from durable state. There is no `email_sent_at` column and
 * adding one is not this slice's to do, so the answer is written to
 * `audit_log`, which already exists for exactly this kind of record and gives
 * support a straight answer to "did they get the email?".
 *
 * The check-then-write is not atomic, so two workers racing on the same order
 * could send twice. That is bounded — the reconcile queue is the only
 * scheduled producer and a duplicate confirmation is embarrassing, not
 * harmful — and closing it properly needs a unique index, which needs a
 * migration this slice does not own.
 */

import { and, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import { auditLog, orderItems, orders, payments, refunds, users } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { pick } from '@/lib/content/localize'
import { isPlaceholderEmail } from '@/lib/auth/phone'
import {
  renderOrderConfirmationEmail,
  renderRefundNoticeEmail,
  renderWelcomeEmail,
  sendEmail,
  toMailLocale,
  type OrderEmailLine,
} from '@/lib/email'

import type { EmailJob } from '../queues'

const AUDIT_ACTION = 'email.sent'

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

/**
 * Absolute, locale-correct URL.
 *
 * Built with next-intl's own `getPathname` so the prefix rule lives in
 * exactly one place — `src/i18n/routing.ts`, which currently says `always`.
 * It said `as-needed` when this file was written, and the mail templates were
 * the last place anyone would have thought to update; delegating means the
 * change cost nothing here and would cost nothing again.
 */
function absoluteUrl(locale: Locale, href: string): string {
  return `${siteOrigin()}${getPathname({ href, locale })}`
}

/* --------------------------------------------------------------------------
   Send-once bookkeeping
   -------------------------------------------------------------------------- */

export async function alreadySent(
  entityType: 'order' | 'user',
  entityId: string,
  kind: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, AUDIT_ACTION),
        eq(auditLog.entityType, entityType),
        eq(auditLog.entityId, entityId),
        sql`${auditLog.after}->>'kind' = ${kind}`,
      ),
    )
    .limit(1)

  return row !== undefined
}

/**
 * Which of these orders have already had a confirmation sent.
 *
 * The batched form of `alreadySent`, for the reconcile sweep: it looks at up
 * to a hundred orders every few minutes and almost always finds nothing to
 * do, so asking one question about a hundred ids beats a hundred questions.
 */
export async function ordersWithConfirmationEmail(
  orderIds: readonly string[],
): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set()

  const rows = await db
    .select({ entityId: auditLog.entityId })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, AUDIT_ACTION),
        eq(auditLog.entityType, 'order'),
        inArray(auditLog.entityId, [...orderIds]),
        sql`${auditLog.after}->>'kind' = 'order_confirmation'`,
      ),
    )

  return new Set(rows.flatMap((row) => (row.entityId === null ? [] : [row.entityId])))
}

async function recordSent(
  entityType: 'order' | 'user',
  entityId: string,
  kind: string,
  to: string,
): Promise<void> {
  await db.insert(auditLog).values({
    actorId: null,
    action: AUDIT_ACTION,
    entityType,
    entityId,
    before: null,
    // The address is recorded because "sent to the wrong address" and "never
    // sent" are different support problems with different fixes.
    after: { kind, to },
  })
}

/* --------------------------------------------------------------------------
   Handler
   -------------------------------------------------------------------------- */

export async function handleEmailJob(job: EmailJob): Promise<void> {
  switch (job.kind) {
    case 'welcome':
      return sendWelcome(job.userId, job.verifyUrl)
    case 'order_confirmation':
      return sendOrderConfirmation(job.orderId)
    case 'refund_notice':
      return sendRefundNotice(job.orderId, job.refundId)
    case 'notification': {
      const { sendNotificationEmail } = await import('./notify')
      return sendNotificationEmail(job.notificationId)
    }
    case 'availability_alert': {
      const { sendAvailabilityAlert } = await import('@/lib/notify/availability')
      return sendAvailabilityAlert(job.alertId)
    }
  }
}

async function sendWelcome(userId: string, verifyUrl: string | undefined): Promise<void> {
  const [user] = await db
    .select({
      email: users.email,
      name: users.name,
      locale: users.locale,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) throw new Error(`No such user: ${userId}`)
  // Deleting an account between sign-up and the job running is rare but real.
  if (user.deletedAt !== null) return

  const kind = verifyUrl === undefined ? 'welcome' : 'welcome_verify'
  if (await alreadySent('user', userId, kind)) return

  const locale = toMailLocale(user.locale)
  const rendered = renderWelcomeEmail({
    locale,
    name: user.name,
    siteUrl: absoluteUrl(locale, '/'),
    ...(verifyUrl === undefined ? {} : { verifyUrl }),
  })

  // Phone-only account: nothing to mail (and nothing to retry).
  if (isPlaceholderEmail(user.email)) return
  const result = await sendEmail({ to: user.email, ...rendered })
  if (!result.delivered) throw new Error(`Welcome mail not delivered: ${result.error ?? 'unknown'}`)

  await recordSent('user', userId, kind, user.email)
}

/** Statuses for which a confirmation is meaningful. */
const CONFIRMABLE = new Set(['paid', 'confirmed', 'partially_refunded'])

async function sendOrderConfirmation(orderId: string): Promise<void> {
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      currency: orders.presentmentCurrency,
      subtotalMinor: orders.subtotalMinor,
      totalMinor: orders.totalMinor,
      placedAt: orders.placedAt,
      createdAt: orders.createdAt,
      customer: orders.customerSnapshot,
      userId: orders.userId,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!order) throw new Error(`No such order: ${orderId}`)

  if (!CONFIRMABLE.has(order.status)) {
    // A job queued on a payment that was later reversed. Not an error — there
    // is simply nothing to confirm, and retrying would never change that.
    console.info('[email] skipping confirmation for a non-paid order', {
      orderId,
      status: order.status,
    })
    return
  }

  if (await alreadySent('order', orderId, 'order_confirmation')) return

  const recipient = await resolveRecipient(order.customer?.email, order.userId)
  if (recipient === null) {
    throw new Error(`Order ${order.orderNumber} has no email address to send to`)
  }

  const locale = toMailLocale(order.customer?.locale)

  const rows = await db
    .select({
      nameSnapshot: orderItems.nameSnapshot,
      quantity: orderItems.quantity,
      lineTotalMinor: orderItems.lineTotalMinor,
      travelDate: orderItems.travelDate,
      guests: orderItems.guests,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))

  const lines: OrderEmailLine[] = rows.map((row) => ({
    // The immutable snapshot, so a later rename or unpublish cannot rewrite
    // what the customer sees they bought.
    name: pick(row.nameSnapshot, locale, order.orderNumber),
    quantity: row.quantity,
    lineTotalMinor: row.lineTotalMinor,
    travelDate: row.travelDate,
    guests: row.guests,
  }))

  const rendered = renderOrderConfirmationEmail({
    locale,
    name: order.customer?.name ?? null,
    orderNumber: order.orderNumber,
    placedAt: order.placedAt ?? order.createdAt,
    currency: order.currency,
    subtotalMinor: order.subtotalMinor,
    totalMinor: order.totalMinor,
    lines,
    orderUrl: absoluteUrl(locale, '/account/invoices'),
  })

  if (isPlaceholderEmail(recipient)) return
  const result = await sendEmail({ to: recipient, ...rendered })
  if (!result.delivered) {
    throw new Error(`Order confirmation not delivered: ${result.error ?? 'unknown'}`)
  }

  await recordSent('order', orderId, 'order_confirmation', recipient)
}

async function sendRefundNotice(orderId: string, refundId: string | undefined): Promise<void> {
  const [order] = await db
    .select({
      orderNumber: orders.orderNumber,
      currency: orders.presentmentCurrency,
      totalMinor: orders.totalMinor,
      customer: orders.customerSnapshot,
      userId: orders.userId,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)

  if (!order) throw new Error(`No such order: ${orderId}`)

  const kind = refundId === undefined ? 'refund_notice' : `refund_notice:${refundId}`
  if (await alreadySent('order', orderId, kind)) return

  // Every settled refund against this order, reached through its payments.
  const settled = await db
    .select({
      id: refunds.id,
      amountMinor: refunds.amountMinor,
      createdAt: refunds.createdAt,
    })
    .from(refunds)
    .innerJoin(payments, eq(refunds.paymentId, payments.id))
    .where(and(eq(payments.orderId, orderId), eq(refunds.status, 'succeeded')))

  if (settled.length === 0) {
    console.info('[email] no settled refund on this order yet; nothing to announce', { orderId })
    return
  }

  const totalRefunded = settled.reduce((sum, row) => sum + row.amountMinor, 0)
  const subject = refundId === undefined ? null : (settled.find((r) => r.id === refundId) ?? null)

  // Announce the specific refund when one was named, otherwise everything
  // settled so far. Either way, "is the booking gone?" is decided by the
  // cumulative total against the order, never by one line.
  const amount = subject?.amountMinor ?? totalRefunded
  const issuedAt = subject?.createdAt ?? new Date()

  const recipient = await resolveRecipient(order.customer?.email, order.userId)
  if (recipient === null) {
    throw new Error(`Order ${order.orderNumber} has no email address to send to`)
  }

  const locale = toMailLocale(order.customer?.locale)

  const rendered = renderRefundNoticeEmail({
    locale,
    name: order.customer?.name ?? null,
    orderNumber: order.orderNumber,
    currency: order.currency,
    refundedMinor: amount,
    isFull: totalRefunded >= order.totalMinor,
    issuedAt,
    orderUrl: absoluteUrl(locale, '/account/invoices'),
  })

  if (isPlaceholderEmail(recipient)) return
  const result = await sendEmail({ to: recipient, ...rendered })
  if (!result.delivered) {
    throw new Error(`Refund notice not delivered: ${result.error ?? 'unknown'}`)
  }

  await recordSent('order', orderId, kind, recipient)
}

/**
 * The snapshot address is authoritative — it is what the customer typed at
 * checkout, and it is frozen there precisely so a later profile edit cannot
 * redirect the paperwork for a past order. The account address is the
 * fallback for orders written before the snapshot existed.
 */
async function resolveRecipient(
  snapshotEmail: string | undefined,
  userId: string | null,
): Promise<string | null> {
  if (snapshotEmail !== undefined && snapshotEmail.trim() !== '') return snapshotEmail.trim()
  if (userId === null) return null

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return user?.email ?? null
}
