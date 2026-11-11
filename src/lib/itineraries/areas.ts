/**
 * «المناطق التي يغطيها الجدول» (client أستاذ سعيد, Nov 2026).
 *
 * The one exception to "no place names before purchase": the public page may
 * name the AREAS the trip stays in or visits (e.g. «سمينياك · أوبود ·
 * أولواتو»). Never a restaurant, a landmark or an activity — only keys of
 * the region taxonomy (`regions.key`, the same keys as `AREA_LABELS`).
 *
 * Stored as one jsonb document on `itineraries.areas` (migration 0056):
 *   { showNights: boolean, items: [{ key, nights }] }   — ordered
 * Nights are kept in the data but shown only when Studio's «إظهار عدد
 * الليالي» is on (off by default). Pure: no database.
 */

import { AREA_LABELS } from '@/lib/map/area-labels'

export interface ItineraryAreaItem {
  /** `regions.key` / `AREA_LABELS` key. */
  key: string
  /** Nights in that area, or null (a visit / not stated). */
  nights: number | null
}

export interface ItineraryAreas {
  showNights: boolean
  items: ItineraryAreaItem[]
}

export const MAX_AREAS = 8
export const MAX_AREA_NIGHTS = 60
const KEY = /^[a-z0-9][a-z0-9-]{0,63}$/

export const EMPTY_AREAS: ItineraryAreas = { showNights: false, items: [] }

/** Clean any stored / submitted value: valid keys, no duplicates, nights 1–60 or null. */
export function normaliseAreas(raw: unknown): ItineraryAreas {
  if (raw === null || typeof raw !== 'object') return { showNights: false, items: [] }
  const doc = raw as Record<string, unknown>
  const list = Array.isArray(doc.items) ? doc.items : Array.isArray(raw) ? (raw as unknown[]) : []
  const items: ItineraryAreaItem[] = []
  const seen = new Set<string>()
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    const key = typeof row.key === 'string' ? row.key.trim().toLowerCase() : ''
    if (!KEY.test(key) || seen.has(key)) continue
    seen.add(key)
    const n = typeof row.nights === 'string' ? Number(row.nights) : row.nights
    const nights =
      typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_AREA_NIGHTS ? n : null
    items.push({ key, nights })
    if (items.length === MAX_AREAS) break
  }
  return { showNights: doc.showNights === true, items }
}

export type AreaNames = ReadonlyMap<string, Partial<Record<string, string>>>

/** An area's name: the region's label in the database, else the map label, else the key. */
export function areaName(key: string, locale: string, names: AreaNames = new Map()): string {
  const fromDb = names.get(key)
  const db = fromDb?.[locale]?.trim() || fromDb?.en?.trim()
  if (db) return db
  const label = AREA_LABELS.find((one) => one.key === key)?.name
  return (label?.[locale as 'en' | 'ar' | 'id'] ?? label?.en ?? key).trim()
}

/** Nights in words, per locale («3 ليالٍ», "3 nights", "3 malam"). */
export function nightsLabel(n: number, locale: string): string {
  if (locale === 'ar') {
    if (n === 1) return 'ليلة واحدة'
    if (n === 2) return 'ليلتان'
    if (n <= 10) return `${n} ليالٍ`
    return `${n} ليلة`
  }
  if (locale === 'id') return `${n} malam`
  return n === 1 ? '1 night' : `${n} nights`
}

/** One area as the public page writes it; nights only when the itinerary shows them. */
export function areaText(
  item: ItineraryAreaItem,
  showNights: boolean,
  locale: string,
  names?: AreaNames,
): string {
  const name = areaName(item.key, locale, names)
  return showNights && item.nights !== null ? `${name} ${nightsLabel(item.nights, locale)}` : name
}

/** «سمينياك · أوبود · أولواتو» — '' when the itinerary has no areas. */
export function areasLine(areas: ItineraryAreas, locale: string, names?: AreaNames): string {
  return areas.items.map((item) => areaText(item, areas.showNights, locale, names)).join(' · ')
}
