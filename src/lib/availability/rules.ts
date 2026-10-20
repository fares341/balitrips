/**
 * Activity availability — the pure rules (phase 2).
 *
 * Places are counted per departure: per (date, time) for an activity with
 * time slots, per date for one without. The owner sets
 *
 *   - a default number of places per departure (`activities.capacity_per_slot`;
 *     null = unlimited, the behaviour before phase 2),
 *   - weekdays the activity never runs (`activities.closed_weekdays`),
 *   - per-date rows (`activity_availability`): a day row (`slot = ''`) closes
 *     the whole date or overrides its capacity for every departure; a slot
 *     row closes / overrides one departure. Booked counts live on the row of
 *     the departure (the day row when there are no time slots).
 *
 * Shared by the booking box (display), add-to-trip / cart / checkout
 * (re-check) and the payment path (what to hold). Only the conditional UPDATE
 * in `./activity.ts` actually reserves — anything read earlier may be stale.
 *
 * No I/O, no clock.
 */

export interface AvailabilityRow {
  day: string
  /** `HH:mm`, or '' for the whole day. */
  slot: string
  capacity: number | null
  booked: number
  isClosed: boolean
}

export interface AvailabilityRules {
  /** Places per departure. Null = unlimited. */
  capacityPerSlot: number | null
  /** 0 = Sunday … 6 = Saturday. */
  closedWeekdays: readonly number[]
  /** Does the activity have fixed departures? Decides the counting key. */
  hasSlots: boolean
  rows: readonly AvailabilityRow[]
}

export type AvailabilityVerdict =
  | { ok: true; /** Places left; null = unlimited. */ remaining: number | null }
  | { ok: false; reason: 'closed' | 'full'; remaining: number }

/** Weekday of a plain `YYYY-MM-DD` date (0 = Sunday), independent of any time zone. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay()
}

/** Normalise a clock time to `HH:mm` (`time` columns read back as `HH:mm:ss`). */
export function slotKey(time: string | null | undefined): string {
  if (time === null || time === undefined || time.trim() === '') return ''
  const [hours = '', minutes = ''] = time.trim().split(':')
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
}

/** The row that counts bookings for this departure. */
export function counterSlot(
  rules: Pick<AvailabilityRules, 'hasSlots'>,
  time: string | null,
): string {
  return rules.hasSlots ? slotKey(time) : ''
}

/** True when nothing limits this activity: no capacity, no closures. */
export function isUnrestricted(rules: AvailabilityRules): boolean {
  return (
    rules.capacityPerSlot === null &&
    rules.closedWeekdays.length === 0 &&
    rules.rows.every((row) => row.capacity === null && !row.isClosed)
  )
}

/**
 * Capacity in force for one departure: the slot row's override, else the day
 * row's, else the activity default. Null = unlimited.
 */
export function effectiveCapacity(
  rules: AvailabilityRules,
  day: string,
  time: string | null,
): number | null {
  const slot = counterSlot(rules, time)
  const slotRow = slot === '' ? undefined : findRow(rules, day, slot)
  const dayRow = findRow(rules, day, '')
  return slotRow?.capacity ?? dayRow?.capacity ?? rules.capacityPerSlot
}

function findRow(rules: AvailabilityRules, day: string, slot: string): AvailabilityRow | undefined {
  return rules.rows.find((row) => row.day === day && row.slot === slot)
}

export function isDayClosed(rules: AvailabilityRules, day: string): boolean {
  if (rules.closedWeekdays.includes(weekdayOf(day))) return true
  return findRow(rules, day, '')?.isClosed === true
}

/**
 * Can `people` more places be sold for this date (and departure)?
 * `people` ≤ 0 asks "is it open at all".
 */
export function checkAvailability(
  rules: AvailabilityRules,
  day: string,
  time: string | null,
  people: number,
): AvailabilityVerdict {
  if (isDayClosed(rules, day)) return { ok: false, reason: 'closed', remaining: 0 }
  const slot = counterSlot(rules, time)
  const counter = findRow(rules, day, slot)
  if (slot !== '' && counter?.isClosed === true)
    return { ok: false, reason: 'closed', remaining: 0 }
  const capacity = effectiveCapacity(rules, day, time)
  if (capacity === null) return { ok: true, remaining: null }
  const remaining = Math.max(0, capacity - (counter?.booked ?? 0))
  if (remaining <= 0 || people > remaining) return { ok: false, reason: 'full', remaining }
  return { ok: true, remaining }
}

/** A whole day is unavailable when it is closed or every departure is closed/full. */
export function isDayUnavailable(
  rules: AvailabilityRules,
  day: string,
  slots: readonly string[],
): boolean {
  if (isDayClosed(rules, day)) return true
  if (!rules.hasSlots || slots.length === 0) return !checkAvailability(rules, day, null, 1).ok
  return slots.every((slot) => !checkAvailability(rules, day, slot, 1).ok)
}

/** Rules with nothing configured: everything open, unlimited. */
export function openRules(hasSlots: boolean): AvailabilityRules {
  return { capacityPerSlot: null, closedWeekdays: [], hasSlots, rows: [] }
}

/** Clean a stored weekday list (jsonb) into 0–6 integers, unique and sorted. */
export function weekdayList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter(
        (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6,
      ),
    ),
  ].sort((a, b) => a - b)
}
