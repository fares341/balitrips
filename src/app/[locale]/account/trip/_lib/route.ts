/**
 * "اقتراح مسار يومي" (الوثيقة 12.3): المسافة بين الأماكن المتتالية في اليوم،
 * ومجموع اليوم، ورابط المسار في Google Maps.
 *
 * دوال نقية بلا قاعدة بيانات. تعمل على `PlaceTeaser` المحجوب مسبقاً، فلا
 * تملك أصلاً إحداثيات مكان مقفل: المكان المقفل يُتخطّى، والمسافة تُحسب من
 * آخر مكان مرئي قبله في اليوم نفسه. مسافة خط مستقيم (haversine)، لا طريق.
 */

import { haversineKm } from '@/lib/geo'
import type { PlaceTeaser, VisiblePlaceTeaser } from '@/lib/content/extra-queries'

/** The print-optimised "Export PDF" page. */
export const TRIP_PRINT_HREF = '/account/trip/print'

/** Google Maps directions take origin + destination + up to 8 waypoints. */
export const MAX_ROUTE_POINTS = 10

export interface DayGroup<T extends { dayNumber: number | null; place: PlaceTeaser }> {
  dayNumber: number | null
  items: (T & { legKm: number | null })[]
  /** Sum of the legs between visible places; 0 when fewer than two. */
  totalKm: number
  visible: VisiblePlaceTeaser[]
}

/**
 * Group display-ordered items by day (rows arrive sorted by day, nulls last)
 * and attach to each visible item the straight-line km from the previous
 * visible item in the same day.
 */
export function groupDays<T extends { dayNumber: number | null; place: PlaceTeaser }>(
  items: readonly T[],
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  for (const item of items) {
    let group = groups[groups.length - 1]
    if (group === undefined || group.dayNumber !== item.dayNumber) {
      group = { dayNumber: item.dayNumber, items: [], totalKm: 0, visible: [] }
      groups.push(group)
    }
    const previous = group.visible[group.visible.length - 1]
    let legKm: number | null = null
    if (!item.place.locked) {
      if (previous !== undefined) {
        legKm = haversineKm(previous, item.place)
        group.totalKm += legKm
      }
      group.visible.push(item.place)
    }
    group.items.push({ ...item, legKm })
  }
  return groups
}

function coord(place: VisiblePlaceTeaser): string {
  return `${place.lat.toFixed(6)},${place.lon.toFixed(6)}`
}

/**
 * "Open day route in Google Maps" — the documented `dir/?api=1` URL. Uses the
 * first `MAX_ROUTE_POINTS` visible places. One place: destination only (Maps
 * starts from the traveller's location). None: null.
 */
export function googleMapsDayUrl(places: readonly VisiblePlaceTeaser[]): string | null {
  const points = places.slice(0, MAX_ROUTE_POINTS)
  const first = points[0]
  const last = points[points.length - 1]
  if (first === undefined || last === undefined) return null

  const query = new URLSearchParams({ api: '1', travelmode: 'driving' })
  if (points.length === 1) {
    query.set('destination', coord(first))
  } else {
    query.set('origin', coord(first))
    query.set('destination', coord(last))
    const waypoints = points.slice(1, -1).map(coord)
    if (waypoints.length > 0) query.set('waypoints', waypoints.join('|'))
  }
  return `https://www.google.com/maps/dir/?${query.toString()}`
}
