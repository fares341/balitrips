/**
 * Everything the account area reads.
 *
 * The handoff hard-coded four arrays — `ACCT_FAVS`, `ACCT_TRIP`, `ACCT_SCHED`
 * and `ACCT_INV` — so every signed-in traveller saw the same four saved places,
 * the same three-day plan and the same three invoices, none of which had
 * anything to do with them. Every function here is scoped to one user id and
 * reads the tables that actually own the fact.
 *
 * Three rules hold throughout:
 *
 *  1. **Scoped by user id, in SQL.** Never "fetch then filter" — a missed
 *     filter in JavaScript is somebody else's invoice on screen.
 *  2. **Money stays in minor units.** Nothing here divides by 100; the pages
 *     format with `formatMoney`.
 *  3. **Purchased means paid.** The trip and the schedule list are built from
 *     orders that money actually arrived for, never from the cart. The handoff
 *     passed `tripItems={cart}` and presented an unpaid cart as a confirmed
 *     itinerary.
 *
 * Server-only: it opens a database connection and must never be imported from
 * a Client Component.
 */

import { and, desc, eq, inArray, isNull } from 'drizzle-orm'

import { db } from '@/db'
import {
  activities,
  categories,
  entitlements,
  favorites,
  itineraries,
  itineraryDocuments,
  mapPlaces,
  media,
  orderItems,
  orders,
  packages,
  regions,
} from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'
import { defaultLocale, locales, type Locale } from '@/i18n/config'
import { mediaUrl } from '@/lib/content/queries'
import { entityHref } from '@/lib/content/types'
import { canSeePlace, loadEntitlements } from '@/lib/entitlements'
import { ORDER_STATUSES, type OrderStatus } from '@/lib/orders/state'

const PUBLISHED = 'published'

/**
 * Statuses that mean the customer has paid for what is in the order.
 *
 * `partially_refunded` is included deliberately: some lines were refunded, the
 * rest were not, and the traveller is still going on them. Per-line state is
 * carried by `order_items.fulfilment_status`.
 */
const SETTLED: readonly OrderStatus[] = ['paid', 'confirmed', 'partially_refunded']

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value)
}

type MediaRow = { objectKey: string; alt: Localized | null; deletedAt: Date | null }

/** A soft-deleted image is no image, not a dead URL. */
function imageOf(row: MediaRow | null): { url: string | null; alt: Localized | null } {
  if (row === null || row.deletedAt !== null) return { url: null, alt: null }
  return { url: mediaUrl(row.objectKey), alt: row.alt }
}

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

/** "مطاعم · Seminyak" بكل لغة؛ ما ينقص يُترك. */
function joinLabels(...parts: (Localized | null | undefined)[]): Localized | null {
  const present = parts.filter((part): part is Localized => part !== null && part !== undefined)
  if (present.length === 0) return null
  const out = {} as Localized
  for (const locale of locales) {
    out[locale] = present
      .map((part) => part[locale] || part.en || '')
      .filter((value) => value !== '')
      .join(' · ')
  }
  return out
}

export const FAVORITE_KINDS = ['activity', 'place', 'itinerary', 'package'] as const
export type FavoriteKind = (typeof FAVORITE_KINDS)[number]

export function isFavoriteKind(value: string): value is FavoriteKind {
  return (FAVORITE_KINDS as readonly string[]).includes(value)
}

export interface FavoriteView {
  kind: FavoriteKind
  refId: string
  savedAt: Date
  /** Null when the row behind the favorite is gone, unpublished or redacted. */
  title: Localized | null
  subtitle: Localized | null
  href: string | null
  imageUrl: string | null
  imageAlt: Localized | null
  rating: number | null
  /**
   * False when the target can no longer be bought or opened. The card still
   * renders — otherwise the traveller has a favorite they cannot remove — but
   * only the remove control is offered.
   */
  available: boolean
}

/**
 * The user's saved places, resolved against the live catalogue.
 *
 * A locked map place is shown by name only to someone who actually holds the
 * entitlement, exactly as `loadCartCatalog` does. Otherwise a favorite row
 * would be a way to read the names the map deliberately redacts — including
 * after a refund revoked the entitlement that revealed them.
 */
