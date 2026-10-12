/**
 * البحث المركّب في أماكن الخريطة: نص + منطقة + تصنيف + وسوم + Hidden Gems + قريب مني.
 *
 * ترتيب النتائج (من الوثيقة، 2.4):
 *   1. الأقرب، إن أُعطي موقع داخل بالي
 *   2. داخل المنطقة المختارة
 *   3. أولوية الإدارة (`priority`)
 *   4. ما يستطيع المستخدم فتحه قبل ما هو مقفل عليه
 *   5. الأكثر حفظاً (مفضلة + رحلتي)
 *
 * النتائج المقفلة تمرّ بنفس قاعدة الإخفاء التي تطبقها الخريطة: يعرف الزائر
 * أن هناك مكاناً مقفلاً يطابق، لكن لا اسمه ولا موقعه ولا صورته.
 */

import { and, asc, eq, gte, isNull, lte, or, sql, type SQL } from 'drizzle-orm'

import { db } from '@/db'
import {
  categories,
  favorites,
  mapPlaces,
  media,
  placeTags,
  regions,
  tags,
  tripItems,
} from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { pick } from '@/lib/content/localize'
import {
  canSeePlace,
  placeAccess,
  type EntitlementKind,
  type EntitlementSet,
} from '@/lib/entitlements'
import { boundingBox, haversineKm, isInBali, type LatLon } from '@/lib/geo'
import { mediaUrl } from '@/lib/content/queries'

export const DEFAULT_NEARBY_KM = 5
export const MAX_NEARBY_KM = 60
const MAX_RESULTS = 60

export interface PlaceSearchInput {
  q?: string | null
  region?: string | null
  category?: string | null
  tags?: readonly string[]
  gemsOnly?: boolean
  near?: LatLon | null
  radiusKm?: number | null
  limit?: number
}

export type PlaceSearchHit =
  | {
      locked: false
      id: string
      slug: string
      name: string
      category: string | null
      region: string | null
      heroImageUrl: string | null
      isHiddenGem: boolean
      isVip: boolean
      distanceKm: number | null
      lat: number
      lon: number
      canFavorite: boolean
      canAddToTrip: boolean
    }
  | { locked: true; id: string; requiredEntitlement: EntitlementKind; distanceKm: null }

export interface PlaceSearchResult {
  hits: PlaceSearchHit[]
  lockedCount: number
  /** هل استُخدم الموقع؟ (خارج بالي أو غير صالح → لا). */
  usedLocation: boolean
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/** مقارنة الترتيب، مفصولة للاختبار. */
export function compareHits(
  a: {
    distanceKm: number | null
    inRegion: boolean
    priority: number
    visible: boolean
    saves: number
    name: string
  },
  b: typeof a,
): number {
  if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
    return a.distanceKm - b.distanceKm
  }
  if (a.inRegion !== b.inRegion) return a.inRegion ? -1 : 1
  if (a.priority !== b.priority) return b.priority - a.priority
  if (a.visible !== b.visible) return a.visible ? -1 : 1
  if (a.saves !== b.saves) return b.saves - a.saves
  return a.name.localeCompare(b.name)
}

