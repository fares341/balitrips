/**
 * Wire types of the activity booking action (a 'use server' file may export
 * only async functions, so its input and result types live here).
 */

export interface BookActivityRequest {
  activityId: string
  /** Package (activity tier) id, or null for an activity without packages. */
  packageId: string | null
  date: string
  endDate: string | null
  time: string | null
  people: number
  addons: { id: string; qty: number }[]
  driver: boolean
}

/** Which booking-box step an issue belongs to, so the page can mark it. */
export type BookingField = 'package' | 'date' | 'time' | 'people' | 'addons' | 'driver' | 'form'

export type BookActivityResponse =
  | { ok: true; itemCount: number; totalMinor: number; currency: string }
  | {
      ok: false
      /** First problem, mapped to a field; `code` picks the message. */
      field: BookingField
      code: string
      reason?: 'bookings_closed'
    }
