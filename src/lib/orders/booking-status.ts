/**
 * Booking-item status and the customer-facing payment state (v3 handoff,
 * "Booking & payment states").
 *
 *   payment:  pending → processing → paid | failed | awaiting_transfer → paid
 *   item:     created → sent_to_provider → confirmed → completed
 *             · cancel_requested → cancelled → refunded
 *
 * Two rules from the handoff are enforced by the shape of this module rather
 * than by convention:
 *
 *  1. **"Confirmed" means the provider confirmed.** Payment never moves an
 *     item to `confirmed`; only `bookingStatusAfterPaid` runs on payment, and
 *     it touches digital products alone. A paid activity stays `created`
 *     ("awaiting provider confirmation") until staff record the provider's
 *     answer.
 *  2. **Digital products complete on payment.** An itinerary file, map
 *     access (a plan) and a paid custom itinerary are delivered by the
 *     payment itself, so they go straight to `completed`.
 *
 * Pure: no database, no clock. The webhook, the Studio action and the order
 * page all read from here so the three cannot disagree.
 */

export const BOOKING_STATUSES = [
  'created',
  'sent_to_provider',
  'confirmed',
  'completed',
  'cancel_requested',
  'cancelled',
  'refunded',
] as const

export type BookingStatus = (typeof BOOKING_STATUSES)[number]

export function isBookingStatus(value: string): value is BookingStatus {
  return (BOOKING_STATUSES as readonly string[]).includes(value)
}

/**
 * Order-item kinds the payment itself delivers. `place` is a saved place —
 * free, nothing to book — so it is "done" the moment the order is.
 */
const DIGITAL_KINDS: ReadonlySet<string> = new Set(['itinerary', 'plan', 'custom', 'place'])

export function isDigitalKind(kind: string): boolean {
  return DIGITAL_KINDS.has(kind)
}

/**
 * Allowed moves. Nothing returns to `created`, and `refunded` is terminal.
 * `created → confirmed` is allowed on purpose: a provider who confirms on the
 * phone before anything was "sent" is the common case, not the edge one.
 */
const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  created: ['sent_to_provider', 'confirmed', 'completed', 'cancel_requested', 'cancelled'],
  sent_to_provider: ['confirmed', 'cancel_requested', 'cancelled'],
  confirmed: ['completed', 'cancel_requested', 'cancelled'],
  completed: ['refunded'],
  // A withdrawn or refused request goes back to where the booking stood.
  cancel_requested: ['sent_to_provider', 'confirmed', 'cancelled'],
  cancelled: ['refunded'],
  refunded: [],
}

export function canMoveBooking(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return true
  return TRANSITIONS[from].includes(to)
}

/** Next statuses offered to staff for an item in `from`. */
export function nextBookingStatuses(from: BookingStatus): readonly BookingStatus[] {
  return TRANSITIONS[from]
}

/**
 * The status an item takes when its order is paid, or null to leave it alone.
 * Only digital products move; everything else waits for the provider.
 */
export function bookingStatusAfterPaid(kind: string, current: BookingStatus): BookingStatus | null {
  if (!isDigitalKind(kind)) return null
  if (current !== 'created') return null
  return 'completed'
}

// ---------------------------------------------------------------------------
// Payment state, as the customer sees it
// ---------------------------------------------------------------------------

/**
 * `success` — paid (or paid and later confirmed / partly refunded).
 * `failed` — the last attempt was declined or abandoned; the order is still
 *   open and the SAME order can be paid again.
 * `processing` — waiting for the provider's verdict (3-D Secure just
 *   finished, or a delayed method is settling).
 * `transfer` — a bank transfer was chosen at the provider and has not landed.
 * `cancelled` — the order expired or was cancelled; nothing can be paid.
 * `refunded` — fully refunded.
 */
export type PaymentState =
  | 'success'
  | 'failed'
  | 'processing'
  | 'transfer'
  | 'cancelled'
  | 'refunded'

export interface PaymentAttempt {
  status: string
  method: string | null
  createdAt: Date
}

/** Methods that leave a payment `processing` until money arrives by transfer. */
const TRANSFER_METHODS: ReadonlySet<string> = new Set([
  'bank_transfer',
  'customer_balance',
  'sepa_debit',
])

export function latestAttempt(attempts: readonly PaymentAttempt[]): PaymentAttempt | null {
  let latest: PaymentAttempt | null = null
  for (const attempt of attempts) {
    if (latest === null || attempt.createdAt.getTime() >= latest.createdAt.getTime()) {
      latest = attempt
    }
  }
  return latest
}

export function paymentState(
  orderStatus: string,
  attempts: readonly PaymentAttempt[],
): PaymentState {
  switch (orderStatus) {
    case 'paid':
    case 'confirmed':
    case 'partially_refunded':
      return 'success'
    case 'refunded':
      return 'refunded'
    case 'cancelled':
      return 'cancelled'
  }

  // pending
  const latest = latestAttempt(attempts)
  if (latest === null) return 'processing'
  if (latest.status === 'failed' || latest.status === 'cancelled') return 'failed'
  if (
    latest.status === 'processing' &&
    latest.method !== null &&
    TRANSFER_METHODS.has(latest.method)
  ) {
    return 'transfer'
  }
  return 'processing'
}

/** Whether "Try again" may be offered: an open order whose last attempt failed. */
export function canRetryPayment(orderStatus: string, attempts: readonly PaymentAttempt[]): boolean {
  return orderStatus === 'pending' && paymentState(orderStatus, attempts) === 'failed'
}

// ---------------------------------------------------------------------------
// One item's tag on the order page
// ---------------------------------------------------------------------------

export type ItemTone = 'ok' | 'warn' | 'err' | 'info' | 'palm' | 'forest'

export interface ItemTag {
  tone: ItemTone
  /** Message key (customer site, `trip_st_*`). */
  key: string
}

/**
 * The tag shown under one order item.
 *
 * Payment comes first: an unpaid item has no booking status worth showing.
 * Once paid, the item's own status speaks — and "Confirmed" appears only for
 * `confirmed`, never because the payment succeeded.
 */
export function itemTag(payment: PaymentState, kind: string, status: BookingStatus): ItemTag {
  if (payment === 'failed') return { tone: 'err', key: 'trip_st_unpaid' }
  if (payment === 'processing') return { tone: 'warn', key: 'trip_st_processing' }
  if (payment === 'transfer') return { tone: 'warn', key: 'trip_st_transfer' }

  switch (status) {
    case 'cancel_requested':
      return { tone: 'warn', key: 'trip_st_cancel_requested' }
    case 'cancelled':
      return { tone: 'err', key: 'trip_st_cancelled' }
    case 'refunded':
      return { tone: 'palm', key: 'trip_st_refunded' }
  }

  if (payment === 'cancelled') return { tone: 'err', key: 'trip_st_cancelled' }
  if (payment === 'refunded') return { tone: 'palm', key: 'trip_st_refunded' }

  switch (status) {
    case 'created':
    case 'sent_to_provider':
      return { tone: 'warn', key: 'trip_st_awaiting' }
    case 'confirmed':
      return { tone: 'ok', key: 'trip_st_confirmed' }
    case 'completed':
      if (kind === 'itinerary' || kind === 'custom') return { tone: 'ok', key: 'trip_st_ready' }
      if (kind === 'plan') return { tone: 'ok', key: 'trip_st_unlocked' }
      return { tone: 'ok', key: 'trip_st_completed' }
  }
}
