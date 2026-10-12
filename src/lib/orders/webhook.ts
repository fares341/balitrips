import { and, eq, isNull, ne } from 'drizzle-orm'

import { db } from '@/db'
import { entitlements, orderItems, orders, payments, webhookEvents } from '@/db/schema'
import { grantOrderPlans } from '@/lib/entitlements/plans'
import { releaseDriverCapacity } from '@/lib/availability/capacity'
import type { VehicleClass } from '@/lib/booking-rules'
import type { WebhookEvent } from '@/lib/payments'

import {
  canTransition,
  shouldRevokeEntitlements,
  statusForWebhook,
  type OrderStatus,
} from './state'

/**
 * Webhook processing.
 *
 * This is what actually confirms an order — not the customer's redirect.
 * Providers deliver the success event before the browser returns, out of
 * order, and repeatedly, so every path here is written to be safely
 * re-runnable.
 *
 * Three guarantees:
 *   1. Replay is a no-op, enforced by a unique index on (provider, eventId).
 *   2. State never regresses; a late event for an already-terminal order is
 *      recorded and ignored rather than applied.
 *   3. Cancelling releases the capacity the order was holding, so an
 *      abandoned checkout does not keep a van off the market forever.
 */

export type WebhookOutcome =
  | { handled: true; orderId: string; from: OrderStatus; to: OrderStatus }
  | { handled: false; reason: 'duplicate' | 'no_order' | 'no_transition' | 'ignored' }

export async function processWebhookEvent(
  provider: string,
  event: WebhookEvent,
): Promise<WebhookOutcome> {
  return db.transaction(async (tx) => {
    // Claim the event first. The unique index means a concurrent or
    // repeated delivery loses here and does no work at all.
    const claimed = await tx
      .insert(webhookEvents)
      .values({
        provider,
        providerEventId: event.providerEventId,
        eventType: event.type,
        payload: event.raw as object,
      })
      .onConflictDoNothing({
        target: [webhookEvents.provider, webhookEvents.providerEventId],
      })
      .returning({ id: webhookEvents.id })

    if (claimed.length === 0) {
      return { handled: false, reason: 'duplicate' } as const
    }

    const target = statusForWebhook(event.type)
    if (!target) {
      // Unknown or refund events carry no implied status. Refunds are
      // applied by the refund flow, which knows the amounts.
      await markProcessed(tx, provider, event.providerEventId)
      return { handled: false, reason: 'ignored' } as const
    }

    if (!event.providerPaymentId) {
      await markProcessed(tx, provider, event.providerEventId)
      return { handled: false, reason: 'no_order' } as const
    }

    const [payment] = await tx
      .select({ orderId: payments.orderId })
      .from(payments)
      .where(eq(payments.providerPaymentId, event.providerPaymentId))
      .limit(1)

    if (!payment) {
      await markProcessed(tx, provider, event.providerEventId)
      return { handled: false, reason: 'no_order' } as const
    }

    // Lock the order row so two events for the same order serialise.
    const [order] = await tx
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.id, payment.orderId))
      .for('update')
      .limit(1)

    if (!order) {
      await markProcessed(tx, provider, event.providerEventId)
      return { handled: false, reason: 'no_order' } as const
    }

    const from = order.status as OrderStatus

    /**
     * A failure event may only act on an order that has not been paid.
     *
     * The state machine permits `paid -> cancelled` because an operator
     * cancelling a paid booking is legitimate. A *webhook* saying "failed"
     * is not that. Providers retry, and a failed first attempt is routinely
     * delivered after the successful retry that superseded it — so honouring
     * it here would cancel a booking the customer has actually paid for,
     * release the vehicle back to the fleet, and revoke their access. The
     * charge would stay settled against a cancelled order, and nobody would
     * notice until the day of travel.
     *
     * Money only ever moves backwards through the refund flow, which knows
     * the amounts and is initiated deliberately.
     */
    const isFailureEvent = target === 'cancelled'
    if (isFailureEvent && from !== 'pending') {
      await markProcessed(tx, provider, event.providerEventId)
      return { handled: false, reason: 'no_transition' } as const
    }

    if (target === 'paid' && from === 'paid') {
      // A second, real charge for an order already paid — typically one an
      // admin marked paid offline while the customer's card checkout was still
      // open. The money moved, so the row must say so: it shows as a second
      // succeeded payment in Studio → Payments, to be refunded there.
      const changed = await tx
        .update(payments)
        .set({ status: 'succeeded' })
        .where(
          and(
            eq(payments.providerPaymentId, event.providerPaymentId),
            ne(payments.status, 'succeeded'),
          ),
        )
        .returning({ id: payments.id })
      if (changed.length > 0) {
        console.error('[webhook] second successful payment for a paid order', {
          orderId: order.id,
          providerPaymentId: event.providerPaymentId,
        })
      }
    }

    if (!canTransition(from, target)) {
      // A late "failed" arriving after "paid" lands here and is discarded.
      // The event stays recorded so the sequence is auditable.
      await markProcessed(tx, provider, event.providerEventId)
      return { handled: false, reason: 'no_transition' } as const
    }

    if (from !== target) {
      await tx.update(orders).set({ status: target }).where(eq(orders.id, order.id))

      await tx
        .update(payments)
        .set({ status: target === 'paid' ? 'succeeded' : 'failed' })
        .where(eq(payments.providerPaymentId, event.providerPaymentId))

      // الباقات المشتراة تُمنح في نفس المعاملة التي تثبّت الدفع: لا لحظة
      // يكون فيها الطلب مدفوعاً والخريطة مقفلة.
      if (target === 'paid') {
        await grantOrderPlans(tx, order.id)
      }

      if (target === 'cancelled') {
        await releaseHeldCapacity(tx, order.id)
        if (shouldRevokeEntitlements(target)) {
          await revokeOrderEntitlements(tx, order.id, 'order cancelled')
        }
      }
    }

    await markProcessed(tx, provider, event.providerEventId)
    return { handled: true, orderId: order.id, from, to: target } as const
  })
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function markProcessed(tx: Tx, provider: string, providerEventId: string): Promise<void> {
  await tx
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(
      and(eq(webhookEvents.provider, provider), eq(webhookEvents.providerEventId, providerEventId)),
    )
}

/**
 * Return the fleet days an order was holding.
 *
 * Without this, an abandoned or failed checkout keeps a vehicle off the
 * market until someone notices by hand.
 */
async function releaseHeldCapacity(tx: Tx, orderId: string): Promise<void> {
  const lines = await tx
    .select({
      vehicleClass: orderItems.vehicleClass,
      travelDate: orderItems.travelDate,
      endDate: orderItems.endDate,
    })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.kind, 'driver')))

  for (const line of lines) {
    if (!line.vehicleClass || !line.travelDate) continue
    await releaseDriverCapacity(
      tx,
      line.vehicleClass as VehicleClass,
      line.travelDate,
      line.endDate ?? line.travelDate,
    )
  }
}

/**
 * Revoke access granted by an order.
 *
 * Refunding map access must actually take the map away. Revoking rather
 * than deleting keeps the grant as an audit record.
 */
export async function revokeOrderEntitlements(
  tx: Tx,
  orderId: string,
  reason: string,
): Promise<void> {
  await tx
    .update(entitlements)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(entitlements.grantedByOrderId, orderId), isNull(entitlements.revokedAt)))
}
