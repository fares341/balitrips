/**
 * Read-side queries for the trip, itinerary, events and exclusive-article
 * features. A sibling of `./queries.ts` (owned elsewhere), with the same rules:
 * only live rows, no implicit fallbacks, no request-scoped state.
 *
 * One rule is added on top: **every function that touches gated place or
 * article data takes the viewer's `EntitlementSet` and redacts before
 * returning.** Callers never hold an unredacted locked place, so they cannot
 * leak one into a Client Component or an RSC payload by accident. A locked
 * place comes back as `{ locked: true, requiredEntitlement }` — no id, no
 * slug, no name, no coordinates, no image.
 */

import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  activities,
  articleCategories,
  articles,
  categories,
  itineraries,
  mapPlaces,
  media,
  orderItems,
  orders,
  regions,
  tripItems,
  tripShares,
  users,
} from '@/db/schema'
import {
  canSeePlace,
  isEntitlementKind,
  placeAccess,
  type EntitlementKind,
  type EntitlementSet,
} from '@/lib/entitlements/redaction'

import type { LocalizedText } from './localize'
import { toMedia } from './queries'
import { entityHref, type ArticleSummary } from './types'

const PUBLISHED = 'published'

const LIVE_PLACE = and(
  eq(mapPlaces.status, PUBLISHED),
  isNull(mapPlaces.deletedAt),
  eq(mapPlaces.isHidden, false),
)
const LIVE_ARTICLE = and(eq(articles.status, PUBLISHED), isNull(articles.deletedAt))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The `categories.key` the map taxonomy and the activity chips use for events. */
export const EVENTS_CATEGORY_KEY = 'events'

// ---------------------------------------------------------------------------
// Place teasers — redacted per viewer
// ---------------------------------------------------------------------------

/** What a viewer who may see the place receives. */
export interface VisiblePlaceTeaser {
  locked: false
  id: string
  slug: string
  /** `/map?place=<slug>` — the place has no page of its own. */
  href: string
  name: LocalizedText
  heroImageUrl: string | null
  regionLabel: LocalizedText | null
  categoryLabel: LocalizedText | null
  lat: number
  lon: number
  isFree: boolean
}

/** What everyone else receives. Deliberately carries no identifier at all. */
export interface LockedPlaceTeaser {
  locked: true
  requiredEntitlement: EntitlementKind
}

export type PlaceTeaser = VisiblePlaceTeaser | LockedPlaceTeaser

const teaserColumns = {
  place: {
    id: mapPlaces.id,
    slug: mapPlaces.slug,
    name: mapPlaces.name,
    lat: mapPlaces.lat,
    lon: mapPlaces.lon,
    isFree: mapPlaces.isFree,
    requiredEntitlement: mapPlaces.requiredEntitlement,
    isHiddenGem: mapPlaces.isHiddenGem,
  },
  hero: media,
  regionLabel: regions.label,
  categoryLabel: categories.label,
}

type TeaserRow = {
  place: {
    id: string
    slug: string
    name: LocalizedText
    lat: number
    lon: number
    isFree: boolean
    requiredEntitlement: string
    isHiddenGem: boolean
  }
  hero: typeof media.$inferSelect | null
  regionLabel: LocalizedText | null
  categoryLabel: LocalizedText | null
}

/** The single redaction point for every teaser this module returns. */
function toTeaser(row: TeaserRow, held: EntitlementSet): PlaceTeaser {
  const access = placeAccess(row.place)
  if (!canSeePlace(row.place, held)) {
    return { locked: true, requiredEntitlement: access.requiredEntitlement }
  }
  return {
    locked: false,
    id: row.place.id,
    slug: row.place.slug,
    href: entityHref('place', row.place.slug),
    name: row.place.name,
    heroImageUrl: toMedia(row.hero)?.url ?? null,
    regionLabel: row.regionLabel,
    categoryLabel: row.categoryLabel,
    lat: row.place.lat,
    lon: row.place.lon,
    isFree: access.isFree,
  }
}

function teaserQuery() {
  return db
    .select(teaserColumns)
    .from(mapPlaces)
    .leftJoin(media, eq(media.id, mapPlaces.heroImageId))
    .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
    .leftJoin(categories, eq(categories.id, mapPlaces.categoryId))
}

/**
 * Places by id, in the order given, redacted for `held`.
 *
 * Unknown, unpublished, hidden and deleted places are dropped rather than
 * shown as locked: a place the admin withdrew is not an upsell.
 */
