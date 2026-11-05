/**
 * البحث المركّب في أماكن الخريطة: نص + منطقة + تصنيف + وسوم + Hidden Gems + قريب مني.
 *
 * فهم الجملة ("كافيهات في كوتا"، "Cafes near me"…) في ./query.ts — نفس الدالة
 * التي تستخدمها الخريطة على الدبابيس المحمّلة، فتتفق النتيجتان.
 *
 * ترتيب النتائج (الوثيقة 8.6، `compareHits`):
 *   1. الأقرب، إن أُعطي موقع داخل بالي
 *   2. داخل المنطقة المختارة أو المذكورة في الجملة
 *   3. أولوية الإدارة (`priority`) ثم الترتيب اليدوي (`sort_order`)
 *   4. لمشترك VIP: أماكن VIP قبل غيرها
 *   5. الأكثر مشاهدة وحفظاً (مفضلة + رحلتي + مشاهدات)
 *
 * الأماكن المقفلة: النص والموقع لا يُطبَّقان عليها أبداً، ولا تُعاد بمعرّف.
 * لو طُبّقا لأمكن إعادة بناء الاسم حرفاً حرفاً، والإحداثيات بتضييق الدائرة
 * (ثغرة سابقة). يُعاد فقط عددها ضمن الفلاتر العامة (منطقة/تصنيف/وسم/Gems)،
 * وهي نفس المعلومة الظاهرة على الخريطة كـ "N أماكن مقفلة".
 */