export async function listFavorites(userId: string): Promise<FavoriteView[]> {
  const rows = await db
    .select()
    .from(favorites)
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt))

  if (rows.length === 0) return []

  const idsOf = (kind: FavoriteKind): string[] => {
    const ids = rows.filter((row) => row.kind === kind).map((row) => row.refId)
    return Array.from(new Set(ids))
  }

  const activityIds = idsOf('activity')
  const placeIds = idsOf('place')
  const itineraryIds = idsOf('itinerary')
  const packageIds = idsOf('package')

  const [activityRows, placeRows, itineraryRows, packageRows, held] = await Promise.all([
    activityIds.length === 0
      ? []
      : db
          .select({ row: activities, hero: media })
          .from(activities)
          .leftJoin(media, eq(media.id, activities.heroImageId))
          .where(
            and(
              inArray(activities.id, activityIds),
              eq(activities.status, PUBLISHED),
              isNull(activities.deletedAt),
            ),
          ),
    placeIds.length === 0
      ? []
      : db
          .select({
            row: mapPlaces,
            hero: media,
            categoryLabel: categories.label,
            regionLabel: regions.label,
          })
          .from(mapPlaces)
          .leftJoin(media, eq(media.id, mapPlaces.heroImageId))
          .leftJoin(categories, eq(categories.id, mapPlaces.categoryId))
          .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
          .where(
            and(
              inArray(mapPlaces.id, placeIds),
              eq(mapPlaces.status, PUBLISHED),
              isNull(mapPlaces.deletedAt),
              // مخفي من الإدارة = غير متاح، كما في الخريطة والبحث.
              eq(mapPlaces.isHidden, false),
            ),
          ),
    itineraryIds.length === 0
      ? []
      : db
          .select({ row: itineraries, hero: media })
          .from(itineraries)
          .leftJoin(media, eq(media.id, itineraries.heroImageId))
          .where(
            and(
              inArray(itineraries.id, itineraryIds),
              eq(itineraries.status, PUBLISHED),
              isNull(itineraries.deletedAt),
            ),
          ),
    packageIds.length === 0
      ? []
      : db
          .select({ row: packages, hero: media })
          .from(packages)
          .leftJoin(media, eq(media.id, packages.heroImageId))
          .where(
            and(
              inArray(packages.id, packageIds),
              eq(packages.status, PUBLISHED),
              isNull(packages.deletedAt),
            ),
          ),
    loadEntitlements(userId),
  ])

  const resolved = new Map<string, Omit<FavoriteView, 'kind' | 'refId' | 'savedAt'>>()

  for (const { row, hero } of activityRows) {
    const image = imageOf(hero)
    resolved.set(`activity:${row.id}`, {
      title: row.name,
      subtitle: row.area,
      href: entityHref('activity', row.slug),
      imageUrl: image.url,
      imageAlt: image.alt,
      rating: row.rating,
      available: true,
    })
  }

  for (const { row, hero, categoryLabel, regionLabel } of placeRows) {
    const visible = canSeePlace(row, held)
    const image = imageOf(hero)
    resolved.set(`place:${row.id}`, {
      title: visible ? row.name : null,
      // الوثيقة 11.2: التصنيف + المنطقة لكل مكان محفوظ.
      subtitle: visible ? joinLabels(categoryLabel ?? row.category, regionLabel) : null,
      href: visible ? entityHref('place', row.slug) : null,
      imageUrl: visible ? image.url : null,
      imageAlt: visible ? image.alt : null,
      rating: visible ? row.rating : null,
      available: visible,
    })
  }

  for (const { row, hero } of itineraryRows) {
    const image = imageOf(hero)
    resolved.set(`itinerary:${row.id}`, {
      title: row.name,
      subtitle: row.blurb,
      href: entityHref('itinerary', row.slug),
      imageUrl: image.url,
      imageAlt: image.alt,
      rating: null,
      available: true,
    })
  }

  for (const { row, hero } of packageRows) {
    const image = imageOf(hero)
    resolved.set(`package:${row.id}`, {
      title: row.name,
      subtitle: row.blurb,
      href: entityHref('package', row.slug),
      imageUrl: image.url,
      imageAlt: image.alt,
      rating: null,
      available: true,
    })
  }

  const out: FavoriteView[] = []
  for (const row of rows) {
    // A kind outside the four the schema comments describe cannot be resolved
    // to anything, so it is dropped rather than rendered as a blank card.
    if (!isFavoriteKind(row.kind)) continue

    const found = resolved.get(`${row.kind}:${row.refId}`)
    out.push({
      kind: row.kind,
      refId: row.refId,
      savedAt: row.createdAt,
      title: found?.title ?? null,
      subtitle: found?.subtitle ?? null,
      href: found?.href ?? null,
      imageUrl: found?.imageUrl ?? null,
      imageAlt: found?.imageAlt ?? null,
      rating: found?.rating ?? null,
      available: found?.available ?? false,
    })
  }

  return out
}