export async function placeTeasersByIds(
  ids: readonly string[],
  held: EntitlementSet,
): Promise<PlaceTeaser[]> {
  const wanted = [...new Set(ids.filter((id) => typeof id === 'string' && UUID.test(id)))]
  if (wanted.length === 0) return []

  const rows = await teaserQuery().where(and(LIVE_PLACE, inArray(mapPlaces.id, wanted)))
  const byId = new Map(rows.map((row) => [row.place.id, row]))

  return wanted.flatMap((id) => {
    const row = byId.get(id)
    return row === undefined ? [] : [toTeaser(row, held)]
  })
}

/**
 * The places an itinerary links to (`itineraries.linked_place_ids`, spec 4.2).
 * Only for a live itinerary — a draft's links are not public.
 */
export async function linkedPlacesForItinerary(
  itineraryId: string,
  held: EntitlementSet,
): Promise<PlaceTeaser[]> {
  if (!UUID.test(itineraryId)) return []
  const [row] = await db
    .select({ linked: itineraries.linkedPlaceIds })
    .from(itineraries)
    .where(
      and(
        eq(itineraries.id, itineraryId),
        eq(itineraries.status, PUBLISHED),
        isNull(itineraries.deletedAt),
      ),
    )
    .limit(1)
  const linked = row?.linked
  const ids = Array.isArray(linked) ? linked : []
  return placeTeasersByIds(ids, held)
}

/** A visible event place plus its optional dates (`event_starts_at` / `event_ends_at`). */
export type VisibleEventPlace = VisiblePlaceTeaser & {
  startsAt: Date | null
  endsAt: Date | null
}

/**
 * An event is over when its end has passed, or — with no end set — when it
 * started more than a day ago. Undated rows are permanent and never "over".
 * Shared by the places query (SQL) and the events page (activities, in JS).
 */
export const EVENT_GRACE_MS = 24 * 60 * 60 * 1000

export function isEventOver(
  startsAt: Date | null,
  endsAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (endsAt !== null) return endsAt.getTime() < now.getTime()
  if (startsAt !== null) return startsAt.getTime() < now.getTime() - EVENT_GRACE_MS
  return false
}

/** Dated first, soonest start first; undated after, in their existing order. */
export function compareEventDates(
  a: { startsAt: Date | null },
  b: { startsAt: Date | null },
): number {
  if (a.startsAt === null || b.startsAt === null) {
    return a.startsAt === b.startsAt ? 0 : a.startsAt === null ? 1 : -1
  }
  return a.startsAt.getTime() - b.startsAt.getTime()
}

/**
 * Map places in the `events` category (main category or a sub-category).
 *
 * Returns the visible ones in full and only a COUNT of the locked ones — the
 * events page shows "N more events with a plan", never a list of locked rows.
 * Ended events are dropped (see `isEventOver`); dated ones come first, by
 * start date, then the undated ones by admin priority.
 */
export async function eventPlacesForViewer(
  held: EntitlementSet,
): Promise<{ visible: VisibleEventPlace[]; lockedCount: number }> {
  const [events] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.key, EVENTS_CATEGORY_KEY), eq(categories.status, 'active')))
    .limit(1)
  if (events === undefined) return { visible: [], lockedCount: 0 }

  const rows = await db
    .select({
      ...teaserColumns,
      event: { startsAt: mapPlaces.eventStartsAt, endsAt: mapPlaces.eventEndsAt },
    })
    .from(mapPlaces)
    .leftJoin(media, eq(media.id, mapPlaces.heroImageId))
    .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
    .leftJoin(categories, eq(categories.id, mapPlaces.categoryId))
    .where(
      and(
        LIVE_PLACE,
        sql`(${mapPlaces.categoryId} = ${events.id} or ${mapPlaces.subCategoryIds} @> ${JSON.stringify([events.id])}::jsonb)`,
        sql`not coalesce(${mapPlaces.eventEndsAt} < now(), ${mapPlaces.eventStartsAt} < now() - interval '1 day', false)`,
      ),
    )
    .orderBy(
      sql`${mapPlaces.eventStartsAt} asc nulls last`,
      desc(mapPlaces.priority),
      asc(mapPlaces.sortOrder),
      asc(mapPlaces.slug),
    )

  const visible: VisibleEventPlace[] = []
  let lockedCount = 0
  for (const row of rows) {
    const teaser = toTeaser(row, held)
    if (teaser.locked) lockedCount += 1
    else visible.push({ ...teaser, startsAt: row.event.startsAt, endsAt: row.event.endsAt })
  }
  return { visible, lockedCount }
}

