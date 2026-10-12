/**
 * Read-side content queries.
 *
 * Every function here answers one page's question and returns a DTO from
 * `./types.ts`. Three rules hold without exception:
 *
 *  1. **Only live rows.** `status = 'published'` AND `deleted_at IS NULL`, on
 *     every table that carries them, in every query — including the joined
 *     side. An unpublished activity must not surface as day 3 of a published
 *     itinerary, and a soft-deleted one must not surface at all.
 *  2. **No implicit fallbacks.** A missing slug returns `null` and the page
 *     calls `notFound()`. The prototype's `findActivity(id) || ACTIVITIES[0]`
 *     returned 200 with the wrong record for every bad URL, which is duplicate
 *     content at best and a wrong booking at worst.
 *  3. **No request-scoped state.** Nothing reads cookies or headers, so pages
 *     built on these queries stay statically renderable and cacheable at the
 *     edge. Entitlement filtering happens above this layer, in
 *     `@/lib/entitlements`.
 *
 * Related rows are fetched as a second keyed query rather than a wide join, so
 * a three-category activity is one row rather than three, and the caller never
 * has to de-duplicate.
 */

import { and, asc, desc, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm'

import { alias } from 'drizzle-orm/pg-core'

import { db } from '@/db'
import {
  activities,
  activityCategories,
  activityImages,
  activityTiers,
  articleCategories,
  articles,
  categories,
  driverVehicles,
  itineraries,
  itineraryDays,
  itineraryRegions,
  landmarks,
  mapPlaces,
  media,
  packageActivities,
  packageRegions,
  packages,
  placeTags,
  regions,
  reviews,
  tags,
} from '@/db/schema'
import { isIconName, type IconName } from '@/components/ui/icon'
import { defaultLocale, type Locale } from '@/i18n/config'
import type { VehicleClass } from '@/lib/booking-rules'
import type {
  ActivityDetail,
  ActivitySummary,
  ArticleCategoryDto,
  ArticleDetail,
  ArticleSummary,
  CategoryDto,
  CategoryRef,
  DriverVehicleDto,
  FaqEntry,
  ItineraryDayDto,
  ItineraryDetail,
  ItinerarySummary,
  LandmarkDto,
  ListActivitiesOptions,
  ListArticlesOptions,
  ListLandmarksOptions,
  LocalizedText,
  MediaDto,
  PackageDetail,
  PackageSummary,
  PricingMode,
  RegionDto,
  RegionRef,
  ReviewDto,
  SearchHit,
} from './types'
import { entityHref } from './types'
import { placeAccess, type FullMapPlace } from '@/lib/entitlements/redaction'
import { buildSrcSet, derivativeKey, fallbackRung, isUnoptimised } from '@/lib/media/ladder'

// ---------------------------------------------------------------------------
// Shared predicates
// ---------------------------------------------------------------------------

const PUBLISHED = 'published'

const LIVE_ACTIVITY = and(eq(activities.status, PUBLISHED), isNull(activities.deletedAt))
const LIVE_ITINERARY = and(eq(itineraries.status, PUBLISHED), isNull(itineraries.deletedAt))
const LIVE_PACKAGE = and(eq(packages.status, PUBLISHED), isNull(packages.deletedAt))
const LIVE_LANDMARK = and(eq(landmarks.status, PUBLISHED), isNull(landmarks.deletedAt))
const LIVE_ARTICLE = and(eq(articles.status, PUBLISHED), isNull(articles.deletedAt))
// `is_hidden` يخفي المكان عن الخريطة والبحث دون إلغاء نشره (مغلق مؤقتاً مثلاً).
const LIVE_PLACE = and(
  eq(mapPlaces.status, PUBLISHED),
  isNull(mapPlaces.deletedAt),
  eq(mapPlaces.isHidden, false),
)
/** المنطقة العامة التي يقع فيها الحي (Kuta ← جنوب بالي). */
const parentRegion = alias(regions, 'parent_region')

/** روابط فيديو https فقط من مصادر تُضمَّن (YouTube/Vimeo) أو ملف mp4/webm. */
function isSafeVideoUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    return (
      /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(url.hostname) ||
      /\.(mp4|webm)$/i.test(url.pathname)
    )
  } catch {
    return false
  }
}

const LIVE_REVIEW = and(eq(reviews.isPublished, true), isNull(reviews.deletedAt))

/** Default page size for the catalogue lists. */
const DEFAULT_LIMIT = 60
const SEARCH_LIMIT = 12

// ---------------------------------------------------------------------------
// Row → DTO mapping
// ---------------------------------------------------------------------------

type MediaRow = typeof media.$inferSelect
type RegionRow = typeof regions.$inferSelect
type ActivityRow = typeof activities.$inferSelect

/**
 * Public CDN base for the images bucket.
 *
 * Read once at module scope. When it is unset — local development against a
 * seeded database with no Spaces credentials — object keys resolve to
 * same-origin paths so `next dev` can serve them out of `public/`.
 */
const CDN_BASE = (process.env.NEXT_PUBLIC_CDN_URL ?? '').replace(/\/+$/, '')

export function mediaUrl(objectKey: string): string {
  const key = objectKey.replace(/^\/+/, '')
  return CDN_BASE === '' ? `/${key}` : `${CDN_BASE}/${key}`
}