// ---------------------------------------------------------------------------
// My trip — CONFIRMED orders, never the cart
// ---------------------------------------------------------------------------

export interface TripItemView {
  id: string
  orderNumber: string
  kind: string
  name: Localized | null
  quantity: number
  guests: number | null
  travelDate: string | null
  travelTime: string | null
  endDate: string | null
  /** pending | confirmed | delivered | cancelled | refunded */
  fulfilmentStatus: string
}

export interface TripDayView {
  /** Plain `YYYY-MM-DD` in Bali time, or null for the undated bucket. */
  date: string | null
  items: TripItemView[]
}

/**
 * The traveller's booked itinerary, grouped into days.
 *
 * Dates are plain `DATE` strings and are grouped as strings on purpose: "12
 * August" means 12 August in Bali whether the reader is in Riyadh or New York,
 * and parsing them into `Date` here would reintroduce exactly the timezone
 * drift the column type exists to prevent.
 */
export async function listTripDays(userId: string): Promise<TripDayView[]> {
  const rows = await db
    .select({ item: orderItems, orderNumber: orders.orderNumber })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.userId, userId), inArray(orders.status, [...SETTLED])))
    .orderBy(desc(orders.placedAt))

  const byDate = new Map<string, TripItemView[]>()
  const undated: TripItemView[] = []

  for (const { item, orderNumber } of rows) {
    // A refunded or cancelled line is not part of the trip any more.
    if (item.fulfilmentStatus === 'cancelled' || item.fulfilmentStatus === 'refunded') continue

    const view: TripItemView = {
      id: item.id,
      orderNumber,
      kind: item.kind,
      name: item.nameSnapshot,
      quantity: item.quantity,
      guests: item.guests,
      travelDate: item.travelDate,
      travelTime: item.travelTime,
      endDate: item.endDate,
      fulfilmentStatus: item.fulfilmentStatus,
    }

    if (item.travelDate === null) {
      undated.push(view)
      continue
    }

    const bucket = byDate.get(item.travelDate)
    if (bucket === undefined) byDate.set(item.travelDate, [view])
    else bucket.push(view)
  }

  const days: TripDayView[] = Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => (a.travelTime ?? '').localeCompare(b.travelTime ?? '')),
    }))

  if (undated.length > 0) days.push({ date: null, items: undated })
  return days
}

// ---------------------------------------------------------------------------
// Schedules — purchased itineraries
// ---------------------------------------------------------------------------

export interface ScheduleView {
  /** `order_items.id`. This is what the download route authorises against. */
  orderItemId: string
  orderNumber: string
  itineraryId: string
  /** Null when the itinerary was unpublished after purchase. */
  slug: string | null
  /** The name the customer bought, frozen at purchase. */
  name: Localized | null
  days: number | null
  imageUrl: string | null
  imageAlt: Localized | null
  /** Version pinned by the order, so March's buyer redownloads March's plan. */
  version: number
  /** True when a generated PDF exists for that version in a usable locale. */
  documentReady: boolean
  purchasedAt: Date
}

/**
 * Itineraries this user has actually paid for.
 *
 * The handoff listed two hard-coded plans with a "Download PDF" button that
 * had no `onClick` — it could not have checked anything, because there was
 * nothing to check against.
 */
