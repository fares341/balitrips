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
import { addActivityBooking, type ActivityBookingIssue } from '@/lib/cart'

import type { BookActivityRequest, BookActivityResponse, BookingField } from './booking-contract'

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
  return {
    activityId,
    packageId,
    date,
    endDate,
    time,
    people,
    addons,
    driver: v.driver === true,
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
    const result = await addActivityBooking(request)
    if (!result.ok) {
      const first = result.issues[0]
      const code = first?.code ?? 'invalid'
      const field: BookingField = first?.driver
        ? 'driver'
        : (FIELD_OF[code as ActivityBookingIssue] ?? 'form')
      return { ok: false, field, code }
    }
    revalidatePath('/[locale]/cart', 'page')
    revalidatePath('/[locale]/checkout', 'page')
    return {
      ok: true,
      itemCount: result.itemCount,
      totalMinor: result.totalMinor,
      currency: result.currency,
    }
  } catch (error) {
    console.error('[bookActivityAction]', error)
    return { ok: false, field: 'form', code: 'error' }
  }
}