function toMedia(row: MediaRow | null | undefined): MediaDto | null {
  // A soft-deleted image is treated as no image rather than a dead URL: the
  // FK is nullable and `<Photo>` already renders a neutral placeholder.
  if (!row || row.deletedAt !== null) return null

  /**
   * Serve a ladder rung, not the original.
   *
   * The originals are what the photographer shot -- 3840px, 1-1.6 MB each.
   * Pointing `url` at them made the home page 95 MB across 36 images, which
   * on a mobile connection is not a slow page but an unreachable one. Every
   * rung was already being generated on upload and none was ever requested.
   *
   * 1280 rather than the widest rung, because this is the single URL used by
   * anything that ignores srcset -- crawlers, mail clients, older browsers --
   * and it is wide enough for a full-bleed hero on a laptop at about a tenth
   * the bytes.
   *
   * WebP for the fallback: every browser released since 2020 supports it, and
   * the ladder holds no JPEG rungs, so the only other option is the original.
   *
   * An object stored without a ladder (uploaded while the sharp encoder was
   * missing) has no rungs at all, so it keeps the original and emits no
   * srcset. Requesting a width that was never written is a 404.
   */
  const optimised = !isUnoptimised(row.objectKey)

  return {
    id: row.id,
    url: optimised
      ? mediaUrl(derivativeKey(row.id, fallbackRung(row.width), 'webp'))
      : mediaUrl(row.objectKey),
    srcSetAvif: optimised ? buildSrcSet(row.id, row.width, 'avif', mediaUrl) : null,
    srcSetWebp: optimised ? buildSrcSet(row.id, row.width, 'webp', mediaUrl) : null,
    alt: row.alt,
    width: row.width,
    height: row.height,
    blurhash: row.blurhash,
    credit: row.credit,
  }
}

function toRegionRef(row: RegionRow | null | undefined): RegionRef | null {
  if (!row) return null
  return { id: row.id, key: row.key, label: row.label }
}

function toLocalizedList(value: LocalizedText[] | null | undefined): LocalizedText[] {
  return Array.isArray(value) ? value : []
}

function toFaq(value: FaqEntry[] | null | undefined): FaqEntry[] {
  return Array.isArray(value) ? value : []
}

function toIconNames(value: string[] | null | undefined): IconName[] {
  if (!Array.isArray(value)) return []
  return value.filter(isIconName)
}

function toPricingMode(value: string): PricingMode {
  return value === 'per_guest' ? 'per_guest' : 'flat'
}

const VEHICLE_CLASSES = new Set<string>(['sedan', 'suv', 'van'])

function isVehicleClass(value: string): value is VehicleClass {
  return VEHICLE_CLASSES.has(value)
}