export async function listSchedules(userId: string, locale: Locale): Promise<ScheduleView[]> {
  const rows = await db
    .select({
      item: orderItems,
      orderNumber: orders.orderNumber,
      placedAt: orders.placedAt,
      createdAt: orders.createdAt,
      itinerary: itineraries,
      hero: media,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(itineraries, eq(itineraries.id, orderItems.refId))
    .leftJoin(media, eq(media.id, itineraries.heroImageId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orderItems.kind, 'itinerary'),
        inArray(orders.status, [...SETTLED]),
      ),
    )
    .orderBy(desc(orders.placedAt))

  // نفس شرط `resolveScheduleDocument`: سطر ملغى أو مسترد لا يُعرض بأزرار تعطي 404.
  const usable = rows.filter(
    ({ item }) =>
      item.refId !== null &&
      item.fulfilmentStatus !== 'refunded' &&
      item.fulfilmentStatus !== 'cancelled',
  )
  if (usable.length === 0) return []

  const itineraryIds = Array.from(
    new Set(usable.map(({ item }) => item.refId).filter((id): id is string => id !== null)),
  )

  const documents =
    itineraryIds.length === 0
      ? []
      : await db
          .select({
            itineraryId: itineraryDocuments.itineraryId,
            version: itineraryDocuments.version,
            locale: itineraryDocuments.locale,
          })
          .from(itineraryDocuments)
          .where(inArray(itineraryDocuments.itineraryId, itineraryIds))

  const documentKeys = new Set(
    documents.map((doc) => `${doc.itineraryId}:${doc.version}:${doc.locale}`),
  )

  return usable.map(({ item, orderNumber, placedAt, createdAt, itinerary, hero }) => {
    // refId is non-null for every row in `usable`; the assertion-free read
    // keeps noUncheckedIndexedAccess honest.
    const itineraryId = item.refId ?? ''
    const version = item.refVersion ?? itinerary?.version ?? 1
    const image = imageOf(hero)

    return {
      orderItemId: item.id,
      orderNumber,
      itineraryId,
      slug: itinerary?.slug ?? null,
      name: item.nameSnapshot,
      days: itinerary?.days ?? null,
      imageUrl: image.url,
      imageAlt: image.alt,
      version,
      // PDF رفعته الإدارة يُسلَّم قبل المولَّد (انظر resolveScheduleDocument).
      documentReady:
        Boolean(
          itinerary?.uploadedPdfKeys?.[locale] ?? itinerary?.uploadedPdfKeys?.[defaultLocale],
        ) ||
        documentKeys.has(`${itineraryId}:${version}:${locale}`) ||
        documentKeys.has(`${itineraryId}:${version}:${defaultLocale}`),
      purchasedAt: placedAt ?? createdAt,
    }
  })
}

/**
 * The object key of the PDF this user is entitled to download, or null.
 *
 * Deliberately one function rather than "check, then look up": the ownership
 * predicate and the document lookup travel together, so no caller can perform
 * the second without the first.
 */
export async function resolveScheduleDocument(
  userId: string,
  orderItemId: string,
  locale: Locale,
): Promise<ScheduleDocument | null | 'not-ready'> {
  const rows = await db
    .select({ item: orderItems, itinerary: itineraries, orderNumber: orders.orderNumber })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(itineraries, eq(itineraries.id, orderItems.refId))
    .where(
      and(
        eq(orderItems.id, orderItemId),
        eq(orders.userId, userId),
        eq(orderItems.kind, 'itinerary'),
        inArray(orders.status, [...SETTLED]),
      ),
    )
    .limit(1)

  const row = rows[0]
  // Unknown id, someone else's order, an unpaid order, or a line that is not
  // an itinerary at all. All four are "you may not have this".
  if (row === undefined || row.item.refId === null) return null
  if (row.item.fulfilmentStatus === 'refunded' || row.item.fulfilmentStatus === 'cancelled') {
    return null
  }

  const itineraryId = row.item.refId
  const version = row.item.refVersion ?? row.itinerary?.version ?? 1

  // ملف رفعه المدير لهذا الجدول (الوثيقة 4.2) يتقدّم على المولّد تلقائياً.
  const uploaded = row.itinerary?.uploadedPdfKeys ?? null
  const uploadedKey = uploaded?.[locale] ?? uploaded?.[defaultLocale] ?? null
  if (uploadedKey) {
    return {
      objectKey: uploadedKey,
      orderNumber: row.orderNumber,
      slug: row.itinerary?.slug ?? 'itinerary',
    }
  }

  const docs = await db
    .select({ objectKey: itineraryDocuments.objectKey, locale: itineraryDocuments.locale })
    .from(itineraryDocuments)
    .where(
      and(eq(itineraryDocuments.itineraryId, itineraryId), eq(itineraryDocuments.version, version)),
    )

  // The requested language, then English. A plan in the wrong language beats
  // a dead button for someone standing in an airport.
  const chosen =
    docs.find((doc) => doc.locale === locale) ?? docs.find((doc) => doc.locale === defaultLocale)

  // Entitled, but the publish step has not produced the file yet. Distinct
  // from "not yours", and the caller says so differently.
  if (chosen === undefined) return 'not-ready'

  return {
    objectKey: chosen.objectKey,
    orderNumber: row.orderNumber,
    slug: row.itinerary?.slug ?? 'itinerary',
  }
}

export interface ScheduleDocument {
  objectKey: string
  /** يُطبع في العلامة المائية لتتبع أي نسخة مسرّبة إلى طلبها. */
  orderNumber: string
  /** لاسم الملف عند التحميل. */
  slug: string
}

// ---------------------------------------------------------------------------
// Subscriptions — entitlements
// ---------------------------------------------------------------------------

export type SubscriptionStatus = 'active' | 'expired' | 'revoked'

export interface SubscriptionView {
  id: string
  /** 'map_access' | 'vip', or whatever else staff granted. */
  kind: string
  status: SubscriptionStatus
  startsAt: Date
  /** Null means lifetime — "yours for the whole trip". */
  expiresAt: Date | null
  orderNumber: string | null
}

/**
 * Every grant this user has ever held, live ones first.
 *
 * Revoked and expired rows are kept rather than filtered out: a refund is an
 * audit record, and a traveller who paid last month deserves to see why the
 * map stopped working instead of finding an empty list.
 */
export async function listSubscriptions(userId: string): Promise<SubscriptionView[]> {
  const rows = await db
    .select({ entitlement: entitlements, orderNumber: orders.orderNumber })
    .from(entitlements)
    .leftJoin(orders, eq(orders.id, entitlements.grantedByOrderId))
    .where(eq(entitlements.userId, userId))
    .orderBy(desc(entitlements.startsAt))

  const now = Date.now()

  const views = rows.map(({ entitlement, orderNumber }): SubscriptionView => {
    const expiresAt = entitlement.expiresAt
    const status: SubscriptionStatus =
      entitlement.revokedAt !== null
        ? 'revoked'
        : expiresAt !== null && expiresAt.getTime() <= now
          ? 'expired'
          : 'active'

    return {
      id: entitlement.id,
      kind: entitlement.kind,
      status,
      startsAt: entitlement.startsAt,
      expiresAt,
      // نسخة من باقة عائلية: رقم طلب صاحب الباقة ليس للفرد أن يراه.
      orderNumber: entitlement.sharedByUserId === null ? (orderNumber ?? null) : null,
    }
  })

  // Active first; the rest keep their start-date order.
  return views.sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export interface InvoiceView {
  id: string
  orderNumber: string
  /** `placedAt` when set, otherwise the row's creation time. */
  date: Date
  status: OrderStatus
  totalMinor: number
  currency: string
  itemCount: number
  /** First line's frozen name, for the "Item" column. */
  summary: Localized | null
}

export async function listInvoices(userId: string): Promise<InvoiceView[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.placedAt), desc(orders.createdAt))

  if (rows.length === 0) return []

  const lines = await db
    .select({
      orderId: orderItems.orderId,
      name: orderItems.nameSnapshot,
      createdAt: orderItems.createdAt,
    })
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(orderItems.createdAt)

  const counts = new Map<string, number>()
  const firstName = new Map<string, Localized>()
  for (const line of lines) {
    counts.set(line.orderId, (counts.get(line.orderId) ?? 0) + 1)
    if (!firstName.has(line.orderId)) firstName.set(line.orderId, line.name)
  }

  return rows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber,
    date: row.placedAt ?? row.createdAt,
    // `orders.status` is a varchar; a value outside the state machine degrades
    // to `pending`, which claims nothing.
    status: isOrderStatus(row.status) ? row.status : 'pending',
    totalMinor: row.totalMinor,
    currency: row.presentmentCurrency,
    itemCount: counts.get(row.id) ?? 0,
    summary: firstName.get(row.id) ?? null,
  }))
}
