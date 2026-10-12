/**
 * Entitlement model and map redaction — pure, no database.
 *
 * Kept free of imports so it can be unit-tested without a connection, and
 * so the redaction rules stay easy to reason about in isolation. Anything
 * that touches Postgres lives in ./index.ts.
 */

export const ENTITLEMENT_KINDS = ['map_access', 'vip'] as const
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number]

/**
 * VIP is a superset of map access. The prototype wired both the $19 and the
 * $39 tier to the same handler, so VIP recorded nothing and gated nothing.
 */
const IMPLIES: Record<EntitlementKind, readonly EntitlementKind[]> = {
  map_access: ['map_access'],
  vip: ['vip', 'map_access'],
}

export function grants(held: EntitlementKind, required: EntitlementKind): boolean {
  return IMPLIES[held].includes(required)
}

export interface EntitlementSet {
  kinds: Set<EntitlementKind>
  has(required: EntitlementKind): boolean
}

const EMPTY: EntitlementSet = { kinds: new Set(), has: () => false }

export function emptyEntitlements(): EntitlementSet {
  return EMPTY
}

export function makeEntitlementSet(held: readonly EntitlementKind[]): EntitlementSet {
  const kinds = new Set<EntitlementKind>()
  for (const kind of held) {
    for (const implied of IMPLIES[kind]) kinds.add(implied)
  }
  return { kinds, has: (required) => kinds.has(required) }
}

export function isEntitlementKind(value: string): value is EntitlementKind {
  return (ENTITLEMENT_KINDS as readonly string[]).includes(value)
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
  requiredEntitlement: EntitlementKind
  /** Hidden Gem: يتطلب VIP دائماً (انظر `placeAccess`). */
  isHiddenGem: boolean
  regionKey: string | null
  regionLabel: Record<string, string> | null
  categoryKey: string | null
  categoryLabel: Record<string, string> | null
  tagKeys: string[]
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
}): { isFree: boolean; requiredEntitlement: EntitlementKind } {
  if (row.isHiddenGem === true) return { isFree: false, requiredEntitlement: 'vip' }
  return {
    isFree: row.isFree,
    requiredEntitlement: isEntitlementKind(row.requiredEntitlement)
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
  requiredEntitlement: EntitlementKind
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