function toActivitySummary(
  row: ActivityRow,
  region: RegionRow | null,
  hero: MediaRow | null,
  cats: CategoryRef[],
): ActivitySummary {
  return {
    id: row.id,
    slug: row.slug,
    href: entityHref('activity', row.slug),
    name: row.name,
    area: row.area,
    duration: row.duration,
    region: toRegionRef(region),
    categories: cats,
    priceMinor: row.priceMinor,
    currency: row.currency,
    rating: row.rating,
    reviewCount: row.reviewCount,
    hero: toMedia(hero),
  }
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

/**
 * A localized jsonb field resolved to text, inside SQL.
 *
 * Mirrors `pick()` from `./localize.ts`: requested locale, then English, then
 * the row's stable key. Used for ORDER BY and for ILIKE matching so the
 * database sorts and filters on the same string the page renders.
 *
 * The `::text` cast is load-bearing — `->>` is overloaded on `text` and
 * `integer`, and an untyped bind parameter leaves Postgres unable to pick.
 */
function localizedText(
  column: SQL | unknown,
  locale: Locale,
  fallback: SQL | unknown,
): SQL<string> {
  return sql<string>`coalesce(nullif(${column} ->> ${locale}::text, ''), nullif(${column} ->> ${defaultLocale}::text, ''), ${fallback})`
}

/** Case-insensitive contains, against the requested locale and English. */
function matchesLocalized(column: SQL | unknown, locale: Locale, needle: string): SQL {
  const pattern = `%${escapeLike(needle)}%`
  return sql`((${column} ->> ${locale}::text) ilike ${pattern} escape '\\' or (${column} ->> ${defaultLocale}::text) ilike ${pattern} escape '\\')`
}

/**
 * Neutralise LIKE wildcards in user input.
 *
 * Without this a search for "%" matches the entire catalogue and a search for
 * "100%_" degrades into a table scan with a meaningless result.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined) return fallback
  if (!Number.isFinite(limit) || limit <= 0) return fallback
  return Math.min(Math.floor(limit), 200)
}

function clampOffset(offset: number | undefined): number {
  if (offset === undefined || !Number.isFinite(offset) || offset <= 0) return 0
  return Math.floor(offset)
}

/** `null` when the caller passed nothing or the design's "all" sentinel. */
function normalizeKey(key: string | null | undefined): string | null {
  if (key === undefined || key === null) return null
  const trimmed = key.trim()
  if (trimmed === '' || trimmed === 'all') return null
  return trimmed
}

function normalizeQuery(q: string | null | undefined): string | null {
  if (!q) return null
  const trimmed = q.trim()
  return trimmed === '' ? null : trimmed
}

/** Restore the caller's ordering after an `inArray` fetch, which has none. */
function orderByIds<T>(
  items: readonly T[],
  ids: readonly string[],
  idOf: (item: T) => string,
): T[] {
  const byId = new Map(items.map((item) => [idOf(item), item]))
  const out: T[] = []
  for (const id of ids) {
    const found = byId.get(id)
    if (found !== undefined) out.push(found)
  }
  return out
}

// ---------------------------------------------------------------------------
// Keyed sub-fetches
// ---------------------------------------------------------------------------

async function categoriesByActivity(
  activityIds: readonly string[],
): Promise<Map<string, CategoryRef[]>> {
  const out = new Map<string, CategoryRef[]>()
  if (activityIds.length === 0) return out

  const rows = await db
    .select({
      activityId: activityCategories.activityId,
      id: categories.id,
      key: categories.key,
      label: categories.label,
      icon: categories.icon,
      sortOrder: categories.sortOrder,
    })
    .from(activityCategories)
    .innerJoin(categories, eq(categories.id, activityCategories.categoryId))
    .where(inArray(activityCategories.activityId, [...activityIds]))
    .orderBy(asc(categories.sortOrder), asc(categories.key))

  for (const row of rows) {
    const list = out.get(row.activityId) ?? []
    list.push({
      id: row.id,
      key: row.key,
      label: row.label,
      icon: row.icon !== null && isIconName(row.icon) ? row.icon : null,
    })
    out.set(row.activityId, list)
  }
  return out
}

async function regionsByOwner(
  kind: 'itinerary' | 'package',
  ownerIds: readonly string[],
): Promise<Map<string, RegionRef[]>> {
  const out = new Map<string, RegionRef[]>()
  if (ownerIds.length === 0) return out

  const rows =
    kind === 'itinerary'
      ? await db
          .select({
            ownerId: itineraryRegions.itineraryId,
            id: regions.id,
            key: regions.key,
            label: regions.label,
            sortOrder: regions.sortOrder,
          })
          .from(itineraryRegions)
          .innerJoin(regions, eq(regions.id, itineraryRegions.regionId))
          .where(inArray(itineraryRegions.itineraryId, [...ownerIds]))
          .orderBy(asc(regions.sortOrder), asc(regions.key))
      : await db
          .select({
            ownerId: packageRegions.packageId,
            id: regions.id,
            key: regions.key,
            label: regions.label,
            sortOrder: regions.sortOrder,
          })
          .from(packageRegions)
          .innerJoin(regions, eq(regions.id, packageRegions.regionId))
          .where(inArray(packageRegions.packageId, [...ownerIds]))
          .orderBy(asc(regions.sortOrder), asc(regions.key))

  for (const row of rows) {
    const list = out.get(row.ownerId) ?? []
    list.push({ id: row.id, key: row.key, label: row.label })
    out.set(row.ownerId, list)
  }
  return out
}

/**
 * Load full activity summaries for an arbitrary id set.
 *
 * Shared by the itinerary day plan, the package contents and
 * `similarActivities`, so all three enforce the same published filter and
 * return the same shape a listing page renders.
 */
async function activitySummariesByIds(
  ids: readonly string[],
): Promise<Map<string, ActivitySummary>> {
  const out = new Map<string, ActivitySummary>()
  if (ids.length === 0) return out

  const rows = await db
    .select({ activity: activities, region: regions, hero: media })
    .from(activities)
    .leftJoin(regions, eq(regions.id, activities.regionId))
    .leftJoin(media, eq(media.id, activities.heroImageId))
    .where(and(LIVE_ACTIVITY, inArray(activities.id, [...ids])))

  const cats = await categoriesByActivity(rows.map((r) => r.activity.id))

  for (const row of rows) {
    out.set(
      row.activity.id,
      toActivitySummary(row.activity, row.region, row.hero, cats.get(row.activity.id) ?? []),
    )
  }
  return out
}

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

/**
 * المناطق المفعّلة فقط — المعطّلة من لوحة التحكم لا تظهر للزوار.
 * افتراضياً المناطق العامة وحدها (تبويبات الرئيسية، استكشف)؛ `includeAreas`
 * يضيف الأحياء (Kuta، Seminyak…) لنموذج الطلب المخصص.
 */
export async function listRegions(options: { includeAreas?: boolean } = {}): Promise<RegionDto[]> {
  const rows = await db
    .select()
    .from(regions)
    .where(
      options.includeAreas === true
        ? eq(regions.status, 'active')
        : and(eq(regions.status, 'active'), isNull(regions.parentId)),
    )
    .orderBy(asc(regions.sortOrder), asc(regions.key))

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    sortOrder: row.sortOrder,
  }))
}

export async function listCategories(): Promise<CategoryDto[]> {
  const rows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.key))

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    icon: row.icon !== null && isIconName(row.icon) ? row.icon : null,
    sortOrder: row.sortOrder,
  }))
}