/**
 * Event dates of the given activities (`activities.event_starts_at/ends_at`).
 * The activity list DTO is shared and does not carry them; the events page
 * joins them in here to sort, hide ended events and print the date.
 */
export async function activityEventDates(
  ids: readonly string[],
): Promise<Map<string, { startsAt: Date | null; endsAt: Date | null }>> {
  const wanted = [...new Set(ids.filter((id) => UUID.test(id)))]
  if (wanted.length === 0) return new Map()
  const rows = await db
    .select({
      id: activities.id,
      startsAt: activities.eventStartsAt,
      endsAt: activities.eventEndsAt,
    })
    .from(activities)
    .where(inArray(activities.id, wanted))
  return new Map(rows.map((row) => [row.id, { startsAt: row.startsAt, endsAt: row.endsAt }]))
}

// ---------------------------------------------------------------------------
// Trip items ("Places I plan to visit")
// ---------------------------------------------------------------------------

export interface TripItemForViewer {
  /** `trip_items.id` — for the owner's own controls. Never render it publicly. */
  itemId: string
  dayNumber: number | null
  place: PlaceTeaser
}

/**
 * One user's planned places, in display order (day, then position), with each
 * place redacted for `held` — the OWNER's entitlements on their own pages, the
 * VIEWER's on a shared link.
 */
export async function tripItemsForViewer(
  ownerId: string,
  held: EntitlementSet,
): Promise<TripItemForViewer[]> {
  const rows = await db
    .select({ itemId: tripItems.id, dayNumber: tripItems.dayNumber, ...teaserColumns })
    .from(tripItems)
    .innerJoin(mapPlaces, eq(mapPlaces.id, tripItems.placeId))
    .leftJoin(media, eq(media.id, mapPlaces.heroImageId))
    .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
    .leftJoin(categories, eq(categories.id, mapPlaces.categoryId))
    .where(and(eq(tripItems.userId, ownerId), LIVE_PLACE))
    .orderBy(
      sql`${tripItems.dayNumber} asc nulls last`,
      asc(tripItems.position),
      asc(tripItems.createdAt),
    )

  return rows.map((row) => ({
    itemId: row.itemId,
    dayNumber: row.dayNumber,
    place: toTeaser(row, held),
  }))
}

// ---------------------------------------------------------------------------
// Trip shares
// ---------------------------------------------------------------------------

/** 32 random bytes, base64url: 43 characters from [A-Za-z0-9_-]. */
const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/

export function isShareTokenShape(token: string): boolean {
  return SHARE_TOKEN.test(token)
}

/** The owner's live share token, or null. */
export async function activeShareToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ token: tripShares.token })
    .from(tripShares)
    .where(and(eq(tripShares.userId, userId), isNull(tripShares.revokedAt)))
    .limit(1)
  return row?.token ?? null
}

/**
 * First name only, and only when it is plausibly a name. The owner's email is
 * never selected here, so it cannot reach the public page.
 */
function firstNameOf(name: string | null): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? ''
  if (first === '' || first.includes('@')) return null
  return first.slice(0, 40)
}

export interface SharedTrip {
  ownerFirstName: string | null
  items: { dayNumber: number | null; place: PlaceTeaser }[]
}

/**
 * The trip behind a public share link, redacted for the VIEWER (not the owner:
 * sharing must not become a way to hand paid places to someone who has not
 * paid). Null for a malformed, unknown or revoked token, or a deleted or
 * banned owner.
 */
export async function sharedTripForViewer(
  token: string,
  held: EntitlementSet,
): Promise<SharedTrip | null> {
  if (!isShareTokenShape(token)) return null

  const [share] = await db
    .select({ userId: tripShares.userId, name: users.name })
    .from(tripShares)
    .innerJoin(users, eq(users.id, tripShares.userId))
    .where(
      and(
        eq(tripShares.token, token),
        isNull(tripShares.revokedAt),
        isNull(users.deletedAt),
        ne(users.status, 'banned'),
      ),
    )
    .limit(1)
  if (share === undefined) return null

  const items = await tripItemsForViewer(share.userId, held)
  return {
    ownerFirstName: firstNameOf(share.name),
    // `itemId` is dropped: the public page has no use for it.
    items: items.map((item) => ({ dayNumber: item.dayNumber, place: item.place })),
  }
}

// ---------------------------------------------------------------------------
// Exclusive articles (spec 2.3/2.4)
// ---------------------------------------------------------------------------

/**
 * Who may read an article's body. Null = everyone. An unknown stored value is
 * treated as `vip` — closed is the safe direction to fail.
 */
