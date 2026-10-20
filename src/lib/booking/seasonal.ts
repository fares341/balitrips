/**
 * Seasonal package prices (phase 2, `tier_seasonal_prices`).
 *
 * A season replaces the package price (and, when set, its child price) for
 * travel dates inside `[fromDate, toDate]`, optionally only on some weekdays.
 * When several seasons cover the same date the most specific one wins: the
 * shortest date range, then one limited to weekdays, then the later start.
 * So "weekends in July" beats "July", which beats "high season Jun–Sep".
 *
 * Pure: the travel date is the trip's own plain date (Bali), never "now".
 */

export interface SeasonalPrice {
  fromDate: string
  toDate: string
  priceMinor: number
  /** Null = the package's own child price (ignored when the package has none). */
  childPriceMinor: number | null
  /** 0 = Sunday … 6 = Saturday. Empty = every day of the range. */
  weekdays: readonly number[]
  label: string | null
}

function weekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay()
}

function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function seasonCovers(season: SeasonalPrice, day: string): boolean {
  if (day < season.fromDate || day > season.toDate) return false
  return season.weekdays.length === 0 || season.weekdays.includes(weekday(day))
}

/** The season in force on `day`, or null. */
export function seasonFor(
  seasons: readonly SeasonalPrice[] | undefined,
  day: string | null | undefined,
): SeasonalPrice | null {
  if (!seasons || seasons.length === 0 || !day) return null
  let best: SeasonalPrice | null = null
  for (const season of seasons) {
    if (!seasonCovers(season, day)) continue
    if (best === null || moreSpecific(season, best)) best = season
  }
  return best
}

function moreSpecific(a: SeasonalPrice, b: SeasonalPrice): boolean {
  const spanA = spanDays(a.fromDate, a.toDate)
  const spanB = spanDays(b.fromDate, b.toDate)
  if (spanA !== spanB) return spanA < spanB
  const daysA = a.weekdays.length === 0 ? 7 : a.weekdays.length
  const daysB = b.weekdays.length === 0 ? 7 : b.weekdays.length
  if (daysA !== daysB) return daysA < daysB
  return a.fromDate > b.fromDate
}

/** Package price and child price on `day`. */
export function priceOn(
  base: { priceMinor: number; childPriceMinor: number | null },
  seasons: readonly SeasonalPrice[] | undefined,
  day: string | null | undefined,
): { priceMinor: number; childPriceMinor: number | null; season: SeasonalPrice | null } {
  const season = seasonFor(seasons, day)
  if (season === null) return { ...base, season: null }
  return {
    priceMinor: season.priceMinor,
    // A season can change the child price, not switch child pricing on: a
    // package without a child price charges children as adults all year.
    childPriceMinor:
      base.childPriceMinor === null ? null : (season.childPriceMinor ?? base.childPriceMinor),
    season,
  }
}
