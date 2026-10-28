/**
 * How long an authorised booking still has before the automatic release —
 * pure, for the Studio (dashboard, orders list, order page) and the staff
 * reminder sweep.
 *
 * An order with something a supplier must run is only AUTHORISED at checkout
 * (`./capture.ts`). Staff confirm with the operator and then charge it, or
 * release it. `AUTHORIZATION_DAYS` after `orders.authorized_at` the capacity
 * sweep releases it on its own (`expiredAuthorizations`).
 *
 * Staff are reminded twice while it waits (owner, Oct 2026): after 24 hours
 * and after 4 days. Each reminder is sent once per order.
 */

import { AUTHORIZATION_DAYS } from './capture'

const HOUR_MS = 60 * 60 * 1000

/** Reminder stages, in order, with the age (hours since authorisation) at which each is due. */
export const STAFF_REMINDER_STAGES = [
  { stage: '24h', afterHours: 24 },
  { stage: '4d', afterHours: 4 * 24 },
] as const

export type StaffReminderStage = (typeof STAFF_REMINDER_STAGES)[number]['stage']

/** When the automatic release happens. */
export function releaseDeadline(authorizedAt: Date, days: number = AUTHORIZATION_DAYS): Date {
  return new Date(authorizedAt.getTime() + days * 24 * HOUR_MS)
}

/** Whole hours left before the automatic release (0 once it is due). */
export function hoursLeft(
  authorizedAt: Date,
  now: Date,
  days: number = AUTHORIZATION_DAYS,
): number {
  const left = releaseDeadline(authorizedAt, days).getTime() - now.getTime()
  return left <= 0 ? 0 : Math.floor(left / HOUR_MS)
}

/** `{ days, hours }` left, for a short label such as «4d 6h». */
export function timeLeftParts(
  authorizedAt: Date,
  now: Date,
  days: number = AUTHORIZATION_DAYS,
): { days: number; hours: number } {
  const total = hoursLeft(authorizedAt, now, days)
  return { days: Math.floor(total / 24), hours: total % 24 }
}

/** Under a day left: shown in red. */
export function isUrgent(
  authorizedAt: Date,
  now: Date,
  days: number = AUTHORIZATION_DAYS,
): boolean {
  return hoursLeft(authorizedAt, now, days) < 24
}

/**
 * The reminder that is due now, or null. Only the latest due stage is
 * returned: an order first seen at five days old gets the 4-day reminder,
 * not both. Nothing once the release is due (the sweep releases it).
 */
export function dueReminderStage(
  authorizedAt: Date,
  now: Date,
  days: number = AUTHORIZATION_DAYS,
): StaffReminderStage | null {
  const age = now.getTime() - authorizedAt.getTime()
  if (age >= days * 24 * HOUR_MS) return null
  let due: StaffReminderStage | null = null
  for (const { stage, afterHours } of STAFF_REMINDER_STAGES) {
    if (age >= afterHours * HOUR_MS) due = stage
  }
  return due
}