export async function listArticleCategories(): Promise<ArticleCategoryDto[]> {
  const rows = await db
    .select()
    .from(articleCategories)
    .orderBy(asc(articleCategories.sortOrder), asc(articleCategories.key))

  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    label: row.label,
    sortOrder: row.sortOrder,
  }))
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export async function listActivities(
  options: ListActivitiesOptions = {},
): Promise<ActivitySummary[]> {
  const locale = options.locale ?? defaultLocale
  const categoryKey = normalizeKey(options.categoryKey)
  const limit = clampLimit(options.limit, DEFAULT_LIMIT)
  const offset = clampOffset(options.offset)

  const filters: (SQL | undefined)[] = [LIVE_ACTIVITY]

  if (categoryKey !== null) {
    // EXISTS rather than a join: an activity in three categories must still
    // come back as one row, and the join would silently triple it.
    filters.push(
      sql`exists (
        select 1 from ${activityCategories}
        inner join ${categories} on ${categories.id} = ${activityCategories.categoryId}
        where ${activityCategories.activityId} = ${activities.id}
          and ${categories.key} = ${categoryKey}
      )`,
    )
  }

  /**
   * Sort order.
   *
   * 'region' orders by the *translated* label with the region key as the
   * final tiebreak — the handoff sorted by the raw English key, so the
   * Arabic and Indonesian catalogues came back in an order that matched
   * neither their alphabet nor any label on the page.
   */
  const nameOrder = localizedText(activities.name, locale, activities.slug)
  const order: SQL[] = (() => {
    switch (options.sort) {
      case 'top':
        return [
          sql`${activities.rating} desc nulls last`,
          sql`${activities.reviewCount} desc`,
          asc(nameOrder),
        ]
      case 'price':
        return [asc(activities.priceMinor), asc(nameOrder)]
      case 'region':
        return [
          asc(localizedText(regions.label, locale, regions.key)),
          asc(activities.sortOrder),
          asc(nameOrder),
        ]
      default:
        return [
          asc(activities.sortOrder),
          sql`${activities.rating} desc nulls last`,
          asc(nameOrder),
        ]
    }
  })()

  const rows = await db
    .select({ activity: activities, region: regions, hero: media })
    .from(activities)
    .leftJoin(regions, eq(regions.id, activities.regionId))
    .leftJoin(media, eq(media.id, activities.heroImageId))
    .where(and(...filters))
    .orderBy(...order)
    .limit(limit)
    .offset(offset)

  const cats = await categoriesByActivity(rows.map((r) => r.activity.id))

  return rows.map((row) =>
    toActivitySummary(row.activity, row.region, row.hero, cats.get(row.activity.id) ?? []),
  )
}

export async function getActivityBySlug(slug: string): Promise<ActivityDetail | null> {
  const rows = await db
    .select({ activity: activities, region: regions, hero: media })
    .from(activities)
    .leftJoin(regions, eq(regions.id, activities.regionId))
    .leftJoin(media, eq(media.id, activities.heroImageId))
    .where(and(LIVE_ACTIVITY, eq(activities.slug, slug)))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  const [cats, gallery, tierRows] = await Promise.all([
    categoriesByActivity([row.activity.id]),
    db
      .select({ image: media })
      .from(activityImages)
      .innerJoin(media, eq(media.id, activityImages.mediaId))
      .where(and(eq(activityImages.activityId, row.activity.id), isNull(media.deletedAt)))
      .orderBy(asc(activityImages.sortOrder)),
    /**
     * Published tiers only, cheapest first.
     *
     * Ordered by price rather than sortOrder so the ladder always reads as a
     * ladder: a hand-set order that disagrees with the prices shows the
     * visitor $240, $120, $200 and makes the page look broken.
     */
    db
      .select()
      .from(activityTiers)
      .where(
        and(
          eq(activityTiers.activityId, row.activity.id),
          eq(activityTiers.status, 'published'),
          isNull(activityTiers.deletedAt),
        ),
      )
      .orderBy(asc(activityTiers.priceMinor), asc(activityTiers.sortOrder)),
  ])

  const summary = toActivitySummary(
    row.activity,
    row.region,
    row.hero,
    cats.get(row.activity.id) ?? [],
  )

  const galleryDtos = gallery.map((g) => toMedia(g.image)).filter((m): m is MediaDto => m !== null)

  return {
    ...summary,
    description: row.activity.description,
    included: toLocalizedList(row.activity.included),
    excluded: toLocalizedList(row.activity.excluded),
    faq: toFaq(row.activity.faq),
    cancellationPolicy: row.activity.cancellationPolicy,
    timeSlots: Array.isArray(row.activity.timeSlots) ? row.activity.timeSlots : [],
    leadTimeHours: row.activity.leadTimeHours,
    maxGuests: row.activity.maxGuests,
    tiers: tierRows.map((tier) => ({
      id: tier.id,
      key: tier.key,
      name: tier.name,
      tagline: tier.tagline,
      priceMinor: tier.priceMinor,
      currency: tier.currency,
      pricingMode: tier.pricingMode === 'flat' ? ('flat' as const) : ('per_guest' as const),
      maxGuests: tier.maxGuests,
      isPopular: tier.isPopular,
      features: toLocalizedList(tier.features),
      highlights: toLocalizedList(tier.highlights),
      details: toLocalizedList(tier.details),
      notes: toLocalizedList(tier.notes),
    })),
    // The hero leads the gallery when it is not already one of the images.
    gallery:
      summary.hero && !galleryDtos.some((g) => g.id === summary.hero?.id)
        ? [summary.hero, ...galleryDtos]
        : galleryDtos,
  }
}

/**
 * Activities sharing a category with the given one, most-overlapping first.
 *
 * The handoff took the first three matches in array order, so the "similar"
 * rail was identical for every activity in a large category.
 */
