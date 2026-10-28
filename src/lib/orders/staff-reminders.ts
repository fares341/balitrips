/**
 * Staff reminders for bookings still waiting for the operator (owner, Oct
 * 2026): once after 24 hours and once after 4 days (`./supplier-wait.ts`).
 * Run by the capacity sweep every 10 minutes, after the 6-day releases.
 *
 * Once per order and stage: the reminder is claimed by writing an
 * `order.staff_reminder` audit row (with the stage) under a transaction-level
 * advisory lock on the same key, so two sweeps racing each other — or a
 * retried job — send it once.
 */

import { and, eq, isNotNull, lte, sql } from 'drizzle-orm'

import { db } from '@/db'
import { auditLog, orders } from '@/db/schema'
import { formatMoney } from '@/lib/money'
import { notifyStaff } from '@/lib/notify'

import { dueReminderStage, hoursLeft, type StaffReminderStage } from './supplier-wait'

const AUDIT_ACTION = 'order.staff_reminder'

async function claim(orderId: string, stage: StaffReminderStage): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`staff-reminder:${orderId}:${stage}`}))`,
    )
    const [seen] = await tx
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, AUDIT_ACTION),
          eq(auditLog.entityType, 'order'),
          eq(auditLog.entityId, orderId),
          sql`${auditLog.after}->>'stage' = ${stage}`,
        ),
      )
      .limit(1)
    if (seen) return false
    await tx.insert(auditLog).values({
      actorId: null,
      action: AUDIT_ACTION,
      entityType: 'order',
      entityId: orderId,
      before: null,
      after: { stage },
    })
    return true
  })
}

/** Returns how many reminders were sent. Never throws for one bad order. */
export async function remindAwaitingSupplier(now = new Date()): Promise<number> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const waiting = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      authorizedAt: orders.authorizedAt,
      totalMinor: orders.totalMinor,
      currency: orders.presentmentCurrency,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'authorized'),
        isNotNull(orders.authorizedAt),
        lte(orders.authorizedAt, dayAgo),
      ),
    )
    .limit(200)

  let sent = 0
  for (const order of waiting) {
    if (order.authorizedAt === null) continue
    const stage = dueReminderStage(order.authorizedAt, now)
    if (stage === null) continue
    try {
      if (!(await claim(order.id, stage))) continue
      await notifyStaff(
        'staff_authorization_reminder',
        {
          orderNumber: order.orderNumber,
          total: formatMoney(order.totalMinor, order.currency, 'en'),
          hoursLeft: hoursLeft(order.authorizedAt, now),
          stage,
        },
        `/orders/${order.id}`,
      )
      sent += 1
    } catch (error) {
      console.error('[orders] staff reminder failed', { orderId: order.id, stage, error })
    }
  }
  return sent
}
