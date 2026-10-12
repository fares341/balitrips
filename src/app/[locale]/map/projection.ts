/**
 * The map's ONE coordinate system.
 *
 * The handoff carried two. Pins were placed by projecting `lat`/`lon` through
 * `MAP_BBOX` (`mprojX`/`mprojY`), but the floating info cards were placed with
 * hand-authored `ax`/`ay` percentages typed into the data file per place. So a
 * card and the pin it described were positioned by two unrelated numbers that
 * nothing kept in sync, and adding a place meant eyeballing pixels. The
 * `map_places` schema deliberately dropped `ax`/`ay`; everything on the stage —
 * pin, halo, card, the deep-link centring maths — is projected here and here
 * only.
 *
 * Pure and dependency-light so the projection can be reasoned about (and
 * unit-tested) without React or a database.
 */

import type { FullMapPlace, RedactedMapPlace } from '@/lib/entitlements'
import { placeHaystack, type LocalizedLike } from '@/lib/search/query'

/**
 * Geographic extent of the satellite raster, from the handoff (`MAP_BBOX`).
 *
 * 2.05° of longitude by 1.40° of latitude — a ratio of 1.4643, which is what
 * `.bt-mapframe`'s `aspect-ratio: 2048 / 1399` (1.4639) is cut to. The two must
 * stay in agreement: the projection below is a plain equirectangular stretch
 * onto the frame, so a mismatch would slide every pin off its landmark.
 */
export const MAP_BBOX = { w: 114.05, e: 116.1, n: -7.75, s: -9.15 } as const

/**
 * Satellite backdrop.
 *
 * REPLACE BEFORE LAUNCH: this is a single 2.6 MB baseline JPEG, decoded in full
 * on every visit including 3G phones in the departure lounge, and it is the
 * largest asset on the site by an order of magnitude. It needs to become a
 * tiled WebP pyramid (256px or 512px tiles, one directory per zoom level)
 * loaded per viewport, so a visitor downloads the handful of tiles they are
 * actually looking at instead of the whole island at full resolution. The
 * viewport culling in `map-explorer.tsx` is already bounds-aware and gives the
 * tile loader its query for free.
 */
/**
 * The base raster.
 *
 * Was `bali-satellite.jpg` — which was not a JPEG. It was a 2048x1399 RGBA
 * PNG with a .jpg extension: 2.59 MB of lossless encoding for an opaque
 * photograph, and the heaviest single asset on the site. The alpha channel
 * was fully opaque throughout, so it bought nothing either. Re-encoded it is
 * 178 kB as WebP and 125 kB as AVIF, a 94-96% saving with no visible change.
 *
 * Both are listed because <Photo> renders a <picture>: browsers that take
 * AVIF get the 125 kB version, the rest fall back to WebP.
 */
export const MAP_IMAGE_SRC = '/map/bali-satellite.webp'
export const MAP_IMAGE_AVIF = '/map/bali-satellite.avif'

/** Fraction across the box, west edge 0 → east edge 1. */
export function projectLon(lon: number): number {
  return (lon - MAP_BBOX.w) / (MAP_BBOX.e - MAP_BBOX.w)
}

/** Fraction down the box, north edge 0 → south edge 1. */
export function projectLat(lat: number): number {
  return (MAP_BBOX.n - lat) / (MAP_BBOX.n - MAP_BBOX.s)
}

/**
 * A place the visitor is entitled to see.
 *
 * `redactPlace()` returns this variant only when the place is free or the
 * request carried the entitlement, so every field below is one the server
 * decided this client may have. The locked variant is a bare
 * `{ id, locked, requiredEntitlement }` and cannot be widened into this by
 * anything the client does.
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
  /** Projected 0–1 fraction across the frame. */
  nx: number
  /** Projected 0–1 fraction down the frame. */
  ny: number
  /** Category colour for the dot and its halo. */
  color: string
  /** نص البحث المطبّع بالثلاث لغات (`pinHaystack`). */
  haystack: string
}

/**
 * Category colours, ported from the handoff's `mColor`.
 *
 * Order matters and is the handoff's: a place tagged both "Beaches" and
 * "Temples" takes the beach colour. Kept as an ordered list rather than an
 * object so that precedence is visible instead of depending on key order.
 */
const CATEGORY_COLORS: readonly (readonly [string, string])[] = [
  ['Beaches', '#36c6e0'],
  ['Temples', '#FF9000'],
  ['Hiking', '#71FF85'],
]

/** Everything with no colour-bearing tag. */
export const DEFAULT_PIN_COLOR = '#FFD27A'

export function pinColor(tags: readonly string[] | null): string {
  if (tags !== null) {
    for (const entry of CATEGORY_COLORS) {
      if (tags.includes(entry[0])) return entry[1]
    }
  }
  return DEFAULT_PIN_COLOR
}

/**
 * نص البحث داخل الخريطة لكل دبوس: الاسم، الوصف، التصنيف والتصنيفات الفرعية،
 * المنطقة والحي، والوسوم — بالثلاث لغات، مطبّعاً (أ/ا، ة/ه، café/cafe).
 * نفس `placeHaystack` الذي يستخدمه `/api/places/search`، فتتفق النتيجتان.
 *
 * `categoryLabels`: أسماء التصنيفات الفرعية (المكان يحمل مفاتيحها فقط).
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
 * مكان المنطقة على الخريطة المسطحة: مركزها ونصف قطرها ككسور من الإطار،
 * بنفس الإسقاط الذي تستخدمه الدبابيس. null لمنطقة بلا إحداثيات.
 */
export function projectArea(region: {
  centerLat: number | null
  centerLon: number | null
  radiusKm: number | null
}): { nx: number; ny: number; rx: number; ry: number } | null {
  const { centerLat, centerLon, radiusKm } = region
  if (centerLat === null || centerLon === null) return null
  const km = radiusKm ?? 2
  // درجة عرض ≈ 111.32 كم؛ درجة الطول تنكمش بجيب تمام العرض.
  const dLat = km / 111.32
  const dLon = km / (111.32 * Math.cos((centerLat * Math.PI) / 180))
  return {
    nx: projectLon(centerLon),
    ny: projectLat(centerLat),
    rx: dLon / (MAP_BBOX.e - MAP_BBOX.w),
    ry: dLat / (MAP_BBOX.n - MAP_BBOX.s),
  }
}

/**
 * الدبابيس من الحمولة المنقّحة. `locked: false` هو حارس النوع وجدار الدفع معاً:
 * المكان المقفل `{ id, locked, requiredEntitlement }` بلا إحداثيات، فلا يُسقط ولا
 * يدخل نص البحث ولو خطأً. مصدر واحد للخريطتين المسطحة والثلاثية.
 */
export function buildPins(
  places: readonly MapClientPlace[],
  categories: readonly { key: string; label: LocalizedLike }[],
): MapPin[] {
  const categoryLabels = new Map(categories.map((entry) => [entry.key, entry.label]))
  return places
    .filter((place): place is OpenMapPlace => !place.locked)
    .map((place) => ({
      place,
      nx: projectLon(place.lon),
      ny: projectLat(place.lat),
      color: pinColor(place.tags ?? null),
      haystack: pinHaystack(place, categoryLabels),
    }))
}

/** Clamp helper shared by the zoom and the translation clamp. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