export async function similarActivities(activityId: string, n = 3): Promise<ActivitySummary[]> {
  const limit = clampLimit(n, 3)

  const own = await db
    .select({ categoryId: activityCategories.categoryId })
    .from(activityCategories)
    .where(eq(activityCategories.activityId, activityId))

  const categoryIds = own.map((row) => row.categoryId)
  if (categoryIds.length === 0) return []

  const ranked = await db
    .select({
      id: activityCategories.activityId,
      overlap: sql<number>`count(*)::int`,
      rating: sql<number | null>`max(${activities.rating})`,
    })
    .from(activityCategories)
    .innerJoin(activities, eq(activities.id, activityCategories.activityId))
    .where(
      and(
        LIVE_ACTIVITY,
        ne(activityCategories.activityId, activityId),
        inArray(activityCategories.categoryId, categoryIds),
      ),
    )
    .groupBy(activityCategories.activityId)
    .orderBy(sql`count(*) desc`, sql`max(${activities.rating}) desc nulls last`)
    .limit(limit)

  const ids = ranked.map((row) => row.id)
  const summaries = await activitySummariesByIds(ids)
  return orderByIds([...summaries.values()], ids, (item) => item.id)
}

// ---------------------------------------------------------------------------
// Itineraries
// ---------------------------------------------------------------------------

async function toItinerarySummaries(
  rows: readonly { itinerary: typeof itineraries.$inferSelect; hero: MediaRow | null }[],
): Promise<ItinerarySummary[]> {
  const regionMap = await regionsByOwner(
    'itinerary',
    rows.map((r) => r.itinerary.id),
  )

  return rows.map(({ itinerary, hero }) => ({
    id: itinerary.id,
    slug: itinerary.slug,
    href: entityHref('itinerary', itinerary.slug),
    name: itinerary.name,
    blurb: itinerary.blurb,
    days: itinerary.days,
    spots: itinerary.spots,
    tripType: itinerary.tripType,
    audience: toLocalizedList(itinerary.audience),
    regions: regionMap.get(itinerary.id) ?? [],
    priceMinor: itinerary.priceMinor,
    currency: itinerary.currency,
    version: itinerary.version,
    hero: toMedia(hero),
  }))
}

export async function listItineraries(): Promise<ItinerarySummary[]> {
  const rows = await db
    .select({ itinerary: itineraries, hero: media })
    .from(itineraries)
    .leftJoin(media, eq(media.id, itineraries.heroImageId))
    .where(LIVE_ITINERARY)
    .orderBy(asc(itineraries.days), asc(itineraries.priceMinor))

  return toItinerarySummaries(rows)
}

export async function getItineraryBySlug(slug: string): Promise<ItineraryDetail | null> {
  const rows = await db
    .select({ itinerary: itineraries, hero: media })
    .from(itineraries)
    .leftJoin(media, eq(media.id, itineraries.heroImageId))
    .where(and(LIVE_ITINERARY, eq(itineraries.slug, slug)))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  const summaries = await toItinerarySummaries([row])
  const summary = summaries[0]
  if (!summary) return null

  const dayRows = await db
    .select({
      id: itineraryDays.id,
      dayNumber: itineraryDays.dayNumber,
      isFreeDay: itineraryDays.isFreeDay,
      title: itineraryDays.title,
      description: itineraryDays.description,
      activityId: itineraryDays.activityId,
    })
    .from(itineraryDays)
    .where(eq(itineraryDays.itineraryId, row.itinerary.id))
    .orderBy(asc(itineraryDays.dayNumber))

  const activityIds = dayRows.map((day) => day.activityId).filter((id): id is string => id !== null)

  const activityMap = await activitySummariesByIds(activityIds)

  const dayPlans: ItineraryDayDto[] = dayRows.map((day) => ({
    id: day.id,
    dayNumber: day.dayNumber,
    isFreeDay: day.isFreeDay,
    title: day.title,
    description: day.description,
    // Null when the day is editorially free, or when its activity was
    // unpublished after the plan was authored. Either way the page renders
    // the day's own copy rather than inventing "Free day to explore & relax".
    activity: day.activityId === null ? null : (activityMap.get(day.activityId) ?? null),
  }))

  const galleryIds = (row.itinerary.galleryImageIds ?? []).filter((id) => typeof id === 'string')
  const galleryRows =
    galleryIds.length === 0
      ? []
      : await db.select().from(media).where(inArray(media.id, galleryIds))
  const galleryById = new Map(galleryRows.map((item) => [item.id, item]))
  const gallery = galleryIds
    .map((id) => toMedia(galleryById.get(id)))
    .filter((item): item is NonNullable<typeof item> => item !== null)

  return {
    ...summary,
    dayPlans,
    detailedDescription: row.itinerary.detailedDescription ?? null,
    gallery,
    includesMap: row.itinerary.includesMap,
    isVip: row.itinerary.isVip,
  }
}

