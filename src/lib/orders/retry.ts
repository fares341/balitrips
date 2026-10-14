/**
 * Pay an existing order again after a failed attempt.
 *
 * v3 handoff: "a payment retry uses the same Order.id, so the order is never
 * duplicated". The webhook therefore leaves an order `pending` when an
 * attempt fails (its capacity still held), and this opens a NEW payment
 * attempt on that same order — same number, same frozen lines and total —
 * instead of running checkout again.
 *
 * Idempotent where it matters:
 *  - the order row is locked while the attempt is opened, and an attempt is
 *    opened only when the last one failed, so two presses cannot open two;
 *  - the attempt's key is derived from the attempt number and is unique in
 *    `payments`, so a concurrent second press loses on the index;
 *  - the provider key is per attempt (`order:<id>:<n>`), so Stripe does not
 *    replay the first, failed session.
 */

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { orders, payments } from '@/db/schema'
import { assertBookingsOpen } from '@/lib/bookings-open'
import { getPaymentProvider } from '@/lib/payments'

import { canRetryPayment } from './booking-status'

export type RetryErrorCode = 'not_found' | 'expired' | 'not_retryable' | 'in_progress'

export class RetryError extends Error {
  constructor(readonly code: RetryErrorCode) {
    super(`Payment retry refused: ${code}`)
    this.name = 'RetryError'
  }
}

export interface RetryResult {
  orderNumber: string
  nextAction: unknown
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  const causeCode = (error as { cause?: { code?: unknown } } | null)?.cause?.code
  return code === '23505' || causeCode === '23505'
}

export async function retryOrderPayment(input: {
  orderId: string
  /** Where the provider sends the customer back, given the new attempt's key. */
  returnUrlFor: (attemptKey: string) => string
}): Promise<RetryResult> {
  assertBookingsOpen('checkout')
  const provider = getPaymentProvider()

  const prepared = await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .for('update')
      .limit(1)
    if (!order) throw new RetryError('not_found')
    if (order.status === 'cancelled') throw new RetryError('expired')
    if (order.status !== 'pending') throw new RetryError('not_retryable')

    const attempts = await tx
      .select({ status: payments.status, createdAt: payments.createdAt })
      .from(payments)
      .where(eq(payments.orderId, order.id))
    if (
      !canRetryPayment(
        order.status,
        attempts.map((a) => ({ ...a, method: null })),
      )
    ) {
      throw new RetryError('in_progress')
    }

    const attempt = attempts.length + 1
    const key = `retry:${order.id}:${attempt}`
    try {
      await tx.insert(payments).values({
        orderId: order.id,
        provider: provider.name,
        providerPaymentId: null,
        status: 'requires_action',
        amountMinor: order.totalMinor,
        currency: order.presentmentCurrency,
        idempotencyKey: key,
      })
    } catch (error) {
      if (isUniqueViolation(error)) throw new RetryError('in_progress')
      throw error
    }
    return { order, key, attempt }
  })

  const { order, key, attempt } = prepared
  const customer = order.customerSnapshot
  let intent
  try {
    intent = await provider.createIntent({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountMinor: order.totalMinor,
      currency: order.presentmentCurrency,
      idempotencyKey: `order:${order.id}:${attempt}`,
      customer: {
        email: customer?.email ?? '',
        ...(customer?.name ? { name: customer.name } : {}),
        ...(customer?.country ? { country: customer.country } : {}),
        locale: customer?.locale ?? 'ar',
      },
      returnUrl: input.returnUrlFor(key),
      statementDescriptor: 'BALI TRIPS',
    })
  } catch (error) {
    // No session exists: drop the attempt so the next press can try again.
    await db.delete(payments).where(eq(payments.idempotencyKey, key))
    throw error
  }

  await db
    .update(payments)
    .set({
      providerPaymentId: intent.providerPaymentId,
      status: intent.status,
      rawPayload: intent.raw as object,
    })
    .where(eq(payments.idempotencyKey, key))

  return { orderNumber: order.orderNumber, nextAction: intent.nextAction }
}
