/**
 * Booking rules.
 *
 * These were scattered across three components in the prototype as
 * duplicated literals. They live here once, run on the server, and are
 * re-derived at checkout — the client is never trusted for any of them.
 */

/** Bali is UTC+8, year-round, no DST. */
export const BALI_UTC_OFFSET_HOURS = 8
export const BALI_TIME_ZONE = 'Asia/Makassar'

export type VehicleClass = 'sedan' | 'suv' | 'van'

/**
 * Vehicle auto-assignment by group size.
 *
 * The design states this as a hard rule: 1-4 sedan, 5-7 SUV, 8+ van.
 */
export function vehicleForPassengers(passengers: number): VehicleClass {
  if (!Number.isInteger(passengers) || passengers < 1) {
    throw new Error(`passengers must be a positive integer, got ${passengers}`)
  }
  if (passengers <= 4) return 'sedan'
  if (passengers <= 7) return 'suv'
  return 'van'
}

/**
 * Inclusive day count between two plain dates.
 *
 * Both endpoints count, so 12th to 14th is 3 days. Minimum 1.
 *
 * Takes plain 'YYYY-MM-DD' strings rather than Date objects on purpose:
 * a travel date is a calendar date in Bali, not an instant, and parsing it
 * into a Date drags in whatever timezone the caller happens to be in.
 */
export function daysBetweenInclusive(start: string, end: string): number {
  if (!isPlainDate(start) || !isPlainDate(end)) {
    throw new Error(`daysBetweenInclusive expects YYYY-MM-DD, got "${start}" and "${end}"`)
  }
  const startMs = Date.UTC(...splitDate(start))
  const endMs = Date.UTC(...splitDate(end))
  const days = Math.round((endMs - startMs) / 86_400_000) + 1
  return days > 0 ? days : 1
}

/**
 * Every calendar date a range occupies, inclusive of both endpoints.
 *
 * Used to walk per-day capacity rows. Lives here rather than beside the
 * capacity queries so it stays testable without a database connection.
 */
export function daysInRange(start: string, end: string): string[] {
  const count = daysBetweenInclusive(start, end)
  const [y, m, d] = splitDate(start)
  const days: string[] = []
  for (let i = 0; i < count; i++) {
    days.push(new Date(Date.UTC(y, m, d + i)).toISOString().slice(0, 10))
  }
  return days
}

/** Whether `end` is on or after `start`. The prototype silently clamped. */
export function isValidDateRange(start: string, end: string): boolean {
  if (!isPlainDate(start) || !isPlainDate(end)) return false
  return Date.UTC(...splitDate(end)) >= Date.UTC(...splitDate(start))
}

/** Today's calendar date in Bali, regardless of where the server runs. */
export function todayInBali(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BALI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** A travel date is in the past only if it is before today *in Bali*. */
export function isPastInBali(date: string, now: Date = new Date()): boolean {
  if (!isPlainDate(date)) throw new Error(`expected YYYY-MM-DD, got "${date}"`)
  return date < todayInBali(now)
}

/**
 * Whether a slot is still bookable given its lead time.
 *
 * Without this a 09:00 tour can be booked at 03:00 the same morning, which
 * the operator cannot fulfil.
 */
export function isWithinLeadTime(
  travelDate: string,
  travelTime: string,
  leadTimeHours: number,
  now: Date = new Date(),
): boolean {
  if (!isPlainDate(travelDate)) throw new Error(`expected YYYY-MM-DD, got "${travelDate}"`)
  const [hh, mm] = travelTime.split(':').map(Number)
  const [y, mo, d] = splitDate(travelDate)

  // Construct the slot as an instant by subtracting Bali's fixed offset.
  const slotMs = Date.UTC(y, mo, d, (hh ?? 0) - BALI_UTC_OFFSET_HOURS, mm ?? 0)
  return slotMs - now.getTime() >= leadTimeHours * 3_600_000
}

/**
 * «أقرب موعد للحجز» — how far ahead an activity must be booked, on Bali's
 * calendar (owner request, migration 0037).
 *
 * - `minAdvanceDays` null: the legacy rule — only `leadTimeHours` before the
 *   slot. 0 = same day, 1 = from tomorrow, 2 = from the day after, N = N days.
 * - `bookingCutoff` 'HH:MM' Bali time: once it has passed today, the earliest
 *   day moves one day later ("bookings for tomorrow close at 18:00").
 * - `leadTimeHours` is still applied on top (hours before the slot).
 * - `supplierLeadTimeHours`, when given, is the stricter of the two hour rules.
 */
export interface BookingWindow {
  leadTimeHours: number
  minAdvanceDays?: number | null
  bookingCutoff?: string | null
  supplierLeadTimeHours?: number | null
}

/** Bali wall-clock 'HH:MM' for an instant. */
export function timeInBali(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + BALI_UTC_OFFSET_HOURS * 3_600_000)
  return shifted.toISOString().slice(11, 16)
}