import { and, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { db } from '@/db'
import { categories, mapPlaces, media, placeTags, regions, tags } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { pick } from '@/lib/content/localize'
import { listMapTaxonomy, mapPlacePopularity, toMedia } from '@/lib/content/queries'
import {
  canSeePlace,
  placeAccess,
  type EntitlementKind,
  type EntitlementSet,
} from '@/lib/entitlements'
import { haversineKm, isInBali, type LatLon } from '@/lib/geo'

import { normalizeSearch } from './normalize'
import {
  buildVocabulary,
  compareHits,
  matchesTerms,
  namesOf,
  placeHaystack,
  queryTerms,
  splitPlacePhrase,
  textRank,
  understandQuery,
  type QueryTerm,
  type TaxonomyEntry,
} from './query'

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
  /** مجاني / خطة الخريطة / VIP — لشارة البطاقة. */
  isFree: boolean
  requiredEntitlement: EntitlementKind
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
  /** الجملة طلبت "قريب مني" — إن لم يُرسل موقع، يطلبه العميل ثم يعيد البحث. */
  nearMe: boolean
  /** المنطقة المطبّقة (المختارة، أو التي سمّتها الجملة) — لتعرضها القائمة. */
  region: string | null
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

export { compareHits, normalizeSearch, splitPlacePhrase }

/** نسخة SQL من `normalizeSearch` — التطويل آخر `from` كي يُحذف (لا مقابل له في `to`). */
function normSql(expr: SQL): SQL {
  return sql`translate(regexp_replace(lower(${expr}), '[ً-ٰٟ]', '', 'g'), 'أإآٱةىáàâäãåéèêëíìîïóòôöõúùûüçñـ', 'ااااهيaaaaaaeeeeiiiiooooouuuucn')`
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

const LIVE_PLACE = [
  eq(mapPlaces.status, 'published'),
  isNull(mapPlaces.deletedAt),
  eq(mapPlaces.isHidden, false),
]

/**
 * الوسوم والتصنيفات الفرعية للأماكن المرئية فقط — استعلامان مجمّعان، لنص البحث.
 * لا يُستدعى أبداً بمعرّف مكان مقفل.
 */
async function textExtras(rows: readonly { id: string; subCategoryIds: string[] | null }[]) {
  const subIds = [
    ...new Set(
      rows.flatMap((row) => (row.subCategoryIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id))),
    ),
  ]
  const [tagRows, subRows] = await Promise.all([
    db
      .select({ placeId: placeTags.placeId, key: tags.key, label: tags.label })
      .from(placeTags)
      .innerJoin(tags, and(eq(tags.id, placeTags.tagId), eq(tags.status, 'active')))
      .where(
        inArray(
          placeTags.placeId,
          rows.map((row) => row.id),
        ),
      ),
    subIds.length === 0
      ? []
      : db
          .select({ id: categories.id, key: categories.key, label: categories.label })
          .from(categories)
          .where(inArray(categories.id, subIds)),
  ])
  const tagsByPlace = new Map<string, { key: string; label: Record<string, string> }[]>()
  for (const row of tagRows) {
    tagsByPlace.set(row.placeId, [...(tagsByPlace.get(row.placeId) ?? []), row])
  }
  return { tagsByPlace, subById: new Map(subRows.map((row) => [row.id, row])) }
}

export async function searchPlaces(
  input: PlaceSearchInput,
  held: EntitlementSet,
  locale: Locale,
): Promise<PlaceSearchResult> {
  const taxonomy = await listMapTaxonomy()
  const understood = understandQuery(input.q ?? '', buildVocabulary(taxonomy))
  // "كافيهات في كوتا": المنطقة التي سمّتها الجملة تغلب، كما في الخريطة.
  const regionKey = understood.areaKey ?? input.region ?? null

  /** فلاتر عامة: تُطبَّق على الكل، ويُحتسب بها عدد المقفلة. */
  const publicFilters: SQL[] = [...LIVE_PLACE]
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

  const rows = await db
    .select({
      place: mapPlaces,
      hero: media,
      regionKey: regions.key,
      parentKey: parentRegion.key,
      regionLabel: regions.label,
      parentLabel: parentRegion.label,
      categoryKey: categories.key,
      categoryLabel: categories.label,
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

  // النص والموقع على المرئي فقط — لا يُقيَّم أي منهما على مقفل.
  let visibleRows = rows.filter((row) => canSeePlace(row.place, held))
  if (understood.terms.length > 0 && visibleRows.length > 0) {
    const extras = await textExtras(visibleRows.map((row) => row.place))
    visibleRows = visibleRows.filter((row) =>
      matchesTerms(
        placeHaystack({
          slug: row.place.slug,
          name: row.place.name,
          category: row.place.category,
          description: row.place.description,
          categoryKey: row.categoryKey,
          categoryLabel: row.categoryLabel,
          subCategories: (row.place.subCategoryIds ?? [])
            .map((id) => extras.subById.get(id))
            .filter((sub): sub is NonNullable<typeof sub> => sub !== undefined),
          tags: extras.tagsByPlace.get(row.place.id) ?? [],
          regionKey: row.regionKey,
          regionLabel: row.regionLabel,
          parentRegionKey: row.parentKey,
          parentRegionLabel: row.parentLabel,
        }),
        understood.terms,
      ),
    )
  }

  const near = input.near && isInBali(input.near) ? input.near : null
  // "مستشفى قريب مني": ترتيب بالأقرب بلا قطع عند 5 كم — أقرب مستشفى قد يبعد 8.
  const radius = Math.min(
    Math.max(input.radiusKm ?? (understood.nearMe ? MAX_NEARBY_KM : DEFAULT_NEARBY_KM), 0.2),
    MAX_NEARBY_KM,
  )
  const popularity =
    visibleRows.length === 0 ? new Map<string, number>() : await mapPlacePopularity()
  const vipViewer = held.has('vip')

  const hits: PlaceSearchHit[] = visibleRows
    .map((row) => {
      const distanceKm = near === null ? null : haversineKm(near, row.place)
      const access = placeAccess(row.place)
      return {
        row,
        access,
        distanceKm,
        sort: {
          distanceKm,
          inRegion: regionKey ? row.regionKey === regionKey || row.parentKey === regionKey : false,
          priority: row.place.priority,
          sortOrder: row.place.sortOrder,
          vip: vipViewer && access.requiredEntitlement === 'vip' && !access.isFree,
          popularity: popularity.get(row.place.id) ?? 0,
          name: pick(row.place.name, locale, row.place.slug),
        },
      }
    })
    .filter((item) => item.distanceKm === null || item.distanceKm <= radius)
    .sort((a, b) => compareHits(a.sort, b.sort))
    .slice(0, Math.min(input.limit ?? 30, MAX_RESULTS))
    .map(({ row, access, distanceKm }) => ({
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
      isFree: access.isFree,
      requiredEntitlement: access.requiredEntitlement,
      distanceKm: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
      lat: row.place.lat,
      lon: row.place.lon,
      canFavorite: row.place.canFavorite,
      canAddToTrip: row.place.canAddToTrip,
    }))

  return {
    hits,
    lockedCount,
    lockedRequires,
    usedLocation: near !== null,
    nearMe: understood.nearMe,
    region: regionKey,
  }
}

/* --------------------------------------------------------------------------
   الاقتراحات أثناء الكتابة (الوثيقة 8.5)
   -------------------------------------------------------------------------- */

export type Suggestion =
  | { type: 'region'; key: string; label: string }
  | { type: 'category'; key: string; label: string }
  | { type: 'tag'; key: string; label: string }
  | { type: 'category_in_region'; category: string; region: string; label: string }
  | { type: 'place'; slug: string; label: string }

const MAX_SUGGESTIONS = 8

/** "التصنيفات الرئيسية" لاقتراح "X في المنطقة": الكافيهات ثم المطاعم، ثم الأكثر أماكن. */
const MAIN_CATEGORY_HINTS: readonly QueryTerm[][] = [queryTerms('cafe'), queryTerms('restaurant')]

function entryText(entry: TaxonomyEntry): string {
  return namesOf(entry.key, entry.label).join(' ')
}

/** أماكن منشورة ظاهرة لكل تصنيف رئيسي — عدد فقط، بلا أي بيانات مكان. */
async function categoryPlaceCounts(): Promise<Map<string, number>> {
  const rows = await db
    .select({ key: categories.key, n: sql<number>`count(*)::int` })
    .from(mapPlaces)
    .innerJoin(categories, eq(categories.id, mapPlaces.categoryId))
    .where(and(...LIVE_PLACE))
    .groupBy(categories.key)
  return new Map(rows.map((row) => [row.key, Number(row.n)]))
}

/**
 * "كو" / "ku" ← Kuta، ثم "الكافيهات في كوتا"، "المطاعم في كوتا" (للتصنيفات
 * الرئيسية حتى لو كانت أماكنها في مناطق أخرى)، ثم تصنيفات ووسوم وأماكن.
 * "cafes in ku" ← "الكافيهات في كوتا" مباشرة.
 *
 * حدود الملاءمة: 8 اقتراحات كحد أقصى؛ حرفان يطابقان بداية كلمة فقط؛ لا
 * "تصنيف في منطقة" لتصنيف بلا أي مكان ظاهر. أسماء الأماكن تُقترح فقط إذا
 * كان المستخدم يستطيع رؤيتها.
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

  const [taxonomy, counts, placeRows] = await Promise.all([
    listMapTaxonomy(),
    categoryPlaceCounts(),
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
          ...LIVE_PLACE,
          or(localizedLike(mapPlaces.name, like), sql`lower(${mapPlaces.slug}) like ${like}`),
        ),
      )
      // المقفل يُستبعد بعد الاستعلام؛ هامش كي لا تدفع الأماكن المقفلة المرئية خارج القائمة.
      .limit(60),
  ])

  const phrase = splitPlacePhrase(needle)
  const withPlaces = taxonomy.categories.filter((entry) => (counts.get(entry.key) ?? 0) > 0)

  // المناطق: الأقرب نصاً أولاً، والتعادل بترتيب لوحة التحكم (الترتيب ثابت).
  const regionHits = taxonomy.regions
    .map((region) => ({
      region,
      rank: textRank(namesOf(region.key, region.label), phrase?.where ?? needle),
    }))
    .filter((hit) => hit.rank >= 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 2)
    .map((hit) => hit.region)

  // "X في المنطقة": ما طلبته الجملة، وإلا التصنيفات الرئيسية.
  let comboCategories: TaxonomyEntry[]
  if (phrase !== null) {
    const terms = queryTerms(phrase.what)
    comboCategories =
      terms.length === 0 ? [] : withPlaces.filter((entry) => matchesTerms(entryText(entry), terms))
  } else {
    const hint = (entry: TaxonomyEntry) => {
      const index = MAIN_CATEGORY_HINTS.findIndex((terms) => matchesTerms(entryText(entry), terms))
      return index < 0 ? MAIN_CATEGORY_HINTS.length : index
    }
    comboCategories = [...withPlaces].sort(
      (a, b) => hint(a) - hint(b) || (counts.get(b.key) ?? 0) - (counts.get(a.key) ?? 0),
    )
  }

  const out: Suggestion[] = []
  const perRegion = regionHits.length > 1 ? 2 : 3
  for (const region of regionHits) {
    const regionLabel = pick(region.label, locale, region.key)
    out.push({ type: 'region', key: region.key, label: regionLabel })
    for (const category of comboCategories.slice(0, perRegion)) {
      out.push({
        type: 'category_in_region',
        category: category.key,
        region: region.key,
        label: phrases.inRegion(pick(category.label, locale, category.key), regionLabel),
      })
    }
  }

  if (phrase === null) {
    const terms = queryTerms(needle)
    const ranked = (entries: readonly TaxonomyEntry[]) =>
      entries
        .map((entry) => {
          const rank = textRank(namesOf(entry.key, entry.label), needle)
          // "مطعم" ← المطاعم: المرادفات بعد مطابقة الاسم نفسه.
          const viaSynonym = rank < 0 && terms.length > 0 && matchesTerms(entryText(entry), terms)
          return { entry, rank: rank >= 0 ? rank : viaSynonym ? 4 : -1 }
        })
        .filter((hit) => hit.rank >= 0)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 2)
        .map((hit) => hit.entry)

    for (const category of ranked(withPlaces))
      out.push({ type: 'category', key: category.key, label: pick(category.label, locale) })
    for (const tag of ranked(taxonomy.tags))
      out.push({ type: 'tag', key: tag.key, label: pick(tag.label, locale) })

    const places = placeRows
      .filter((place) => canSeePlace(place, held))
      .map((place) => ({ place, rank: textRank(namesOf(place.slug, place.name), needle) }))
      .filter((hit) => hit.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
    for (const { place } of places) {
      out.push({ type: 'place', slug: place.slug, label: pick(place.name, locale, place.slug) })
    }
  }

  const seen = new Set<string>()
  return out
    .filter((item) => {
      const id = `${item.type}:${item.label}`
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
    .slice(0, MAX_SUGGESTIONS)
}
