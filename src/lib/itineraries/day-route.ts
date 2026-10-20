/**
 * One itinerary day as an ordered list of stops — pure, no database.
 *
 * Used by the itinerary page, My Trip and the map's day mode
 * (`/map?itinerary=<slug>&day=<n>`). The input places are `PlaceTeaser`s, the
 * single redaction point of `@/lib/content/extra-queries`: a place the viewer
 * cannot see arrives as `{ locked: true, requiredEntitlement }` — no id, name,
 * slug or coordinates. On top of that, this module drops the stop's own NOTE
 * and TIME for a locked place: an editor's tip ("swim at the second pool of
 * Tukad Cepung") can name the very place the map is hiding.
 */

import type {
  LockedPlaceTeaser,
  PlaceTeaser,
  VisiblePlaceTeaser,
} from '@/lib/content/extra-queries'
import type { LocalizedText } from '@/lib/content/localize'

/** A stop as stored: the place, its position and the editor's extras. */
export interface DayStopRow {
  placeId: string
  sortOrder: number
  note: LocalizedText | null
  visitTime: string | null
}

export type DayStop =
  | {
      locked: false
      /** 1-based position among ALL stops of the day, locked ones included. */
      number: number
      place: VisiblePlaceTeaser
      note: LocalizedText | null
      visitTime: string | null
    }
  | {
      locked: true
      number: number
      requiredEntitlement: LockedPlaceTeaser['requiredEntitlement']
    }

/**
 * Stops in visiting order: by `sortOrder`, ties broken by the order they were
 * given (stable), so two rows saved with the same position never swap between
 * page loads.
 */
export function orderStops<T extends { sortOrder: number }>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.sortOrder - b.row.sortOrder || a.index - b.index)
    .map((entry) => entry.row)
}

/**
 * Join the ordered rows with their (already redacted) places. `teasers` is
 * keyed by place id and holds only places that are live; a stop whose place
 * was unpublished or deleted is skipped, not shown as a gap. A locked place
 * keeps its number so the visible pins read "1, 3, 4" — the traveller can see
 * that a stop is missing and why.
 */
export function buildDayStops(
  rows: readonly DayStopRow[],
  teasers: ReadonlyMap<string, PlaceTeaser>,
): DayStop[] {
  const out: DayStop[] = []
  for (const row of orderStops(rows)) {
    const place = teasers.get(row.placeId)
    if (place === undefined) continue
    const number = out.length + 1
    if (place.locked) {
      out.push({ locked: true, number, requiredEntitlement: place.requiredEntitlement })
    } else {
      out.push({ locked: false, number, place, note: row.note, visitTime: row.visitTime })
    }
  }
  return out
}

export interface DayRoute {
  stops: DayStop[]
  /** Visible stops only, in order: what gets a numbered pin. */
  pins: { number: number; lat: number; lon: number; slug: string; name: LocalizedText }[]
  /** The line joining the visible stops, [lon, lat] (GeoJSON order). Empty below two pins. */
  line: [number, number][]
  lockedCount: number
  /** The highest access a locked stop needs, for the upgrade button. */
  lockedNeeds: 'map_access' | 'vip' | null
}

export function buildDayRoute(stops: readonly DayStop[]): DayRoute {
  const pins: DayRoute['pins'] = []
  let lockedCount = 0
  let lockedNeeds: DayRoute['lockedNeeds'] = null
  for (const stop of stops) {
    if (stop.locked) {
      lockedCount += 1
      if (stop.requiredEntitlement === 'vip') lockedNeeds = 'vip'
      else if (lockedNeeds === null) lockedNeeds = 'map_access'
      continue
    }
    pins.push({
      number: stop.number,
      lat: stop.place.lat,
      lon: stop.place.lon,
      slug: stop.place.slug,
      name: stop.place.name,
    })
  }
  return {
    stops: [...stops],
    pins,
    line: pins.length >= 2 ? pins.map((pin) => [pin.lon, pin.lat]) : [],
    lockedCount,
    lockedNeeds,
  }
}

/** Which days a viewer may open in full: buyers and staff all; others day 1. */
export function openDayNumbers(dayNumbers: readonly number[], fullPlan: boolean): Set<number> {
  const sorted = [...dayNumbers].sort((a, b) => a - b)
  return new Set(fullPlan ? sorted : sorted.slice(0, 1))
}