export async function searchPlaces(
  input: PlaceSearchInput,
  held: EntitlementSet,
  locale: Locale,
): Promise<PlaceSearchResult> {
  const filters: SQL[] = [
    eq(mapPlaces.status, 'published'),
    isNull(mapPlaces.deletedAt),
    eq(mapPlaces.isHidden, false),
  ]

  const needle = input.q?.trim().slice(0, 80) ?? ''
  if (needle !== '') {
    const like = `%${escapeLike(needle.toLowerCase())}%`
    // كل اللغات: من يكتب "Kuta" في الواجهة العربية يجب أن يجده.
    const text = or(
      sql`lower(${mapPlaces.name}::text) like ${like}`,
      sql`lower(coalesce(${mapPlaces.category}::text, '')) like ${like}`,
      sql`lower(coalesce(${regions.label}::text, '')) like ${like}`,
      sql`lower(coalesce(${categories.label}::text, '')) like ${like}`,
      sql`exists (select 1 from ${placeTags} pt join ${tags} t on t.id = pt.tag_id
                  where pt.place_id = ${mapPlaces.id} and lower(t.label::text) like ${like})`,
    )
    if (text) filters.push(text)
  }
  if (input.region) filters.push(eq(regions.key, input.region))
  if (input.category) filters.push(eq(categories.key, input.category))
  if (input.gemsOnly) filters.push(eq(mapPlaces.isHiddenGem, true))
  for (const tagKey of input.tags ?? []) {
    filters.push(
      sql`exists (select 1 from ${placeTags} pt join ${tags} t on t.id = pt.tag_id
                  where pt.place_id = ${mapPlaces.id} and t.key = ${tagKey})`,
    )
  }

  const near = input.near && isInBali(input.near) ? input.near : null
  const radius = Math.min(Math.max(input.radiusKm ?? DEFAULT_NEARBY_KM, 0.2), MAX_NEARBY_KM)
  if (near !== null) {
    const box = boundingBox(near, radius)
    filters.push(
      gte(mapPlaces.lat, box.minLat),
      lte(mapPlaces.lat, box.maxLat),
      gte(mapPlaces.lon, box.minLon),
      lte(mapPlaces.lon, box.maxLon),
    )
  }

  const rows = await db
    .select({
      place: mapPlaces,
      heroKey: media.objectKey,
      regionKey: regions.key,
      regionLabel: regions.label,
      categoryLabel: categories.label,
      saves: sql<number>`(
        (select count(*) from ${favorites} f where f.kind = 'place' and f.ref_id = ${mapPlaces.id}) +
        (select count(*) from ${tripItems} ti where ti.place_id = ${mapPlaces.id})
      )::int`,
    })
    .from(mapPlaces)
    .leftJoin(media, eq(media.id, mapPlaces.heroImageId))
    .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
    .leftJoin(categories, eq(categories.id, mapPlaces.categoryId))
    .where(and(...filters))
    .orderBy(asc(mapPlaces.sortOrder))
    .limit(500)

  const ranked = rows
    .map((row) => {
      const distanceKm = near === null ? null : haversineKm(near, row.place)
      return {
        row,
        distanceKm,
        visible: canSeePlace(row.place, held),
        sort: {
          distanceKm,
          inRegion: input.region ? row.regionKey === input.region : false,
          priority: row.place.priority,
          visible: canSeePlace(row.place, held),
          saves: row.saves,
          name: pick(row.place.name, locale, row.place.slug),
        },
      }
    })
    // الصندوق مربع؛ الدائرة هي الحد الحقيقي.
    .filter((item) => item.distanceKm === null || item.distanceKm <= radius)
    .sort((a, b) => compareHits(a.sort, b.sort))
    .slice(0, Math.min(input.limit ?? 30, MAX_RESULTS))

  let lockedCount = 0
  const hits: PlaceSearchHit[] = ranked.map(({ row, distanceKm, visible }) => {
    const access = placeAccess(row.place)
    if (!visible) {
      lockedCount += 1
      return {
        locked: true,
        id: row.place.id,
        requiredEntitlement: access.requiredEntitlement,
        distanceKm: null,
      }
    }
    return {
      locked: false,
      id: row.place.id,
      slug: row.place.slug,
      name: pick(row.place.name, locale, row.place.slug),
      category: row.categoryLabel
        ? pick(row.categoryLabel, locale)
        : row.place.category
          ? pick(row.place.category, locale)
          : null,
      region: row.regionLabel ? pick(row.regionLabel, locale) : null,
      heroImageUrl: row.heroKey ? mediaUrl(row.heroKey) : null,
      isHiddenGem: row.place.isHiddenGem,
      isVip: access.requiredEntitlement === 'vip' && !access.isFree,
      distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
      lat: row.place.lat,
      lon: row.place.lon,
      canFavorite: row.place.canFavorite,
      canAddToTrip: row.place.canAddToTrip,
    }
  })

  return { hits, lockedCount, usedLocation: near !== null }
}

