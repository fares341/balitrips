import { describe, expect, it } from 'vitest'

import {
  BOOKING_STATUSES,
  bookingStatusAfterPaid,
  bookingStatusAfterPayment,
  canMoveBooking,
  holdsCapacity,
  canRetryPayment,
  itemTag,
  paymentState,
  type PaymentAttempt,
} from './booking-status'

const at = (status: string, minutes: number, method: string | null = null): PaymentAttempt => ({
  status,
  method,
  createdAt: new Date(Date.UTC(2026, 9, 14, 10, minutes)),
})

describe('booking status transitions', () => {
  it('follows the handoff ladder', () => {
    expect(canMoveBooking('created', 'sent_to_provider')).toBe(true)
    expect(canMoveBooking('sent_to_provider', 'confirmed')).toBe(true)
    expect(canMoveBooking('confirmed', 'completed')).toBe(true)
    expect(canMoveBooking('cancel_requested', 'cancelled')).toBe(true)
    expect(canMoveBooking('cancelled', 'refunded')).toBe(true)
  })
  it('never goes back to created and refunded is terminal', () => {
    expect(canMoveBooking('confirmed', 'created')).toBe(false)
    expect(canMoveBooking('refunded', 'cancelled')).toBe(false)
    expect(canMoveBooking('completed', 'confirmed')).toBe(false)
  })
  it('a repeat of the same status is a no-op, not an error', () => {
    expect(canMoveBooking('confirmed', 'confirmed')).toBe(true)
  })
})

describe('bookingStatusAfterPaid', () => {
  it('completes digital products on payment', () => {
    expect(bookingStatusAfterPaid('itinerary', 'created')).toBe('completed')
    expect(bookingStatusAfterPaid('plan', 'created')).toBe('completed')
    expect(bookingStatusAfterPaid('custom', 'created')).toBe('completed')
  })
  it('never confirms a provider booking because money arrived', () => {
    expect(bookingStatusAfterPaid('activity', 'created')).toBeNull()
    expect(bookingStatusAfterPaid('activity_tier', 'created')).toBeNull()
    expect(bookingStatusAfterPaid('driver', 'created')).toBeNull()
    expect(bookingStatusAfterPaid('package', 'created')).toBeNull()
  })
  it('leaves an item staff already moved alone', () => {
    expect(bookingStatusAfterPaid('itinerary', 'cancelled')).toBeNull()
  })
})

describe('paymentState', () => {
  it('paid, confirmed and partly refunded orders are a success', () => {
    expect(paymentState('paid', [])).toBe('success')
    expect(paymentState('confirmed', [])).toBe('success')
    expect(paymentState('partially_refunded', [])).toBe('success')
  })
  it('a pending order with a failed last attempt is failed (retryable)', () => {
    const attempts = [at('failed', 1)]
    expect(paymentState('pending', attempts)).toBe('failed')
    expect(canRetryPayment('pending', attempts)).toBe(true)
  })
  it('the latest attempt decides: a retry in flight is processing', () => {
    const attempts = [at('failed', 1), at('requires_action', 5)]
    expect(paymentState('pending', attempts)).toBe('processing')
    expect(canRetryPayment('pending', attempts)).toBe(false)
  })
  it('a settling bank transfer awaits the transfer', () => {
    expect(paymentState('pending', [at('processing', 1, 'customer_balance')])).toBe('transfer')
    expect(paymentState('pending', [at('processing', 1, 'card')])).toBe('processing')
  })
  it('cancelled orders cannot be retried', () => {
    expect(paymentState('cancelled', [at('failed', 1)])).toBe('cancelled')
    expect(canRetryPayment('cancelled', [at('failed', 1)])).toBe(false)
  })
  it('no attempt yet reads as processing', () => {
    expect(paymentState('pending', [])).toBe('processing')
  })
})

describe('itemTag', () => {
  it('shows "Confirmed" only when the provider confirmed', () => {
    expect(itemTag('success', 'activity', 'created').key).toBe('trip_st_awaiting')
    expect(itemTag('success', 'activity', 'sent_to_provider').key).toBe('trip_st_awaiting')
    expect(itemTag('success', 'activity', 'confirmed').key).toBe('trip_st_confirmed')
  })
  it('digital products read as ready / unlocked', () => {
    expect(itemTag('success', 'itinerary', 'completed').key).toBe('trip_st_ready')
    expect(itemTag('success', 'plan', 'completed').key).toBe('trip_st_unlocked')
  })
  it('payment problems win over the item status', () => {
    expect(itemTag('failed', 'activity', 'created').key).toBe('trip_st_unpaid')
    expect(itemTag('transfer', 'activity', 'created').key).toBe('trip_st_transfer')
    expect(itemTag('processing', 'itinerary', 'created').key).toBe('trip_st_processing')
  })
  it('cancellation and refund states show through', () => {
    expect(itemTag('success', 'activity', 'cancel_requested').tone).toBe('warn')
    expect(itemTag('success', 'activity', 'refunded').key).toBe('trip_st_refunded')
    expect(itemTag('cancelled', 'activity', 'created').key).toBe('trip_st_cancelled')
  })
})

