import type { BookingResult, SupplierAdapter } from '../adapter'

/**
 * Manual: the team books with the supplier by phone, WhatsApp or e-mail —
 * the flow Studio has had since Phase 2 (Orders → line → "Confirmed with the
 * supplier"). Nothing is sent anywhere; each method answers what the booking
 * needs next, and the caller writes it to the connection's log.
 */

const byHand = (note: string): BookingResult => ({
  supplierRef: null,
  status: 'pending_supplier',
  note,
})

export const manualAdapter: SupplierAdapter = {
  type: 'manual',
  implemented: true,

  async createBooking(_context, booking) {
    return byHand(
      `Book ${booking.reference} with the supplier by hand, then record their reference.`,
    )
  },

  async cancelBooking(_context, supplierRef) {
    return byHand(`Cancel ${supplierRef} with the supplier by hand.`)
  },

  async getBookingStatus(_context, supplierRef) {
    // The status is whatever staff recorded; there is no remote system to ask.
    return { supplierRef, status: 'confirmed', note: 'Recorded by staff.' }
  },
}
