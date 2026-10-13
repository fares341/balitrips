/**
 * Client-side place types and the search haystack for map pins.
 *
 * Positions are no longer projected here: MapLibre places everything from
 * lat/lon against the georeferenced raster (see ./geo.ts).
 */

import type { FullMapPlace, RedactedMapPlace } from '@/lib/entitlements'
import { placeHaystack, type LocalizedLike } from '@/lib/search/query'

/**
 * A place the visitor is entitled to see. `redactPlace()` returns this variant
 * only when the place is free or the request carried the entitlement; the
 * locked variant is a bare `{ id, locked, requiredEntitlement }`.
 */
export type OpenMapPlace = FullMapPlace & {
  locked: false
  /** الترتيب اليدوي من لوحة التحكم — للترتيب (الوثيقة 8.6). */
  sortOrder: number
  /** مفضلة + رحلتي + مشاهدات. يُرسل للأماكن المفتوحة فقط. */
  popularity: number
}

/** ما تستقبله الخريطة: مكان مفتوح كامل، أو `{ id, locked, requiredEntitlement }`. */
export type MapClientPlace = OpenMapPlace | RedactedMapPlace

export interface MapPin {
  place: OpenMapPlace
  /** نص البحث المطبّع بالثلاث لغات. */
  haystack: string
}

/**
 * نص البحث داخل الخريطة لكل دبوس — نفس `placeHaystack` الذي يستخدمه
 * `/api/places/search`، فتتفق النتيجتان.
 */
export function pinHaystack(
  place: OpenMapPlace,
  categoryLabels: ReadonlyMap<string, LocalizedLike>,
): string {
  return placeHaystack({
    slug: place.slug,
    name: place.name,
    category: place.category,
    description: place.description,
    categoryKey: place.categoryKey,
    categoryLabel: place.categoryLabel,
    subCategories: place.subCategoryKeys.map((key) => ({ key, label: categoryLabels.get(key) })),
    tags: place.tagList,
    regionKey: place.regionKey,
    regionLabel: place.regionLabel,
    parentRegionKey: place.parentRegionKey,
    parentRegionLabel: place.parentRegionLabel,
  })
}

/**
 * الدبابيس من الحمولة المنقّحة. `locked: false` حارس النوع وجدار الدفع معاً:
 * المكان المقفل بلا إحداثيات، فلا يُرسم ولا يدخل نص البحث ولو خطأً.
 */
export function buildPins(
  places: readonly MapClientPlace[],
  categories: readonly { key: string; label: LocalizedLike }[],
): MapPin[] {
  const categoryLabels = new Map(categories.map((entry) => [entry.key, entry.label]))
  return places
    .filter((place): place is OpenMapPlace => !place.locked)
    .map((place) => ({ place, haystack: pinHaystack(place, categoryLabels) }))
}
