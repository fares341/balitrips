/**
 * Distances on the map (owner, Nov 2026): great-circle (haversine) metres and
 * a locale-aware label. Only real origins are used — the viewer's position
 * after they opt in, or the chosen area's centre. Never a made-up one.
 */

export interface LatLon {
  lat: number
  lon: number
}

const EARTH_M = 6_371_008.8

export function haversineMeters(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * «850 m», «3.2 km», «24 km» in the page's language and digits. Under 1 km:
 * metres rounded to 10 (at least 10); under 10 km: one decimal; else whole km.
 */
export function formatDistance(meters: number, locale: string): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  if (meters < 1000) {
    const m = Math.max(10, Math.round(meters / 10) * 10)
    if (m < 1000) {
      return new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'meter',
        unitDisplay: 'short',
      }).format(m)
    }
  }
  const km = meters / 1000
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay: 'short',
    maximumFractionDigits: km < 10 ? 1 : 0,
    minimumFractionDigits: 0,
  }).format(km < 10 ? Math.round(km * 10) / 10 : Math.round(km))
}

/** Centre of a set of points (an area's centre from its sub-areas). */
export function centroid(points: readonly LatLon[]): LatLon | null {
  if (points.length === 0) return null
  let lat = 0
  let lon = 0
  for (const p of points) {
    lat += p.lat
    lon += p.lon
  }
  return { lat: lat / points.length, lon: lon / points.length }
}
