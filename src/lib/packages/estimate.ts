/**
 * Package price estimate (client, Oct 2026) — pure.
 *
 * A package is a day plan. Each day may hold activities (their real price per
 * traveller) and every day has the driver, priced for the chosen vehicle by
 * the zone the day happens in. Total = activities × travellers + driver days.
 *
 * The estimate is shown on the package page and stored on the request the
 * customer sends. It is not a charge: the team confirms the request and
 * sends a payment link for the amount they quote.
 */

import { zoneFor, zoneUsdMinor, type Vehicle, type ZoneRegion } from './vehicles'

export interface EstimateDay {
  /** Price per traveller of the activities on this day, in `currency` minor units. */
  activities: readonly { priceMinor: number; currency: string }[]
  /** Where the day happens (the activity's area, else the package's first area). */
  region: ZoneRegion | null
}

export interface DayEstimate {
  day: number
  zone: number | null
  driverMinor: number | null
  activitiesMinor: number
}

export interface PackageEstimate {
  currency: string
  activitiesMinor: number
  driverMinor: number
  totalMinor: number
  days: DayEstimate[]
  /** Something could not be priced (no zone price, or an activity in another currency). */
  incomplete: boolean
}

export function estimatePackage(input: {
  days: readonly EstimateDay[]
  travellers: number
  vehicle: Vehicle
  sarPerUsd: number
  currency?: string
}): PackageEstimate {
  const currency = (input.currency ?? 'USD').toUpperCase()
  const travellers = Math.max(1, Math.trunc(input.travellers))
  let incomplete = currency !== 'USD'
  let activitiesMinor = 0
  let driverMinor = 0

  const days = input.days.map((day, index): DayEstimate => {
    let dayActivities = 0
    for (const activity of day.activities) {
      if (activity.currency.toUpperCase() !== currency) {
        incomplete = true
        continue
      }
      dayActivities += activity.priceMinor * travellers
    }
    const zone = zoneFor(input.vehicle, day.region)
    const driver = zone === null ? null : zoneUsdMinor(zone, input.sarPerUsd)
    if (driver === null) incomplete = true
    activitiesMinor += dayActivities
    driverMinor += driver ?? 0
    return {
      day: index + 1,
      zone: zone?.zone ?? null,
      driverMinor: driver,
      activitiesMinor: dayActivities,
    }
  })

  return {
    currency,
    activitiesMinor,
    driverMinor,
    totalMinor: activitiesMinor + driverMinor,
    days,
    incomplete,
  }
}

/**
 * The day plan of a package: activities fixed to a day go there, the rest
 * fill the free days in order (as the package page lays them out); the
 * region of a day is its first activity's, else the package's first area.
 */
export function packageDayPlan<
  A extends { id: string; priceMinor: number; currency: string; region: ZoneRegion | null },
>(input: {
  days: number
  activities: readonly A[]
  activityDays: Readonly<Record<string, number>>
  fallbackRegion: ZoneRegion | null
}): EstimateDay[] {
  const count = Math.max(1, input.days)
  const perDay: A[][] = Array.from({ length: count }, () => [])
  const loose: A[] = []
  for (const activity of input.activities) {
    const offset = input.activityDays[activity.id]
    if (offset !== undefined && offset >= 0 && offset < count) perDay[offset]?.push(activity)
    else loose.push(activity)
  }
  const anyFixed = input.activities.some((a) => {
    const o = input.activityDays[a.id]
    return o !== undefined && o >= 0 && o < count
  })
  for (const activity of loose) {
    const free = anyFixed ? -1 : perDay.findIndex((list) => list.length === 0)
    // Not fixed and no free day: still part of the package — priced on day 1.
    perDay[free === -1 ? 0 : free]?.push(activity)
  }
  return perDay.map((list) => ({
    activities: list.map((a) => ({ priceMinor: a.priceMinor, currency: a.currency })),
    region: list.find((a) => a.region !== null)?.region ?? input.fallbackRegion,
  }))
}
