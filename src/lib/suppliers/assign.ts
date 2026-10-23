/**
 * Which supplier runs a booked activity — the pure rules (phase 2).
 *
 * Several companies may offer the same activity, each with its own cost,
 * departures, notice and confirmation terms. The customer books the package;
 * on payment the booking is given to the best offer that fits it:
 *
 *   1. the offer and its supplier are active;
 *   2. it covers the package booked (an offer for one package, or for all);
 *   3. it runs the departure booked (no time list = every departure);
 *   4. the supplier's notice still allows the date (its own lead time);
 *   5. among those: highest priority, then an offer made for this exact
 *      package over a general one, then the lower cost, then the oldest.
 *
 * Staff can change the supplier afterwards on the order page.
 *
 * No I/O. `now` is passed in.
 */

import { isWithinLeadTime } from '@/lib/booking-rules'

export const SUPPLIER_TYPES = ['activity_company', 'transport', 'driver', 'other'] as const
export type SupplierType = (typeof SUPPLIER_TYPES)[number]

export const CONFIRMATION_MODES = ['instant', 'needs_supplier_confirmation'] as const
export type ConfirmationMode = (typeof CONFIRMATION_MODES)[number]

export function supplierType(value: string | null | undefined): SupplierType {
  return (SUPPLIER_TYPES as readonly string[]).includes(value ?? '')
    ? (value as SupplierType)
    : 'other'
}

export function confirmationMode(value: string | null | undefined): ConfirmationMode {
  return value === 'instant' ? 'instant' : 'needs_supplier_confirmation'
}

export interface OfferFacts {
  id: string
  supplierId: string
  /** Null = every package of the activity. */
  tierId: string | null
  costMinor: number
  currency: string
  /** `HH:mm`. Empty = every departure. */
  timeSlots: readonly string[]
  confirmationMode: ConfirmationMode
  confirmWithinHours: number
  leadTimeHours: number | null
  active: boolean
  priority: number
  /** The supplier is active (not paused, not deleted). */
  supplierActive: boolean
  createdAt: Date
}

export interface BookingFacts {
  /** The package booked; null for an activity sold without packages. */
  tierId: string | null
  travelDate: string | null
  /** Departure time, `HH:mm[:ss]`, or null. */
  travelTime: string | null
}

function hhmm(time: string): string {
  const [h = '', m = ''] = time.trim().split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

/** Offers that could run this booking, unordered. */
export function eligibleOffers(
  offers: readonly OfferFacts[],
  booking: BookingFacts,
  now: Date,
): OfferFacts[] {
  return offers.filter((offer) => {
    if (!offer.active || !offer.supplierActive) return false
    if (offer.tierId !== null && offer.tierId !== booking.tierId) return false
    if (offer.timeSlots.length > 0 && booking.travelTime) {
      if (!offer.timeSlots.map(hhmm).includes(hhmm(booking.travelTime))) return false
    }
    if (offer.leadTimeHours !== null && offer.leadTimeHours > 0 && booking.travelDate) {
      const at = booking.travelTime ? hhmm(booking.travelTime) : '00:00'
      if (!isWithinLeadTime(booking.travelDate, at, offer.leadTimeHours, now)) return false
    }
    return true
  })
}

/** Ordering of rule 5: negative when `a` should be chosen before `b`. */
export function compareOffers(a: OfferFacts, b: OfferFacts): number {
  if (a.priority !== b.priority) return b.priority - a.priority
  const specificA = a.tierId === null ? 1 : 0
  const specificB = b.tierId === null ? 1 : 0
  if (specificA !== specificB) return specificA - specificB
  if (a.currency === b.currency && a.costMinor !== b.costMinor) return a.costMinor - b.costMinor
  return a.createdAt.getTime() - b.createdAt.getTime()
}

/** The offer a paid booking is given to, or null when none fits. */
export function pickOffer(
  offers: readonly OfferFacts[],
  booking: BookingFacts,
  now: Date,
): OfferFacts | null {
  const fit = eligibleOffers(offers, booking, now).sort(compareOffers)
  return fit[0] ?? null
}

/**
 * What the customer is told before paying.
 *
 *  - `null`: no supplier offer is set up for this activity — nothing new is
 *    promised (the page keeps its own wording, staff confirm by hand);
 *  - `instant`: the offer that would get the booking confirms at once;
 *  - otherwise: "the supplier confirms within N hours".
 */
export type ConfirmationPromise = { instant: true } | { instant: false; hours: number }

export function confirmationPromise(
  offers: readonly OfferFacts[],
  booking: BookingFacts,
  now: Date,
): ConfirmationPromise | null {
  const live = offers.filter((offer) => offer.active && offer.supplierActive)
  if (live.length === 0) return null
  const chosen = pickOffer(live, booking, now)
  if (chosen === null) {
    // Nothing fits this exact date/time: the slowest promise of the live offers.
    const hours = Math.max(...live.map((offer) => offer.confirmWithinHours), 1)
    return { instant: false, hours }
  }
  return chosen.confirmationMode === 'instant'
    ? { instant: true }
    : { instant: false, hours: Math.max(1, chosen.confirmWithinHours) }
}

/**
 * Cost of one booked line under an offer: per person for a per-person
 * package (children included — suppliers rarely discount them; edit on the
 * order if they do), per charged unit (group / couple) otherwise.
 */
export function lineCostMinor(
  offer: Pick<OfferFacts, 'costMinor'>,
  pricing: 'per_person' | 'per_group' | 'per_couple' | 'fixed',
  people: number,
  units: number,
): number {
  const count = pricing === 'per_person' ? people : units
  return offer.costMinor * Math.max(1, count)
}