export function articleRequirement(value: string | null): EntitlementKind | null {
  if (value === null || value === '') return null
  return isEntitlementKind(value) ? value : 'vip'
}

export function canReadArticle(requirement: EntitlementKind | null, held: EntitlementSet): boolean {
  return requirement === null || held.has(requirement)
}

/** Access requirement per article id, for the lock badge on lists. */
export async function articleRequirementsByIds(
  ids: readonly string[],
): Promise<Map<string, EntitlementKind>> {
  const wanted = [...new Set(ids.filter((id) => UUID.test(id)))]
  if (wanted.length === 0) return new Map()
  const rows = await db
    .select({ id: articles.id, required: articles.requiredEntitlement })
    .from(articles)
    .where(inArray(articles.id, wanted))
  const out = new Map<string, EntitlementKind>()
  for (const row of rows) {
    const requirement = articleRequirement(row.required)
    if (requirement !== null) out.set(row.id, requirement)
  }
  return out
}

export interface ArticleHead extends ArticleSummary {
  requiredEntitlement: EntitlementKind | null
}

/**
 * An article's public face — title, excerpt, hero, category — WITHOUT the
 * body. Safe for `generateMetadata`, related rails and anything cached.
 */
export async function getArticleHead(slug: string): Promise<ArticleHead | null> {
  const [row] = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      bridge: articles.bridge,
      publishedAt: articles.publishedAt,
      required: articles.requiredEntitlement,
      category: articleCategories,
      hero: media,
    })
    .from(articles)
    .leftJoin(articleCategories, eq(articleCategories.id, articles.categoryId))
    .leftJoin(media, eq(media.id, articles.heroImageId))
    .where(and(LIVE_ARTICLE, eq(articles.slug, slug)))
    .limit(1)
  if (row === undefined) return null

  return {
    id: row.id,
    slug: row.slug,
    href: entityHref('article', row.slug),
    title: row.title,
    excerpt: row.excerpt,
    category:
      row.category === null
        ? null
        : {
            id: row.category.id,
            key: row.category.key,
            label: row.category.label,
            sortOrder: row.category.sortOrder,
          },
    bridge: row.bridge,
    publishedAt: row.publishedAt === null ? null : row.publishedAt.toISOString(),
    hero: toMedia(row.hero),
    requiredEntitlement: articleRequirement(row.required),
  }
}

/**
 * The body, only for a viewer entitled to it. The entitlement is re-checked
 * against the stored row here (not trusted from the caller's head), so a
 * stale head cannot unlock an article that was made exclusive since.
 * Returns `{ locked: true }` and never selects the body otherwise.
 */
export async function getArticleBodyForViewer(
  articleId: string,
  held: EntitlementSet,
): Promise<{ locked: true } | { locked: false; body: LocalizedText | null }> {
  if (!UUID.test(articleId)) return { locked: true }
  const [gate] = await db
    .select({ required: articles.requiredEntitlement })
    .from(articles)
    .where(and(LIVE_ARTICLE, eq(articles.id, articleId)))
    .limit(1)
  if (gate === undefined) return { locked: true }
  if (!canReadArticle(articleRequirement(gate.required), held)) return { locked: true }

  const [row] = await db
    .select({ body: articles.body })
    .from(articles)
    .where(and(LIVE_ARTICLE, eq(articles.id, articleId)))
    .limit(1)
  return { locked: false, body: row?.body ?? null }
}

// ---------------------------------------------------------------------------
// Itinerary ownership — who may see the full day-by-day plan
// ---------------------------------------------------------------------------

/**
 * Order states in which a bought itinerary is the customer's. Same set as the
 * account's "My schedules" (`SETTLED` in account/_lib/queries.ts).
 */
const SETTLED_ORDER = ['paid', 'confirmed', 'partially_refunded'] as const

/**
 * Has this user paid for this itinerary (a settled order, line not refunded or
 * cancelled)? The detail page shows the full day plan only when this is true
 * (or to staff) — everyone else gets day 1 and the remaining days' titles.
 */
export async function ownsItinerary(userId: string, itineraryId: string): Promise<boolean> {
  if (!UUID.test(userId) || !UUID.test(itineraryId)) return false
  const [row] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orderItems.kind, 'itinerary'),
        eq(orderItems.refId, itineraryId),
        inArray(orders.status, [...SETTLED_ORDER]),
        sql`${orderItems.fulfilmentStatus} not in ('refunded', 'cancelled')`,
      ),
    )
    .limit(1)
  return row !== undefined
}