/** A plain date plus N calendar days (month and year ends handled by UTC). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = splitDate(date)
  return new Date(Date.UTC(y, m, d + days)).toISOString().slice(0, 10)
}

export function isValidCutoff(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** The first Bali calendar date the day rule allows (ignores the hour rule). */
export function earliestBookableDate(window: BookingWindow, now: Date = new Date()): string {
  const today = todayInBali(now)
  const days =
    typeof window.minAdvanceDays === 'number' && window.minAdvanceDays > 0
      ? Math.floor(window.minAdvanceDays)
      : 0
  let earliest = addDays(today, days)
  if (window.minAdvanceDays != null && isValidCutoff(window.bookingCutoff)) {
    if (timeInBali(now) >= window.bookingCutoff) earliest = addDays(earliest, 1)
  }
  return earliest
}

/** The hours-before-slot rule actually in force: the stricter of activity and supplier. */
export function effectiveLeadHours(window: BookingWindow): number {
  return Math.max(0, window.leadTimeHours ?? 0, window.supplierLeadTimeHours ?? 0)
}

/**
 * Whether a date (and slot, '00:00' when none) is bookable now: on or after
 * the earliest day AND outside the hours notice. Used by the calendar and
 * re-checked on the server by the quote, so a forged earlier date is refused.
 */
export function isBookableAt(
  travelDate: string,
  travelTime: string | null | undefined,
  window: BookingWindow,
  now: Date = new Date(),
): boolean {
  if (!isPlainDate(travelDate)) return false
  if (travelDate < earliestBookableDate(window, now)) return false
  return isWithinLeadTime(travelDate, travelTime ?? '00:00', effectiveLeadHours(window), now)
}

/** The Studio's «أقرب موعد للحجز» choices, mapped to `min_advance_days`. */
export type AdvanceMode = 'same_day' | 'tomorrow' | 'day_after' | 'days'
export const ADVANCE_MODES: readonly AdvanceMode[] = ['same_day', 'tomorrow', 'day_after', 'days']

export function advanceModeOf(minAdvanceDays: number | null | undefined): AdvanceMode {
  if (minAdvanceDays == null || minAdvanceDays <= 0) return 'same_day'
  if (minAdvanceDays === 1) return 'tomorrow'
  if (minAdvanceDays === 2) return 'day_after'
  return 'days'
}

/** Days for a mode; `days` takes the owner's number (1..365). Null = invalid. */
export function advanceDaysFor(mode: string, days: number | null): number | null {
  switch (mode) {
    case 'same_day':
      return 0
    case 'tomorrow':
      return 1
    case 'day_after':
      return 2
    case 'days':
      return days !== null && Number.isInteger(days) && days >= 1 && days <= 365 ? days : null
    default:
      return null
  }
}

function isPlainDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function splitDate(value: string): [number, number, number] {
  const [y, m, d] = value.split('-').map(Number)
  // Month is zero-based for Date.UTC.
  return [y ?? 0, (m ?? 1) - 1, d ?? 1]
}
