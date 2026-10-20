'use server'

/**
 * "Add to My Trip" / "Book now" from the activity booking box.
 *
 * The client sends WHAT (ids, date, time, people, add-on ids and quantities,
 * driver yes/no) and never a price. `addActivityBooking` validates the whole
 * booking with the same `buildQuote` checkout uses and stores it only when
 * checkout would accept it; the first problem comes back mapped to the step
 * of the booking box it belongs to.
 */

import { revalidatePath } from 'next/cache'

import { bookingsOpen } from '@/lib/bookings-open'
import { FEATURES } from '@/lib/features'
import {
  addActivityBooking,
  getBookingForEdit,
  removeItem,
  type ActivityBookingIssue,
} from '@/lib/cart'

import { loadAvailability } from '@/lib/booking/extras'
import { compareOffers } from '@/lib/suppliers/assign'
import { loadOffers } from '@/lib/suppliers/offers'

import type {
  BookActivityRequest,
  BookActivityResponse,
  BookingFacts,
  BookingField,
  EditableBooking,
} from './booking-contract'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/
const PLAIN_TIME = /^\d{2}:\d{2}$/

const FIELD_OF: Partial<Record<ActivityBookingIssue, BookingField>> = {
  unknown_item: 'package',
  package_unavailable: 'package',
  missing_date: 'date',
  date_in_past: 'date',
  invalid_date_range: 'date',
  missing_time: 'time',
  invalid_time_slot: 'time',
  lead_time_passed: 'time',
  guests_exceed_max: 'people',
  guests_below_min: 'people',
  included_missing_time: 'included',
  included_invalid_time: 'included',
  date_closed: 'date',
  sold_out: 'date',
  invalid_quantity: 'people',
  invalid_addon: 'addons',
  driver_full: 'driver',
  currency_mismatch: 'driver',
}

function parse(input: unknown): BookActivityRequest | null {
  if (typeof input !== 'object' || input === null) return null
  const v = input as Record<string, unknown>
  const str = (x: unknown) => (typeof x === 'string' && x !== '' ? x : null)
  const activityId = str(v.activityId)
  const packageId = str(v.packageId)
  if (activityId === null || !UUID.test(activityId)) return null
  if (packageId !== null && !UUID.test(packageId)) return null
  const date = str(v.date) ?? ''
  const endDate = str(v.endDate)
  const time = str(v.time)
  if (endDate !== null && !PLAIN_DATE.test(endDate)) return null
  if (time !== null && !PLAIN_TIME.test(time)) return null
  const people = typeof v.people === 'number' && Number.isInteger(v.people) ? v.people : 0
  const count = (x: unknown) =>
    typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 100 ? x : 0
  const children = count(v.children)
  const infants = count(v.infants)
  const addons: { id: string; qty: number }[] = []
  if (Array.isArray(v.addons)) {
    for (const a of v.addons.slice(0, 40)) {
      if (typeof a !== 'object' || a === null) return null
      const id = (a as Record<string, unknown>).id
      const qty = (a as Record<string, unknown>).qty
      if (typeof id !== 'string' || !UUID.test(id)) return null
      addons.push({ id, qty: typeof qty === 'number' && Number.isInteger(qty) ? qty : 0 })
    }
  }
  const included: { activityId: string; time: string | null }[] = []
  if (Array.isArray(v.included)) {
    for (const entry of v.included.slice(0, 20)) {
      if (typeof entry !== 'object' || entry === null) return null
      const activity = (entry as Record<string, unknown>).activityId
      const at = str((entry as Record<string, unknown>).time)
      if (typeof activity !== 'string' || !UUID.test(activity)) return null
      if (at !== null && !PLAIN_TIME.test(at)) return null
      included.push({ activityId: activity, time: at })
    }
  }
  return {
    activityId,
    packageId,
    date,
    endDate,
    time,
    people,
    children,
    infants,
    addons,
    included,
    // No driver while the service is switched off (lib/features.ts).
    driver: FEATURES.driver && v.driver === true,
    replaceItemId:
      typeof v.replaceItemId === 'string' && UUID.test(v.replaceItemId) ? v.replaceItemId : null,
  }
}

export async function bookActivityAction(input: unknown): Promise<BookActivityResponse> {
  if (!bookingsOpen())
    return { ok: false, field: 'form', code: 'closed', reason: 'bookings_closed' }

  const request = parse(input)
  if (request === null) return { ok: false, field: 'form', code: 'invalid' }
  // Required fields, checked before the catalogue so the answer is instant.
  if (!PLAIN_DATE.test(request.date)) return { ok: false, field: 'date', code: 'missing_date' }
  if (request.people < 1) return { ok: false, field: 'people', code: 'invalid_quantity' }

  try {
    const { replaceItemId, ...booking } = request
    const result = await addActivityBooking(booking)
    if (!result.ok) {
      const first = result.issues[0]
      const code = first?.code ?? 'invalid'
      const field: BookingField = first?.driver
        ? 'driver'
        : (FIELD_OF[code as ActivityBookingIssue] ?? 'form')
      return { ok: false, field, code }
    }
    // Edited from My Trip: the old line goes once the new one is stored.
    let itemCount = result.itemCount
    if (replaceItemId && replaceItemId !== result.itemId) {
      itemCount = (await removeItem(replaceItemId)).itemCount
    }
    revalidatePath('/[locale]/my-trip', 'page')
    revalidatePath('/[locale]/checkout', 'page')
    return {
      ok: true,
      itemCount,
      totalMinor: result.totalMinor,
      currency: result.currency,
    }
  } catch (error) {
    console.error('[bookActivityAction]', error)
    return { ok: false, field: 'form', code: 'error' }
  }
}

/**
 * Closed dates, places left and confirmation terms for the booking box
 * (phase 2). Public and read-only; supplier costs and names never leave the
 * server.
 */
export async function loadBookingFactsAction(activityId: unknown): Promise<BookingFacts> {
  const empty: BookingFacts = { availability: null, offers: [] }
  if (typeof activityId !== 'string' || !UUID.test(activityId)) return empty
  try {
    const [availability, offers] = await Promise.all([
      loadAvailability([activityId], undefined, true),
      loadOffers([activityId]),
    ])
    const rules = availability.get(activityId) ?? null
    const live = (offers.get(activityId) ?? [])
      .filter((offer) => offer.active && offer.supplierActive)
      .sort(compareOffers)
    return {
      availability: rules
        ? {
            capacityPerSlot: rules.capacityPerSlot,
            closedWeekdays: [...rules.closedWeekdays],
            hasSlots: rules.hasSlots,
            rows: rules.rows.map((row) => ({ ...row })),
          }
        : null,
      offers: live.map((offer, rank) => ({
        tierId: offer.tierId,
        timeSlots: [...offer.timeSlots],
        instant: offer.confirmationMode === 'instant',
        confirmWithinHours: offer.confirmWithinHours,
        leadTimeHours: offer.leadTimeHours,
        rank,
      })),
    }
  } catch (error) {
    console.error('[loadBookingFactsAction]', error)
    return empty
  }
}

/** "Edit" on My Trip: the caller's own trip line, for the booking box to load. */
export async function loadTripBookingAction(itemId: unknown): Promise<EditableBooking | null> {
  if (typeof itemId !== 'string' || !UUID.test(itemId)) return null
  try {
    return await getBookingForEdit(itemId)
  } catch (error) {
    console.error('[loadTripBookingAction]', error)
    return null
  }
}
