/**
 * Private-driver booking window (corrected spec §4) — pure.
 *
 * `minStartDate` = today in Bali + the notice days, counted from tomorrow
 * once the cutoff time has passed. A vehicle's own `noticeDaysOverride`
 * wins over the setting. Used by the Studio calendar preview now and by the
 * server check on the buyer page later, so both always agree.
 */

import type { DriverSettings } from './sales-settings'

/** YYYY-MM-DD and HH:MM of `now` in `timeZone`. */
export function localParts(now: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

/** Calendar arithmetic on YYYY-MM-DD (UTC noon, so no DST edge). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function weekday(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay()
}

export interface DriverWindow {
  today: string
  minStart: string
  maxStart: string
  noticeDays: number
  afterCutoff: boolean
}

export function driverWindow(
  settings: Pick<DriverSettings, 'noticeDays' | 'cutoffTime' | 'maxAdvanceDays' | 'timezone'>,
  now: Date,
  noticeDaysOverride?: number | null,
): DriverWindow {
  const { date: today, time } = localParts(now, settings.timezone)
  const noticeDays =
    noticeDaysOverride !== null && noticeDaysOverride !== undefined
      ? noticeDaysOverride
      : settings.noticeDays
  const afterCutoff = time >= settings.cutoffTime
  const base = afterCutoff ? addDays(today, 1) : today
  return {
    today,
    minStart: addDays(base, noticeDays),
    maxStart: addDays(today, settings.maxAdvanceDays),
    noticeDays,
    afterCutoff,
  }
}

export type DayState = 'past' | 'too_soon' | 'blocked' | 'too_far' | 'open'

export function dayState(
  isoDate: string,
  window: DriverWindow,
  blockedDates: readonly string[],
): DayState {
  if (isoDate < window.today) return 'past'
  if (isoDate < window.minStart) return 'too_soon'
  if (isoDate > window.maxStart) return 'too_far'
  if (blockedDates.includes(isoDate)) return 'blocked'
  return 'open'
}
