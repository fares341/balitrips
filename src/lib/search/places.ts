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
 * الأماكن المقفلة: النص والموقع لا يُطبَّقان عليها أبداً، ولا تُعاد بمعرّف.
 * لو طُبّقا لأمكن إعادة بناء الاسم حرفاً حرفاً، والإحداثيات بتضييق الدائرة
 * (ثغرة سابقة). يُعاد فقط عددها ضمن الفلاتر العامة (منطقة/تصنيف/وسم/Gems)،
 * وهي نفس المعلومة الظاهرة على الخريطة كـ "N أماكن مقفلة".
 */

import { and, asc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

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
import { toMedia } from '@/lib/content/queries'

import { normalizeSearch } from './normalize'

/** المنطقة العامة للحي: فلترة "جنوب بالي" تشمل Kuta وSeminyak… */
const parentRegion = alias(regions, 'parent_region')

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

export type PlaceSearchHit = {
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

export interface PlaceSearchResult {
  hits: PlaceSearchHit[]
  /** أماكن مقفلة تطابق الفلاتر العامة فقط (بلا نص ولا موقع) — عدد بلا معرّفات. */
  lockedCount: number
  /** أعلى صلاحية مطلوبة بين المقفلة: لزر "افتح" المناسب. */
  lockedRequires: EntitlementKind | null
  /** هل استُخدم الموقع؟ (خارج بالي أو غير صالح → لا). */
  usedLocation: boolean
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

export { normalizeSearch }

function normSql(expr: SQL): SQL {
  return sql`translate(regexp_replace(lower(${expr}), '[\u064B-\u065F\u0670]', '', 'g'), 'أإآٱةىـ', 'ااااهي')`
}

/**
 * يطابق قيم نص مترجم (jsonb {en, ar, id}) فقط — لا مفاتيحه.
 * المطابقة على `::text` كانت تجعل "ar" أو "en" يطابق كل صف.
 */
function localizedLike(column: unknown, like: string): SQL {
  return sql`exists (
    select 1 from jsonb_each_text(
      case when jsonb_typeof(${column}) = 'object' then ${column} else '{}'::jsonb end
    ) as lv(k, v)
    where ${normSql(sql`lv.v`)} like ${like}
  )`
}

/** "Cafes in Kuta" / "كافيهات في كوتا" / "kafe di Kuta" ← [ما, أين]. */
export function splitPlacePhrase(needle: string): { what: string; where: string } | null {
  const match = /^(.+?)\s+(?:in|at|near|في|فى|بـ?|di|dekat)\s+(.+)$/iu.exec(needle.trim())
  if (match === null) return null
  const what = match[1]?.trim() ?? ''
  const where = match[2]?.trim() ?? ''
  return what.length >= 2 && where.length >= 2 ? { what, where } : null
}

/** "cafes" ← "cafe"، "restaurants" ← "restaurant": جذر تقريبي للجمع الإنجليزي. */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -1)
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1)
  return word
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
  /** فلاتر عامة: تُطبَّق على الكل، ويُحتسب بها عدد المقفلة. */
  const publicFilters: SQL[] = [
    eq(mapPlaces.status, 'published'),
    isNull(mapPlaces.deletedAt),
    eq(mapPlaces.isHidden, false),
  ]

  let needle = normalizeSearch(input.q?.slice(0, 80) ?? '')
  let regionKey = input.region ?? null

  // "كافيهات في Kuta": المنطقة من الجملة نفسها إن لم تُختر صراحة.
  const phrase = needle === '' ? null : splitPlacePhrase(needle)
  if (phrase !== null && regionKey === null) {
    const whereLike = `%${escapeLike(phrase.where)}%`
    const [hit] = await db
      .select({ key: regions.key })
      .from(regions)
      .where(
        and(
          eq(regions.status, 'active'),
          or(localizedLike(regions.label, whereLike), sql`lower(${regions.key}) like ${whereLike}`),
        ),
      )
      .orderBy(asc(regions.sortOrder))
      .limit(1)
    if (hit) {
      regionKey = hit.key
      needle = phrase.what
    }
  }

  if (regionKey) {
    const inRegion = or(eq(regions.key, regionKey), eq(parentRegion.key, regionKey))
    if (inRegion) publicFilters.push(inRegion)
  }
  if (input.category) {
    // التصنيف الرئيسي، أو أحد التصنيفات الفرعية (الوثيقة 6.3).
    const inCategory = or(
      eq(categories.key, input.category),
      sql`exists (select 1 from ${categories} sc where sc.key = ${input.category}
                  and coalesce(${mapPlaces.subCategoryIds}, '[]'::jsonb) @> jsonb_build_array(sc.id::text))`,
    )
    if (inCategory) publicFilters.push(inCategory)
  }
  if (input.gemsOnly) publicFilters.push(eq(mapPlaces.isHiddenGem, true))
  for (const tagKey of input.tags ?? []) {
    publicFilters.push(
      sql`exists (select 1 from ${placeTags} pt join ${tags} t on t.id = pt.tag_id
                  where pt.place_id = ${mapPlaces.id} and t.key = ${tagKey} and t.status = 'active')`,
    )
  }

  /** فلاتر خاصة: نص وموقع — على المرئي فقط. */
  const privateFilters: SQL[] = []
  if (needle !== '') {
    const likes = [...new Set([needle, singular(needle)])].map((n) => `%${escapeLike(n)}%`)
    const text = or(
      ...likes.flatMap((like) => [
        localizedLike(mapPlaces.name, like),
        sql`lower(${mapPlaces.slug}) like ${like}`,
        localizedLike(mapPlaces.category, like),
        localizedLike(regions.label, like),
        localizedLike(parentRegion.label, like),
        sql`lower(coalesce(${regions.key}, '')) like ${like}`,
        localizedLike(categories.label, like),
        sql`exists (select 1 from ${placeTags} pt join ${tags} t on t.id = pt.tag_id
                    where pt.place_id = ${mapPlaces.id} and t.status = 'active'
                      and exists (select 1 from jsonb_each_text(t.label) tl(k, v)
                                  where ${normSql(sql`tl.v`)} like ${like}))`,
      ]),
    )
    if (text) privateFilters.push(text)
  }

  const near = input.near && isInBali(input.near) ? input.near : null
  const radius = Math.min(Math.max(input.radiusKm ?? DEFAULT_NEARBY_KM, 0.2), MAX_NEARBY_KM)
  if (near !== null) {
    const box = boundingBox(near, radius)
    privateFilters.push(
      gte(mapPlaces.lat, box.minLat),
      lte(mapPlaces.lat, box.maxLat),
      gte(mapPlaces.lon, box.minLon),
      lte(mapPlaces.lon, box.maxLon),
    )
  }

  const rows = await db
    .select({
      place: mapPlaces,
      hero: media,
      regionKey: regions.key,
      parentKey: parentRegion.key,
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
    .leftJoin(parentRegion, eq(parentRegion.id, regions.parentId))
    .leftJoin(categories, eq(categories.id, mapPlaces.categoryId))
    .where(and(...publicFilters))
    .orderBy(asc(mapPlaces.sortOrder))
    .limit(1000)

  // المقفل يُعدّ على الفلاتر العامة وحدها، ثم يُستبعد من النتائج.
  const lockedRows = rows.filter((row) => !canSeePlace(row.place, held))
  const lockedCount = lockedRows.length
  const lockedRequires: EntitlementKind | null =
    lockedRows.length === 0
      ? null
      : lockedRows.some((row) => placeAccess(row.place).requiredEntitlement === 'vip')
        ? 'vip'
        : 'map_access'

  // الفلاتر الخاصة تُعاد في SQL على المرئي فقط — لا يُقيَّم نص أو موقع على مقفل.
  let visibleRows = rows.filter((row) => canSeePlace(row.place, held))
  if (privateFilters.length > 0 && visibleRows.length > 0) {
    const ids = visibleRows.map((row) => row.place.id)
    const matched = await db
      .select({ id: mapPlaces.id })
      .from(mapPlaces)
      .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
      .leftJoin(parentRegion, eq(parentRegion.id, regions.parentId))
      .leftJoin(categories, eq(categories.id, mapPlaces.categoryId))
      .where(and(inArray(mapPlaces.id, ids), ...privateFilters))
    const keep = new Set(matched.map((row) => row.id))
    visibleRows = visibleRows.filter((row) => keep.has(row.place.id))
  }

  const hits: PlaceSearchHit[] = visibleRows
    .map((row) => {
      const distanceKm = near === null ? null : haversineKm(near, row.place)
      return {
        row,
        distanceKm,
        sort: {
          distanceKm,
          inRegion: regionKey ? row.regionKey === regionKey || row.parentKey === regionKey : false,
          priority: row.place.priority,
          visible: true,
          saves: row.saves,
          name: pick(row.place.name, locale, row.place.slug),
        },
      }
    })
    // الصندوق مربع؛ الدائرة هي الحد الحقيقي.
    .filter((item) => item.distanceKm === null || item.distanceKm <= radius)
    .sort((a, b) => compareHits(a.sort, b.sort))
    .slice(0, Math.min(input.limit ?? 30, MAX_RESULTS))
    .map(({ row, distanceKm }) => {
      const access = placeAccess(row.place)
      return {
        locked: false as const,
        id: row.place.id,
        slug: row.place.slug,
        name: pick(row.place.name, locale, row.place.slug),
        category: row.categoryLabel
          ? pick(row.categoryLabel, locale)
          : row.place.category
            ? pick(row.place.category, locale)
            : null,
        region: row.regionLabel ? pick(row.regionLabel, locale) : null,
        // نسخة مصغّرة (لا الأصل 1-1.6MB)، والصورة المحذوفة لا تُعرض.
        heroImageUrl: toMedia(row.hero)?.url ?? null,
        isHiddenGem: row.place.isHiddenGem,
        isVip: access.requiredEntitlement === 'vip' && !access.isFree,
        distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
        lat: row.place.lat,
        lon: row.place.lon,
        canFavorite: row.place.canFavorite,
        canAddToTrip: row.place.canAddToTrip,
      }
    })

  return { hits, lockedCount, lockedRequires, usedLocation: near !== null }
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
  const needle = normalizeSearch(q.slice(0, 40))
  if (needle.length < 2) return []
  const like = `%${escapeLike(needle)}%`

  const [regionRows, categoryRows, tagRows, placeRows] = await Promise.all([
    db
      .select({ key: regions.key, label: regions.label })
      .from(regions)
      .where(
        and(
          eq(regions.status, 'active'),
          or(localizedLike(regions.label, like), sql`lower(${regions.key}) like ${like}`),
        ),
      )
      .orderBy(asc(regions.sortOrder))
      .limit(3),
    db
      .select({ key: categories.key, label: categories.label })
      .from(categories)
      .where(and(eq(categories.status, 'active'), localizedLike(categories.label, like)))
      .orderBy(asc(categories.sortOrder))
      .limit(3),
    db
      .select({ key: tags.key, label: tags.label })
      .from(tags)
      .where(and(eq(tags.status, 'active'), localizedLike(tags.label, like)))
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
          or(localizedLike(mapPlaces.name, like), sql`lower(${mapPlaces.slug}) like ${like}`),
        ),
      )
      // المقفل يُستبعد بعد الاستعلام؛ هامش كي لا تدفع الأماكن المقفلة المرئية خارج القائمة.
      .limit(60),
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
      .leftJoin(parentRegion, eq(parentRegion.id, regions.parentId))
      .where(
        and(
          // "مطاعم في جنوب بالي" تشمل أحياءها (Kuta، Seminyak…).
          or(eq(regions.key, region.key), eq(parentRegion.key, region.key)),
          eq(mapPlaces.status, 'published'),
          isNull(mapPlaces.deletedAt),
          eq(mapPlaces.isHidden, false),
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
