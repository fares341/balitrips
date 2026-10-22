/**
 * Authorised bookings: capture once the supplier confirms, or release.
 *
 * Client, Oct 2026: a booking is paid only after the supplier confirms. At
 * checkout the card is authorised (held); the order sits in `authorized`
 * until staff either
 *
 *  - confirm with the supplier → `captureAuthorizedOrder` charges the hold and
 *    the order becomes `paid` (bookings, supplier assignment, invoice — the
 *    usual `applyPaidOrder`), or
 *  - hear "no" → `releaseAuthorizedOrder` voids the hold, nothing is charged,
 *    the order is cancelled, its capacity returned and the customer told.
 *
 * Six days without a decision releases it automatically (the worker), because
 * Stripe drops a card authorisation after about seven.
 *
 * The provider is asked FIRST and the database written after: a capture that
 * fails leaves the order untouched for another try, and both functions are
 * idempotent — a second click (or a click racing the sweep) finds the order
 * no longer `authorized` and does nothing.
 */

import { and, eq, inArray, lt } from 'drizzle-orm'

import { db } from '@/db'
import { auditLog, orders, payments } from '@/db/schema'
import { applyPaidOrder } from '@/lib/orders/after-paid'
import { cancelUnpaidOrder } from '@/lib/orders/expire'
import { getPaymentProvider, type PaymentProvider } from '@/lib/payments'

import { AUTHORIZATION_DAYS } from './capture'

export type AuthorizationOutcome =
  | { ok: true; status: 'paid' | 'cancelled' }
  | { ok: false; reason: 'not_found' | 'not_authorized' | 'no_payment' | 'provider_refused' }

async function heldPayment(orderId: string) {
  const [order] = await db
    .select({ id: orders.id, status: orders.status, orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  if (!order) return { order: null, payment: null }
  const [payment] = await db
    .select({ id: payments.id, providerPaymentId: payments.providerPaymentId })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), eq(payments.status, 'authorized')))
    .limit(1)
  return { order, payment: payment ?? null }
}

/** The supplier confirmed: charge the held amount. */
export async function captureAuthorizedOrder(
  orderId: string,
  actorId: string | null,
  provider: PaymentProvider = getPaymentProvider(),
): Promise<AuthorizationOutcome> {
  const { order, payment } = await heldPayment(orderId)
  if (!order) return { ok: false, reason: 'not_found' }
  if (order.status !== 'authorized') return { ok: false, reason: 'not_authorized' }
  if (!payment?.providerPaymentId || !provider.capture) return { ok: false, reason: 'no_payment' }

  // Same key on a retry: the provider answers the first capture again.
  const captured = await provider.capture(payment.providerPaymentId, `capture:${orderId}`)
  if (!captured) return { ok: false, reason: 'provider_refused' }

  const moved = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .for('update')
      .limit(1)
    if (locked?.status !== 'authorized') return false
    await tx.update(orders).set({ status: 'paid' }).where(eq(orders.id, orderId))
    await tx.update(payments).set({ status: 'succeeded' }).where(eq(payments.id, payment.id))
    await applyPaidOrder(tx, orderId)
    await tx.insert(auditLog).values({
      actorId,
      action: 'order.captured',
      entityType: 'order',
      entityId: orderId,
      before: { status: 'authorized' },
      after: { status: 'paid', reason: 'supplier confirmed' },
    })
    return true
  })
  return moved ? { ok: true, status: 'paid' } : { ok: false, reason: 'not_authorized' }
}

/** The supplier refused, or nobody confirmed in time: release the hold. */
export async function releaseAuthorizedOrder(
  orderId: string,
  reason: string,
  actorId: string | null,
  provider: PaymentProvider = getPaymentProvider(),
): Promise<AuthorizationOutcome> {
  const { order, payment } = await heldPayment(orderId)
  if (!order) return { ok: false, reason: 'not_found' }
  if (order.status !== 'authorized') return { ok: false, reason: 'not_authorized' }

  if (payment?.providerPaymentId && provider.voidAuthorization) {
    const released = await provider.voidAuthorization(payment.providerPaymentId)
    if (!released) return { ok: false, reason: 'provider_refused' }
    await db
      .update(payments)
      .set({ status: 'cancelled' })
      .where(and(eq(payments.id, payment.id), eq(payments.status, 'authorized')))
  }

  const done = await cancelUnpaidOrder(
    orderId,
    order.orderNumber,
    reason,
    actorId === null ? 'order.authorization_expired' : 'order.authorization_released',
    'authorized',
  )
  return done === null ? { ok: false, reason: 'not_authorized' } : { ok: true, status: 'cancelled' }
}

/** Orders still waiting for the supplier after `AUTHORIZATION_DAYS`. */
export async function expiredAuthorizations(now = new Date(), limit = 100) {
  const cutoff = new Date(now.getTime() - AUTHORIZATION_DAYS * 24 * 60 * 60 * 1000)
  return db
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(and(inArray(orders.status, ['authorized']), lt(orders.authorizedAt, cutoff)))
    .limit(limit)
}