/* --------------------------------------------------------------------------
   الاقتراحات أثناء الكتابة
   -------------------------------------------------------------------------- */

export type Suggestion =
  | { type: 'region'; key: string; label: string }
  | { type: 'category'; key: string; label: string }
  | { type: 'tag'; key: string; label: string }
  | { type: 'category_in_region'; category: string; region: string; label: string }
  | { type: 'place'; slug: string; label: string }

/**
 * "كو" ← Kuta، كافيهات في Kuta، مطاعم في Kuta…
 * أسماء الأماكن تُقترح فقط إذا كان المستخدم يستطيع رؤيتها.
 */
export async function suggest(
  q: string,
  held: EntitlementSet,
  locale: Locale,
  phrases: { inRegion: (category: string, region: string) => string },
): Promise<Suggestion[]> {
  const needle = q.trim().toLowerCase().slice(0, 40)
  if (needle.length < 2) return []
  const like = `%${escapeLike(needle)}%`

  const [regionRows, categoryRows, tagRows, placeRows] = await Promise.all([
    db
      .select({ key: regions.key, label: regions.label })
      .from(regions)
      .where(
        or(
          sql`lower(${regions.label}::text) like ${like}`,
          sql`lower(${regions.key}) like ${like}`,
        ),
      )
      .orderBy(asc(regions.sortOrder))
      .limit(3),
    db
      .select({ key: categories.key, label: categories.label })
      .from(categories)
      .where(sql`lower(${categories.label}::text) like ${like}`)
      .orderBy(asc(categories.sortOrder))
      .limit(3),
    db
      .select({ key: tags.key, label: tags.label })
      .from(tags)
      .where(and(eq(tags.status, 'active'), sql`lower(${tags.label}::text) like ${like}`))
      .limit(3),
    db
      .select({
        slug: mapPlaces.slug,
        name: mapPlaces.name,
        isFree: mapPlaces.isFree,
        requiredEntitlement: mapPlaces.requiredEntitlement,
        isHiddenGem: mapPlaces.isHiddenGem,
      })
      .from(mapPlaces)
      .where(
        and(
          eq(mapPlaces.status, 'published'),
          isNull(mapPlaces.deletedAt),
          eq(mapPlaces.isHidden, false),
          sql`lower(${mapPlaces.name}::text) like ${like}`,
        ),
      )
      .limit(10),
  ])

  const out: Suggestion[] = []
  for (const region of regionRows) {
    const regionLabel = pick(region.label, locale)
    out.push({ type: 'region', key: region.key, label: regionLabel })
    // "كافيهات في Kuta" — أكثر التصنيفات استخداماً في هذه المنطقة.
    const popular = await db
      .select({ key: categories.key, label: categories.label })
      .from(mapPlaces)
      .innerJoin(categories, eq(categories.id, mapPlaces.categoryId))
      .innerJoin(regions, eq(regions.id, mapPlaces.regionId))
      .where(
        and(
          eq(regions.key, region.key),
          eq(mapPlaces.status, 'published'),
          isNull(mapPlaces.deletedAt),
        ),
      )
      .groupBy(categories.key, categories.label)
      .orderBy(sql`count(*) desc`)
      .limit(2)
    for (const category of popular) {
      out.push({
        type: 'category_in_region',
        category: category.key,
        region: region.key,
        label: phrases.inRegion(pick(category.label, locale), regionLabel),
      })
    }
  }
  for (const category of categoryRows)
    out.push({ type: 'category', key: category.key, label: pick(category.label, locale) })
  for (const tag of tagRows) out.push({ type: 'tag', key: tag.key, label: pick(tag.label, locale) })
  for (const place of placeRows) {
    if (!canSeePlace(place, held)) continue
    out.push({ type: 'place', slug: place.slug, label: pick(place.name, locale, place.slug) })
    if (out.length >= 10) break
  }
  return out.slice(0, 10)
}
