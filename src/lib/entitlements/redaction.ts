/**
 * Entitlement model and map redaction — pure, no database.
 *
 * Kept free of imports so it can be unit-tested without a connection, and
 * so the redaction rules stay easy to reason about in isolation. Anything
 * that touches Postgres lives in ./index.ts.
 */

/**
 * `basic` (الوثيقة 13.3 "باقة جدول فقط"): باقة لا تفتح الخريطة إطلاقاً، بل تحمل
 * صلاحيات الباقة وحدها (تحميل PDF / رحلتي / المفضلة / الأجهزة).
 */
export const ENTITLEMENT_KINDS = ['basic', 'map_access', 'vip'] as const
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number]

/** الأنواع التي تفتح شيئاً على الخريطة — وحدها يصح أن تكون متطلب مكان. */
export const MAP_ENTITLEMENT_KINDS = ['map_access', 'vip'] as const
export type MapEntitlementKind = (typeof MAP_ENTITLEMENT_KINDS)[number]

/**
 * VIP is a superset of map access. The prototype wired both the $19 and the
 * $39 tier to the same handler, so VIP recorded nothing and gated nothing.
 *
 * `basic` implies nothing on the map: a PDF-only plan must never unlock a place.
 */
const IMPLIES: Record<EntitlementKind, readonly MapEntitlementKind[]> = {
  basic: [],
  map_access: ['map_access'],
  vip: ['vip', 'map_access'],
}

export function grants(held: EntitlementKind, required: EntitlementKind): boolean {
  return (IMPLIES[held] as readonly EntitlementKind[]).includes(required)
}

export interface EntitlementSet {
  /** Map kinds held (after implication). `basic` never appears here. */
  kinds: Set<MapEntitlementKind>
  has(required: EntitlementKind): boolean
}

const EMPTY: EntitlementSet = { kinds: new Set(), has: () => false }

export function emptyEntitlements(): EntitlementSet {
  return EMPTY
}

export function makeEntitlementSet(held: readonly EntitlementKind[]): EntitlementSet {
  const kinds = new Set<MapEntitlementKind>()
  for (const kind of held) {
    for (const implied of IMPLIES[kind]) kinds.add(implied)
  }
  return {
    kinds,
    has: (required) => isMapEntitlementKind(required) && kinds.has(required),
  }
}

export function isEntitlementKind(value: string): value is EntitlementKind {
  return (ENTITLEMENT_KINDS as readonly string[]).includes(value)
}

export function isMapEntitlementKind(value: string): value is MapEntitlementKind {
  return (MAP_ENTITLEMENT_KINDS as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/** The full shape the map API can return for a place. */
export interface FullMapPlace {
  id: string
  slug: string
  name: Record<string, string>
  category: Record<string, string> | null
  description: Record<string, string> | null
  lat: number
  lon: number
  rating: number | null
  openingHours: string | null
  tags: string[] | null
  heroImageUrl: string | null
  activitySlug: string | null
  isFree: boolean
  requiredEntitlement: MapEntitlementKind
  /** Hidden Gem: يتطلب VIP دائماً (انظر `placeAccess`). */
  isHiddenGem: boolean
  regionKey: string | null
  regionLabel: Record<string, string> | null
  /** المنطقة العامة للحي (Kuta ← south)، لفلترة "جنوب بالي" بأحيائها. */
  parentRegionKey: string | null
  parentRegionLabel: Record<string, string> | null
  categoryKey: string | null
  categoryLabel: Record<string, string> | null
  tagKeys: string[]
  /** الوسوم بأسمائها المترجمة — من لوحة التحكم، لا قائمة ثابتة. */
  tagList: { key: string; label: Record<string, string> }[]
  detailedDescription: Record<string, string> | null
  /** روابط فيديو https (YouTube/Vimeo/mp4) — مُرشَّحة على الخادم. */
  videos: string[]
  /** روابط صور المعرض (الوثيقة 6.3). */
  gallery: string[]
  /** مفاتيح التصنيفات الفرعية (الوثيقة 6.3). */
  subCategoryKeys: string[]
  canFavorite: boolean
  canAddToTrip: boolean
  priority: number
}

/**
 * الصلاحية الفعلية لمكان، في مكان واحد.
 *
 * Hidden Gems حصرية لـ VIP بحسب الوثيقة ("VIP: الوصول إلى Hidden Gems")،
 * فعلامة `is_hidden_gem` ترفع المتطلب إلى `vip` وتلغي `is_free` مهما كانت
 * قيمتهما في الصف. خطأ في لوحة التحكم (جوهرة معلّمة "مجانية") لا يفتحها.
 * قيمة متطلب غير معروفة تُعامل كـ `vip` — الإغلاق هو اتجاه الفشل الآمن.
 */
export function placeAccess(row: {
  isFree: boolean
  requiredEntitlement: string
  isHiddenGem?: boolean | null
}): { isFree: boolean; requiredEntitlement: MapEntitlementKind } {
  if (row.isHiddenGem === true) return { isFree: false, requiredEntitlement: 'vip' }
  return {
    isFree: row.isFree,
    // 'basic' (أو أي قيمة ليست من أنواع الخريطة) متطلباً لمكان → vip، لا "مفتوح لـ basic".
    requiredEntitlement: isMapEntitlementKind(row.requiredEntitlement)
      ? row.requiredEntitlement
      : 'vip',
  }
}

/** هل يرى هذا المستخدم تفاصيل المكان؟ */
export function canSeePlace(
  row: { isFree: boolean; requiredEntitlement: string; isHiddenGem?: boolean | null },
  held: EntitlementSet,
): boolean {
  const access = placeAccess(row)
  return access.isFree || held.has(access.requiredEntitlement)
}

/**
 * What an unentitled client receives: enough to render a locked marker and
 * motivate an upgrade, and nothing more. No name, no coordinates, no
 * rating, no image URL, no linked activity.
 *
 * The prototype shipped every one of those fields to every browser and hid
 * them with `•••••` and a CSS blur, so the paywall was one devtools panel
 * away from being irrelevant.
 */
export interface RedactedMapPlace {
  id: string
  locked: true
  requiredEntitlement: MapEntitlementKind
}

export type MapPlaceForClient = (FullMapPlace & { locked: false }) | RedactedMapPlace

export function redactPlace(place: FullMapPlace, held: EntitlementSet): MapPlaceForClient {
  if (place.isFree || held.has(place.requiredEntitlement)) {
    return { ...place, locked: false }
  }
  return {
    id: place.id,
    locked: true,
    requiredEntitlement: place.requiredEntitlement,
  }
}

export interface MapPayload {
  places: MapPlaceForClient[]
  /** Drives the "N locked" banner without revealing which places they are. */
  lockedCount: number
  unlocked: boolean
}

export function buildMapPayload(places: readonly FullMapPlace[], held: EntitlementSet): MapPayload {
  const redacted = places.map((p) => redactPlace(p, held))
  return {
    places: redacted,
    lockedCount: redacted.filter((p) => p.locked).length,
    unlocked: held.has('map_access'),
  }
}