describe('phase 2 statuses', () => {
  it('keeps every existing status', () => {
    for (const status of [
      'created',
      'sent_to_provider',
      'confirmed',
      'completed',
      'cancel_requested',
      'cancelled',
      'refunded',
    ]) {
      expect(BOOKING_STATUSES).toContain(status)
    }
  })
  it('waits for the supplier, then confirms, runs and completes', () => {
    expect(canMoveBooking('created', 'pending_supplier')).toBe(true)
    expect(canMoveBooking('pending_supplier', 'confirmed')).toBe(true)
    expect(canMoveBooking('confirmed', 'in_progress')).toBe(true)
    expect(canMoveBooking('in_progress', 'completed')).toBe(true)
  })
  it('a paid booking without places can be sorted out or given back', () => {
    expect(canMoveBooking('created', 'pending_availability')).toBe(true)
    expect(canMoveBooking('pending_availability', 'pending_supplier')).toBe(true)
    expect(canMoveBooking('pending_availability', 'confirmed')).toBe(true)
    expect(canMoveBooking('pending_availability', 'cancelled')).toBe(true)
  })
  it('a failed booking goes to another supplier or is refunded, never straight to confirmed', () => {
    expect(canMoveBooking('failed', 'pending_supplier')).toBe(true)
    expect(canMoveBooking('failed', 'refunded')).toBe(true)
    expect(canMoveBooking('failed', 'confirmed')).toBe(false)
    expect(canMoveBooking('in_progress', 'cancelled')).toBe(false)
    expect(canMoveBooking('pending_supplier', 'created')).toBe(false)
  })
  it('holds places until the booking ends for good', () => {
    expect(holdsCapacity('pending_supplier')).toBe(true)
    expect(holdsCapacity('confirmed')).toBe(true)
    expect(holdsCapacity('cancelled')).toBe(false)
    expect(holdsCapacity('failed')).toBe(false)
  })
})

describe('bookingStatusAfterPayment', () => {
  const activity = { kind: 'activity_tier', current: 'created' as const }
  it('confirms only an instant supplier offer with places held (or no limit)', () => {
    expect(bookingStatusAfterPayment({ ...activity, instant: true, capacity: 'reserved' })).toBe(
      'confirmed',
    )
    expect(bookingStatusAfterPayment({ ...activity, instant: true, capacity: 'unlimited' })).toBe(
      'confirmed',
    )
  })
  it('never confirms a booking that needs the supplier: it waits, paid', () => {
    expect(bookingStatusAfterPayment({ ...activity, instant: false, capacity: 'reserved' })).toBe(
      'pending_supplier',
    )
    expect(bookingStatusAfterPayment({ ...activity, instant: false, capacity: 'unlimited' })).toBe(
      'pending_supplier',
    )
  })
  it('no places left (or the date closed) → pending availability, even with an instant offer', () => {
    expect(bookingStatusAfterPayment({ ...activity, instant: true, capacity: 'full' })).toBe(
      'pending_availability',
    )
    expect(bookingStatusAfterPayment({ ...activity, instant: false, capacity: 'closed' })).toBe(
      'pending_availability',
    )
  })
  it('digital products still complete; other provider lines wait', () => {
    expect(
      bookingStatusAfterPayment({
        kind: 'plan',
        current: 'created',
        instant: false,
        capacity: 'unlimited',
      }),
    ).toBe('completed')
    expect(
      bookingStatusAfterPayment({
        kind: 'driver',
        current: 'created',
        instant: false,
        capacity: 'unlimited',
      }),
    ).toBe('pending_supplier')
  })
  it('leaves a line staff already moved alone (re-run safe)', () => {
    expect(
      bookingStatusAfterPayment({
        ...activity,
        current: 'cancelled',
        instant: true,
        capacity: 'reserved',
      }),
    ).toBeNull()
  })
  it('new statuses have a customer tag', () => {
    expect(itemTag('success', 'activity', 'pending_supplier').key).toBe('trip_st_awaiting')
    expect(itemTag('success', 'activity', 'pending_availability').key).toBe(
      'trip_st_pending_availability',
    )
    expect(itemTag('success', 'activity', 'in_progress').key).toBe('trip_st_in_progress')
    expect(itemTag('success', 'activity', 'failed').tone).toBe('err')
  })
})
