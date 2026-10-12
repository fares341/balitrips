/**
 * Order state machine.
 *
 * State is driven by webhooks, not by the customer's redirect: providers
 * routinely deliver the success event before the browser comes back, out of
 * order, and more than once. The rules below make a late or replayed event
 * harmless instead of destructive.
 */

export const ORDER_STATUSES = [
  'pending',
  'paid',
  'confirmed',
  'cancelled',
  'refunded',
  'partially_refunded',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

/**
 * Allowed transitions.
 *
 * Note what is absent: nothing returns to `pending`. A late "processing"
 * event arriving after `paid` must not regress a successful order back into
 * an unpaid one — that is how a confirmed booking silently becomes
 * uncollectable.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['confirmed', 'cancelled', 'refunded', 'partially_refunded'],
  confirmed: ['refunded', 'partially_refunded', 'cancelled'],
  partially_refunded: ['refunded', 'partially_refunded'],
  // Terminal.
  cancelled: [],
  refunded: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true // Idempotent re-delivery of the same event.
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal order transition: ${from} -> ${to}`)
  }
}

export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0
}

/** Only a paid or confirmed order can be refunded. */
export function isRefundable(status: OrderStatus): boolean {
  return status === 'paid' || status === 'confirmed' || status === 'partially_refunded'
}

/**
 * Resolve the order status after a refund.
 *
 * Compares against the order total rather than tracking a boolean, so a
 * sequence of partial refunds that happens to add up to the full amount
 * correctly lands on `refunded`.
 */
export function statusAfterRefund(
  current: OrderStatus,
  totalMinor: number,
  alreadyRefundedMinor: number,
  refundMinor: number,
): OrderStatus {
  if (!isRefundable(current)) {
    throw new Error(`Cannot refund an order in status "${current}"`)
  }
  if (!Number.isInteger(refundMinor) || refundMinor <= 0) {
    throw new Error(`Refund amount must be a positive integer, got ${refundMinor}`)
  }

  const total = alreadyRefundedMinor + refundMinor
  if (total > totalMinor) {
    throw new Error(
      `Refund would exceed the order total: ${total} > ${totalMinor}. Refunding more than was charged is never correct.`,
    )
  }

  return total === totalMinor ? 'refunded' : 'partially_refunded'
}

/**
 * Map a provider event to the status it implies, or null when it implies
 * nothing (an unknown or informational event should never move state).
 */
export function statusForWebhook(
  eventType:
    | 'payment.succeeded'
    | 'payment.failed'
    | 'payment.cancelled'
    | 'refund.succeeded'
    | 'unknown',
): OrderStatus | null {
  switch (eventType) {
    case 'payment.succeeded':
      return 'paid'
    case 'payment.failed':
    case 'payment.cancelled':
      return 'cancelled'
    // Refunds carry an amount, so the resulting status depends on arithmetic
    // rather than the event type alone. statusAfterRefund decides.
    case 'refund.succeeded':
    case 'unknown':
      return null
  }
}

/**
 * Whether an entitlement granted by this order should now be revoked.
 * Refunding map access must actually take the map away.
 */
export function shouldRevokeEntitlements(status: OrderStatus): boolean {
  return status === 'refunded' || status === 'cancelled'
}
