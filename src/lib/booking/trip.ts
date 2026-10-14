/**
 * My Trip helpers (v3 my-trip.html): the schedule-conflict warning, the
 * "your trip by day" strip and the driver suggestion shown before payment.
 *
 * Pure functions over the cart's lines, so the page and the checkout render
 * the same answer and both are unit-tested without a database.
 */

import { daysBetweenInclusive, vehicleForPassengers, type VehicleClass } from '@/lib/booking-rules'

/** The fields of a cart line these helpers read. */
export interface TripLineFacts {
  id: string
  kind: string
  travelDate: string | null
  endDate: string | null
  travelTime: string | null
  guests: number | null
  quantity: number
  parentItemId: string | null
}

const BOOKABLE_ACTIVITY = new Set(['activity', 'activity_tier'])

function hhmm(time: string | null): string | null {
  return time === null || time === '' ? null : time.slice(0, 5)
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

/**
 * Pairs of activities booked for the same day at the same departure time.
 *
 * The prototype also guessed an end time from a numeric duration; the
 * catalogue stores duration as free text ("3–4 hours"), so only an exact
 * clash is reported. A false "conflict" that blocks checkout would be worse
 * than a missed overlap the traveller can see on the day strip.
 */
export function scheduleConflicts<T extends TripLineFacts>(lines: readonly T[]): [T, T][] {
  const timed = lines.filter(
    (line) =>
      BOOKABLE_ACTIVITY.has(line.kind) &&
      line.travelDate !== null &&
      hhmm(line.travelTime) !== null,
  )
  const out: [T, T][] = []
  for (let a = 0; a < timed.length; a++) {
    for (let b = a + 1; b < timed.length; b++) {
      const x = timed[a]
      const y = timed[b]
      if (!x || !y) continue
      if (x.travelDate === y.travelDate && hhmm(x.travelTime) === hhmm(y.travelTime))
        out.push([x, y])
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Day strip
// ---------------------------------------------------------------------------

export interface TripDay<T> {
  date: string
  lines: T[]
}

/** Dated lines grouped by their first day, in date then time order. */
export function tripDays<T extends TripLineFacts>(lines: readonly T[]): TripDay<T>[] {
  const dated = lines
    .filter((line) => line.travelDate !== null)
    .slice()
    .sort((x, y) => {
      const a = `${x.travelDate}${hhmm(x.travelTime) ?? ''}`
      const b = `${y.travelDate}${hhmm(y.travelTime) ?? ''}`
      return a < b ? -1 : a > b ? 1 : 0
    })
  const days: TripDay<T>[] = []
  for (const line of dated) {
    const date = line.travelDate as string
    const last = days[days.length - 1]
    if (last && last.date === date) last.lines.push(line)
    else days.push({ date, lines: [line] })
  }
  return days
}

// ---------------------------------------------------------------------------
// Driver suggestion
// ---------------------------------------------------------------------------

export interface DriverRate {
  vehicleClass: VehicleClass
  dayRateMinor: number
  currency: string
}

export interface DriverSuggestion {
  /** The activity line the driver would be linked to. */
  itemId: string
  vehicleClass: VehicleClass
  days: number
  guests: number
  totalMinor: number
  currency: string
}

/**
 * Activities that would travel without a car, each priced with the vehicle
 * its party size implies (handoff `vehicleFor(people)`) over its own dates.
 *
 * Empty when the trip already has a driver line of any kind: the suggestion
 * is for a trip with activities "but no driver", and a traveller who booked
 * one for some days has made the choice already.
 *
 * A line whose vehicle has no rate in the activity's currency is skipped
 * rather than priced in a guessed currency.
 */
export function driverSuggestions(
  lines: readonly TripLineFacts[],
  rates: readonly DriverRate[],
): DriverSuggestion[] {
  if (lines.some((line) => line.kind === 'driver')) return []

  const out: DriverSuggestion[] = []
  for (const line of lines) {
    if (!BOOKABLE_ACTIVITY.has(line.kind) || line.travelDate === null) continue

    const guests = line.guests ?? line.quantity
    if (!Number.isInteger(guests) || guests < 1) continue
    const vehicleClass = vehicleForPassengers(guests)
    const rate = rates.find((r) => r.vehicleClass === vehicleClass)
    if (!rate) continue

    const days =
      line.endDate !== null && line.endDate !== line.travelDate
        ? daysBetweenInclusive(line.travelDate, line.endDate)
        : 1
    out.push({
      itemId: line.id,
      vehicleClass,
      days,
      guests,
      totalMinor: rate.dayRateMinor * days,
      currency: rate.currency,
    })
  }
  return out
}