export async function itinerariesWithActivity(activityId: string): Promise<ItinerarySummary[]> {
  const rows = await db
    .selectDistinctOn([itineraries.id], { itinerary: itineraries, hero: media })
    .from(itineraries)
    .innerJoin(itineraryDays, eq(itineraryDays.itineraryId, itineraries.id))
    .leftJoin(media, eq(media.id, itineraries.heroImageId))
    .where(and(LIVE_ITINERARY, eq(itineraryDays.activityId, activityId)))
    .orderBy(asc(itineraries.id))

  const summaries = await toItinerarySummaries(rows)
  return summaries.sort((a, b) => a.days - b.days || a.priceMinor - b.priceMinor)
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

async function toPackageSummaries(
  rows: readonly { pkg: typeof packages.$inferSelect; hero: MediaRow | null }[],
): Promise<PackageSummary[]> {
  const regionMap = await regionsByOwner(
    'package',
    rows.map((r) => r.pkg.id),
  )

  return rows.map(({ pkg, hero }) => ({
    id: pkg.id,
    slug: pkg.slug,
    href: entityHref('package', pkg.slug),
    name: pkg.name,
    blurb: pkg.blurb,
    days: pkg.days,
    maxGuests: pkg.maxGuests,
    driverIncluded: pkg.driverIncluded,
    priceMinor: pkg.priceMinor,
    currency: pkg.currency,
    pricingMode: toPricingMode(pkg.pricingMode),
    amenities: toIconNames(pkg.amenities),
    regions: regionMap.get(pkg.id) ?? [],
    hero: toMedia(hero),
  }))
}

export async function listPackages(): Promise<PackageSummary[]> {
  const rows = await db
    .select({ pkg: packages, hero: media })
    .from(packages)
    .leftJoin(media, eq(media.id, packages.heroImageId))
    .where(LIVE_PACKAGE)
    .orderBy(asc(packages.priceMinor), asc(packages.days))

  return toPackageSummaries(rows)
}

export async function getPackageBySlug(slug: string): Promise<PackageDetail | null> {
  const rows = await db
    .select({ pkg: packages, hero: media })
    .from(packages)
    .leftJoin(media, eq(media.id, packages.heroImageId))
    .where(and(LIVE_PACKAGE, eq(packages.slug, slug)))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  const summaries = await toPackageSummaries([row])
  const summary = summaries[0]
  if (!summary) return null

  const links = await db
    .select({ activityId: packageActivities.activityId })
    .from(packageActivities)
    .where(eq(packageActivities.packageId, row.pkg.id))
    .orderBy(asc(packageActivities.sortOrder))

  const ids = links.map((link) => link.activityId)
  const activityMap = await activitySummariesByIds(ids)

  return {
    ...summary,
    included: toLocalizedList(row.pkg.included),
    excluded: toLocalizedList(row.pkg.excluded),
    activities: orderByIds([...activityMap.values()], ids, (item) => item.id),
  }
}

export async function packagesWithActivity(activityId: string): Promise<PackageSummary[]> {
  const rows = await db
    .selectDistinctOn([packages.id], { pkg: packages, hero: media })
    .from(packages)
    .innerJoin(packageActivities, eq(packageActivities.packageId, packages.id))
    .leftJoin(media, eq(media.id, packages.heroImageId))
    .where(and(LIVE_PACKAGE, eq(packageActivities.activityId, activityId)))
    .orderBy(asc(packages.id))

  const summaries = await toPackageSummaries(rows)
  return summaries.sort((a, b) => a.priceMinor - b.priceMinor)
}

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------

export async function listLandmarks(options: ListLandmarksOptions = {}): Promise<LandmarkDto[]> {
  const regionKey = normalizeKey(options.regionKey)
  const limit = clampLimit(options.limit, DEFAULT_LIMIT)

  const filters: (SQL | undefined)[] = [LIVE_LANDMARK]
  if (regionKey !== null) filters.push(eq(regions.key, regionKey))

  const rows = await db
    .select({ landmark: landmarks, region: regions, hero: media, activitySlug: activities.slug })
    .from(landmarks)
    .leftJoin(regions, eq(regions.id, landmarks.regionId))
    .leftJoin(media, eq(media.id, landmarks.heroImageId))
    // Only a live activity earns the "book it" link; an unpublished one would
    // otherwise send every landmark card to a 404.
    .leftJoin(activities, and(eq(activities.id, landmarks.activityId), LIVE_ACTIVITY))
    .where(and(...filters))
    .orderBy(asc(landmarks.sortOrder), asc(landmarks.slug))
    .limit(limit)

  return rows.map(({ landmark, region, hero, activitySlug }) => ({
    id: landmark.id,
    slug: landmark.slug,
    href: entityHref('landmark', landmark.slug),
    name: landmark.name,
    type: landmark.type,
    blurb: landmark.blurb,
    region: toRegionRef(region),
    activitySlug,
    hero: toMedia(hero),
  }))
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

type ArticleJoin = {
  article: typeof articles.$inferSelect
  category: typeof articleCategories.$inferSelect | null
  hero: MediaRow | null
}

function toArticleSummary({ article, category, hero }: ArticleJoin): ArticleSummary {
  return {
    id: article.id,
    slug: article.slug,
    href: entityHref('article', article.slug),
    title: article.title,
    excerpt: article.excerpt,
    category:
      category === null
        ? null
        : {
            id: category.id,
            key: category.key,
            label: category.label,
            sortOrder: category.sortOrder,
          },
    bridge: article.bridge,
    publishedAt: article.publishedAt === null ? null : article.publishedAt.toISOString(),
    hero: toMedia(hero),
  }
}

export async function listArticles(options: ListArticlesOptions = {}): Promise<ArticleSummary[]> {
  const locale = options.locale ?? defaultLocale
  const categoryKey = normalizeKey(options.categoryKey)
  const q = normalizeQuery(options.q)
  const limit = clampLimit(options.limit, DEFAULT_LIMIT)
  const offset = clampOffset(options.offset)

  const filters: (SQL | undefined)[] = [LIVE_ARTICLE]
  if (categoryKey !== null) filters.push(eq(articleCategories.key, categoryKey))
  if (q !== null) {
    filters.push(
      or(
        matchesLocalized(articles.title, locale, q),
        matchesLocalized(articles.excerpt, locale, q),
      ),
    )
  }

  const rows = await db
    .select({ article: articles, category: articleCategories, hero: media })
    .from(articles)
    .leftJoin(articleCategories, eq(articleCategories.id, articles.categoryId))
    .leftJoin(media, eq(media.id, articles.heroImageId))
    .where(and(...filters))
    .orderBy(sql`${articles.publishedAt} desc nulls last`, asc(articles.slug))
    .limit(limit)
    .offset(offset)

  return rows.map(toArticleSummary)
}

export async function getArticleBySlug(slug: string): Promise<ArticleDetail | null> {
  const rows = await db
    .select({ article: articles, category: articleCategories, hero: media })
    .from(articles)
    .leftJoin(articleCategories, eq(articleCategories.id, articles.categoryId))
    .leftJoin(media, eq(media.id, articles.heroImageId))
    .where(and(LIVE_ARTICLE, eq(articles.slug, slug)))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  return { ...toArticleSummary(row), body: row.article.body }
}

// ---------------------------------------------------------------------------
// Map places
// ---------------------------------------------------------------------------

/**
 * Every published place, unredacted.
 *
 * The shape matches `FullMapPlace`, so the caller pipes this straight into
 * `buildMapPayload(places, entitlements)` and only the redacted result ever
 * crosses to the client. Never serialise this array into a page payload.
 */
export async function listMapPlaces(): Promise<FullMapPlace[]> {
  const rows = await db
    .select({
      place: mapPlaces,
      hero: media,
      activitySlug: activities.slug,
      regionKey: regions.key,
      regionLabel: regions.label,
      parentRegionKey: parentRegion.key,
      parentRegionLabel: parentRegion.label,
      categoryKey: categories.key,
      categoryLabel: categories.label,
    })
    .from(mapPlaces)
    .leftJoin(media, eq(media.id, mapPlaces.heroImageId))
    .leftJoin(activities, and(eq(activities.id, mapPlaces.activityId), LIVE_ACTIVITY))
    .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
    .leftJoin(parentRegion, eq(parentRegion.id, regions.parentId))
    .leftJoin(categories, eq(categories.id, mapPlaces.categoryId))
    .where(LIVE_PLACE)
    // الأعلى أولوية أولاً، ثم الترتيب اليدوي من لوحة التحكم.
    .orderBy(desc(mapPlaces.priority), asc(mapPlaces.sortOrder), asc(mapPlaces.slug))

  const tagRows =
    rows.length === 0
      ? []
      : await db
          .select({ placeId: placeTags.placeId, key: tags.key, label: tags.label })
          .from(placeTags)
          .innerJoin(tags, and(eq(tags.id, placeTags.tagId), eq(tags.status, 'active')))
          .where(
            inArray(
              placeTags.placeId,
              rows.map((row) => row.place.id),
            ),
          )
  const tagsByPlace = new Map<string, { key: string; label: LocalizedText }[]>()
  for (const row of tagRows) {
    const list = tagsByPlace.get(row.placeId) ?? []
    list.push({ key: row.key, label: row.label })
    tagsByPlace.set(row.placeId, list)
  }

  return rows.map(
    ({
      place,
      hero,
      activitySlug,
      regionKey,
      regionLabel,
      parentRegionKey,
      parentRegionLabel,
      categoryKey,
      categoryLabel,
    }) => ({
      id: place.id,
      slug: place.slug,
      name: place.name,
      category: place.category,
      description: place.description,
      lat: place.lat,
      lon: place.lon,
      rating: place.rating,
      openingHours: place.openingHours,
      tags: place.tags,
      heroImageUrl: toMedia(hero)?.url ?? null,
      activitySlug,
      ...placeAccess(place),
      isHiddenGem: place.isHiddenGem,
      regionKey,
      regionLabel,
      parentRegionKey,
      parentRegionLabel,
      categoryKey,
      categoryLabel,
      tagKeys: (tagsByPlace.get(place.id) ?? []).map((tag) => tag.key),
      tagList: tagsByPlace.get(place.id) ?? [],
      detailedDescription: place.detailedDescription,
      videos: (place.videos ?? []).filter(isSafeVideoUrl).slice(0, 4),
      canFavorite: place.canFavorite,
      canAddToTrip: place.canAddToTrip,
      priority: place.priority,
    }),
  )
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/**
 * Reviews written about this activity, and only this activity.
 *
 * The prototype filtered a shared pool by tag overlap and fell back to
 * `slice(0, 3)` when nothing matched, so unrelated reviews were displayed as
 * though they belonged to the item being viewed.
 */
export async function reviewsForActivity(activityId: string): Promise<ReviewDto[]> {
  const rows = await db
    .select()
    .from(reviews)
    .where(and(LIVE_REVIEW, eq(reviews.activityId, activityId)))
    .orderBy(desc(reviews.createdAt))

  return rows.map((row) => ({
    id: row.id,
    authorName: row.authorName,
    authorCountry: row.authorCountry,
    stars: row.stars,
    body: row.body,
    isVerified: row.orderId !== null,
    createdAt: row.createdAt.toISOString(),
  }))
}

// ---------------------------------------------------------------------------
// Driver fleet
// ---------------------------------------------------------------------------

export async function listDriverVehicles(): Promise<DriverVehicleDto[]> {
  const rows = await db
    .select()
    .from(driverVehicles)
    .orderBy(asc(driverVehicles.sortOrder), asc(driverVehicles.minPassengers))

  const out: DriverVehicleDto[] = []
  for (const row of rows) {
    // A class outside sedan/suv/van has no pricing or capacity rule behind it,
    // so it is dropped rather than rendered as an unbookable option.
    if (!isVehicleClass(row.vehicleClass)) continue
    out.push({
      id: row.id,
      vehicleClass: row.vehicleClass,
      label: row.label,
      description: row.description,
      minPassengers: row.minPassengers,
      maxPassengers: row.maxPassengers,
      dayRateMinor: row.dayRateMinor,
      currency: row.currency,
      fleetSize: row.fleetSize,
      sortOrder: row.sortOrder,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Site search
// ---------------------------------------------------------------------------

/**
 * Cross-entity search.
 *
 * Matches the requested locale and English, so "Batur" finds the mountain from
 * the Arabic site and an Arabic query still works when only the English string
 * is filled in. Ordered by entity type, matching the overlay's grouping.
 *
 * Map places are matched by name only and are returned unconditionally — the
 * hit reveals nothing beyond the name and category, which is what the pin
 * already shows on the free tier. Coordinates and images stay behind
 * `buildMapPayload`.
 */
export async function search(
  q: string,
  locale: Locale,
  limit: number = SEARCH_LIMIT,
): Promise<SearchHit[]> {
  const needle = normalizeQuery(q)
  if (needle === null) return []

  const perType = clampLimit(limit, SEARCH_LIMIT)

  const [activityRows, placeRows, itineraryRows, packageRows, articleRows] = await Promise.all([
    db
      .select({ activity: activities, hero: media })
      .from(activities)
      .leftJoin(media, eq(media.id, activities.heroImageId))
      .where(
        and(
          LIVE_ACTIVITY,
          or(
            matchesLocalized(activities.name, locale, needle),
            matchesLocalized(activities.area, locale, needle),
          ),
        ),
      )
      .orderBy(asc(localizedText(activities.name, locale, activities.slug)))
      .limit(perType),

    db
      .select({ place: mapPlaces, hero: media })
      .from(mapPlaces)
      .leftJoin(media, eq(media.id, mapPlaces.heroImageId))
      // Free places only. This endpoint is anonymous and shared, so returning a
      // locked place's name and photo here would undo the map's server-side
      // redaction for anyone who searches letter by letter. Paid places are
      // searchable through /api/places/search, which knows who is asking.
      .where(
        and(
          LIVE_PLACE,
          eq(mapPlaces.isFree, true),
          eq(mapPlaces.isHiddenGem, false),
          matchesLocalized(mapPlaces.name, locale, needle),
        ),
      )
      .orderBy(asc(localizedText(mapPlaces.name, locale, mapPlaces.slug)))
      .limit(perType),

    db
      .select({ itinerary: itineraries, hero: media })
      .from(itineraries)
      .leftJoin(media, eq(media.id, itineraries.heroImageId))
      .where(and(LIVE_ITINERARY, matchesLocalized(itineraries.name, locale, needle)))
      .orderBy(asc(itineraries.days))
      .limit(perType),

    db
      .select({ pkg: packages, hero: media })
      .from(packages)
      .leftJoin(media, eq(media.id, packages.heroImageId))
      .where(and(LIVE_PACKAGE, matchesLocalized(packages.name, locale, needle)))
      .orderBy(asc(packages.priceMinor))
      .limit(perType),

    db
      .select({ article: articles, hero: media })
      .from(articles)
      .leftJoin(media, eq(media.id, articles.heroImageId))
      .where(and(LIVE_ARTICLE, matchesLocalized(articles.title, locale, needle)))
      .orderBy(sql`${articles.publishedAt} desc nulls last`)
      .limit(perType),
  ])

  const hits: SearchHit[] = [
    ...activityRows.map(({ activity, hero }) => ({
      type: 'activity' as const,
      id: activity.id,
      slug: activity.slug,
      href: entityHref('activity', activity.slug),
      title: activity.name,
      subtitle: activity.area,
      days: null,
      hero: toMedia(hero),
    })),
    ...placeRows.map(({ place, hero }) => ({
      type: 'place' as const,
      id: place.id,
      slug: place.slug,
      href: entityHref('place', place.slug),
      title: place.name,
      subtitle: place.category,
      days: null,
      hero: toMedia(hero),
    })),
    ...itineraryRows.map(({ itinerary, hero }) => ({
      type: 'itinerary' as const,
      id: itinerary.id,
      slug: itinerary.slug,
      href: entityHref('itinerary', itinerary.slug),
      title: itinerary.name,
      subtitle: itinerary.blurb,
      days: itinerary.days,
      hero: toMedia(hero),
    })),
    ...packageRows.map(({ pkg, hero }) => ({
      type: 'package' as const,
      id: pkg.id,
      slug: pkg.slug,
      href: entityHref('package', pkg.slug),
      title: pkg.name,
      subtitle: pkg.blurb,
      days: pkg.days,
      hero: toMedia(hero),
    })),
    ...articleRows.map(({ article, hero }) => ({
      type: 'article' as const,
      id: article.id,
      slug: article.slug,
      href: entityHref('article', article.slug),
      title: article.title,
      subtitle: article.excerpt,
      days: null,
      hero: toMedia(hero),
    })),
  ]

  return hits.slice(0, perType)
}
