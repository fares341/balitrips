/**
 * «فعاليات جدولي» — the buyer-only page's data (itineraries phase 3, spec §2.4).
 *
 * Read only after `buyerAccess()` said 'ok' (owner of a settled purchase, or
 * staff previewing). Unlike the public DTO, this is the bought content: day
 * titles and the activities linked to the days. Prices are never computed in
 * the browser: `quoteBuyerSelection` runs the cart's own `buildQuote` and the
 * same `cartBundleDiscounts` the cart and checkout use.
 *
 * Server-only.
 */

import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  activities,
  activityTiers,
  itineraries,
  itineraryDays,
  media,
  orderItems,
  orders,
} from '@/db/schema'
import { toMedia } from '@/lib/content/queries'
import type { LocalizedText } from '@/lib/content/localize'
import { loadCartCatalog } from '@/lib/cart/catalog'
import { loadEntitlements } from '@/lib/entitlements'
import { buildQuote, type QuoteRequestItem } from '@/lib/pricing/quote'

import { bundleLinesOf, bundleRuleFor, linkedBookableActivities } from './bundle-server'
import { cartBundleDiscounts, dayDate } from './bundle'
import { percentOffMinor } from './savings'

export interface BuyerImage {
  url: string
  srcSetAvif?: string | null
  srcSetWebp?: string | null
}

export interface BuyerPackage {
  id: string
  name: LocalizedText
  priceMinor: number
  childPriceMinor: number | null
  perGroup: boolean
}

export interface BuyerActivity {
  activityId: string
  slug: string
  dayNumber: number
  name: LocalizedText
  blurb: LocalizedText | null
  duration: LocalizedText | null
  image: BuyerImage | null
  timeSlots: string[]
  priceMinor: number
  packages: BuyerPackage[]
  minGuests: number
  maxGuests: number
}

export interface BuyerDay {
  dayNumber: number
  title: LocalizedText | null
  mood: LocalizedText | null
  isFreeDay: boolean
  image: BuyerImage | null
}

export interface BuyerItinerary {
  id: string
  slug: string
  name: LocalizedText
  blurb: LocalizedText | null
  days: number
  hero: BuyerImage | null
  dayRows: BuyerDay[]
  activities: BuyerActivity[]
  pct: number
  /** The viewer may get the discount now (owner, uses left). */
  eligible: boolean
  usesLeft: number
  /** The buyer's order line for the PDF download. Null for a staff preview. */
  orderItemId: string | null
}

export async function findItineraryIdBySlug(slug: string): Promise<string | null> {
  if (!/^[a-z0-9-]{1,128}$/.test(slug)) return null
  const [row] = await db
    .select({ id: itineraries.id })
    .from(itineraries)
    .where(and(eq(itineraries.slug, slug), isNull(itineraries.deletedAt)))
    .limit(1)
  return row?.id ?? null
}

async function images(ids: readonly (string | null)[]): Promise<Map<string, BuyerImage>> {
  const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string'))]
  const out = new Map<string, BuyerImage>()
  if (wanted.length === 0) return out
  const rows = await db.select().from(media).where(inArray(media.id, wanted))
  for (const row of rows) {
    const dto = toMedia(row)
    if (dto)
      out.set(row.id, { url: dto.url, srcSetAvif: dto.srcSetAvif, srcSetWebp: dto.srcSetWebp })
  }
  return out
}

/** The newest settled, non-refunded order line of this itinerary for this user. */
async function buyerOrderItem(userId: string, itineraryId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orderItems.kind, 'itinerary'),
        eq(orderItems.refId, itineraryId),
        inArray(orders.status, ['paid', 'confirmed', 'partially_refunded']),
        sql`${orderItems.fulfilmentStatus} not in ('refunded', 'cancelled')`,
      ),
    )
    .orderBy(desc(orders.placedAt))
    .limit(1)
  return row?.id ?? null
}

export async function loadBuyerItinerary(
  itineraryId: string,
  userId: string,
): Promise<BuyerItinerary | null> {
  const [row] = await db
    .select({
      id: itineraries.id,
      slug: itineraries.slug,
      name: itineraries.name,
      blurb: itineraries.blurb,
      days: itineraries.days,
      heroImageId: itineraries.heroImageId,
    })
    .from(itineraries)
    .where(and(eq(itineraries.id, itineraryId), isNull(itineraries.deletedAt)))
    .limit(1)
  if (!row) return null

  const dayRows = await db
    .select({
      dayNumber: itineraryDays.dayNumber,
      title: itineraryDays.title,
      mood: itineraryDays.teaserMood,
      isFreeDay: itineraryDays.isFreeDay,
      imageId: itineraryDays.teaserImageId,
    })
    .from(itineraryDays)
    .where(eq(itineraryDays.itineraryId, itineraryId))
    .orderBy(asc(itineraryDays.dayNumber))

  const linked = await linkedBookableActivities(itineraryId)
  const ids = linked.map((one) => one.activityId)
  const actRows =
    ids.length === 0
      ? []
      : await db
          .select({
            id: activities.id,
            slug: activities.slug,
            name: activities.name,
            short: activities.shortDescription,
            description: activities.description,
            duration: activities.duration,
            heroImageId: activities.heroImageId,
            timeSlots: activities.timeSlots,
            priceMinor: activities.priceMinor,
            minGuests: activities.minGuests,
            maxGuests: activities.maxGuests,
          })
          .from(activities)
          .where(inArray(activities.id, ids))
  const tierRows =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(activityTiers)
          .where(inArray(activityTiers.activityId, ids))
          .orderBy(asc(activityTiers.priceMinor))

  const pics = await images([
    row.heroImageId,
    ...dayRows.map((day) => day.imageId),
    ...actRows.map((act) => act.heroImageId),
  ])
  const rule = await bundleRuleFor(itineraryId, userId)

  const acts: BuyerActivity[] = linked.flatMap(({ activityId, dayNumber }) => {
    const act = actRows.find((one) => one.id === activityId)
    if (!act) return []
    const tiers = tierRows.filter((tier) => tier.activityId === activityId && tier.available)
    return [
      {
        activityId,
        slug: act.slug,
        dayNumber,
        name: act.name,
        blurb: act.short ?? act.description ?? null,
        duration: act.duration ?? null,
        image: act.heroImageId ? (pics.get(act.heroImageId) ?? null) : null,
        timeSlots: (act.timeSlots ?? []).filter((slot) => /^\d{2}:\d{2}$/.test(slot)),
        priceMinor: act.priceMinor,
        packages: tiers.map((tier) => ({
          id: tier.id,
          name: tier.name,
          priceMinor: tier.priceMinor,
          childPriceMinor: tier.childPriceMinor ?? null,
          perGroup: tier.pricingMode === 'per_group' || tier.pricingMode === 'flat',
        })),
        minGuests: act.minGuests,
        maxGuests: act.maxGuests,
      },
    ]
  })

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    blurb: row.blurb ?? null,
    days: row.days,
    hero: row.heroImageId ? (pics.get(row.heroImageId) ?? null) : null,
    dayRows: dayRows.map((day) => ({
      dayNumber: day.dayNumber,
      title: day.title ?? null,
      mood: day.mood ?? null,
      isFreeDay: day.isFreeDay,
      image: day.imageId ? (pics.get(day.imageId) ?? null) : null,
    })),
    activities: acts,
    pct: rule.pct,
    eligible: rule.eligible,
    usesLeft: rule.usesLeft,
    orderItemId: await buyerOrderItem(userId, itineraryId),
  }
}

// ---------------------------------------------------------------------------
// Selection quote — the same engine as the cart
// ---------------------------------------------------------------------------

export interface BuyerPick {
  activityId: string
  packageId: string | null
  time: string | null
}

export interface BuyerSelection {
  /** YYYY-MM-DD, Bali calendar. Null = not chosen yet (priced on a probe date). */
  arrival: string | null
  adults: number
  children: number
  picks: BuyerPick[]
}

export interface BuyerQuote {
  lines: {
    activityId: string
    date: string | null
    totalMinor: number | null
    issue: string | null
  }[]
  subtotalMinor: number
  /** Linked activities' total at the current party — what «كل الفعاليات» would cost. */
  allSubtotalMinor: number
  discountMinor: number
  /** What choosing every activity would save now (for «أضف الباقي ووفّر X»). */
  allDiscountMinor: number
  totalMinor: number
  complete: boolean
  missing: number
  ok: boolean
}

export const MAX_PARTY = 20

/** A probe arrival for pricing before the buyer picks dates: 30 days ahead. */
function probeArrival(now: Date): string {
  const d = new Date(now.getTime() + 30 * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** Validate a client selection against the itinerary's own linked activities. */
export function cleanSelection(raw: unknown, itinerary: BuyerItinerary): BuyerSelection {
  const input = (raw ?? {}) as Partial<BuyerSelection>
  const int = (value: unknown, min: number, max: number, fallback: number) => {
    const n = Number(value)
    return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback
  }
  const arrival =
    typeof input.arrival === 'string' && dayDate(input.arrival, 1) !== null ? input.arrival : null
  const picks: BuyerPick[] = []
  for (const pick of Array.isArray(input.picks) ? input.picks.slice(0, 40) : []) {
    const act = itinerary.activities.find((one) => one.activityId === pick?.activityId)
    if (!act || picks.some((one) => one.activityId === act.activityId)) continue
    const packageId =
      typeof pick.packageId === 'string' && act.packages.some((p) => p.id === pick.packageId)
        ? pick.packageId
        : null
    const time =
      typeof pick.time === 'string' && act.timeSlots.includes(pick.time)
        ? pick.time
        : (act.timeSlots[0] ?? null)
    picks.push({ activityId: act.activityId, packageId, time })
  }
  return {
    arrival,
    adults: int(input.adults, 1, MAX_PARTY, 2),
    children: int(input.children, 0, MAX_PARTY, 0),
    picks,
  }
}

function requestItems(
  itinerary: BuyerItinerary,
  selection: BuyerSelection,
  picks: readonly BuyerPick[],
  arrival: string,
): QuoteRequestItem[] {
  const people = selection.adults + selection.children
  return picks.map((pick) => {
    const act = itinerary.activities.find((one) => one.activityId === pick.activityId)
    return {
      id: pick.activityId,
      kind: pick.packageId === null ? 'activity' : 'activity_tier',
      refId: pick.packageId ?? pick.activityId,
      quantity: people,
      travelDate: dayDate(arrival, act?.dayNumber ?? 1),
      travelTime: pick.time,
      guests: people,
      endDate: null,
      parentItemId: null,
      options: {
        addons: [],
        ...(selection.children > 0 ? { children: selection.children } : {}),
        itineraryBundle: itinerary.id,
      },
    }
  })
}

/**
 * Price a selection exactly as the cart would: `buildQuote` on the catalogue
 * snapshot, then the bundle rule (owner-only). The browser shows this result.
 */
export async function quoteBuyerSelection(
  itinerary: BuyerItinerary,
  selection: BuyerSelection,
  userId: string,
  now: Date = new Date(),
): Promise<BuyerQuote> {
  const arrival = selection.arrival ?? probeArrival(now)
  // Every linked activity, priced at the chosen package (or its first) — for «كل الفعاليات».
  const allPicks: BuyerPick[] = itinerary.activities.map(
    (act) =>
      selection.picks.find((pick) => pick.activityId === act.activityId) ?? {
        activityId: act.activityId,
        packageId: null,
        time: act.timeSlots[0] ?? null,
      },
  )
  const allItems = requestItems(itinerary, selection, allPicks, arrival)
  const catalog = await loadCartCatalog(allItems, await loadEntitlements(userId), userId)
  const allQuote = buildQuote(allItems, catalog.snapshot, now)
  const totals = new Map(allQuote.lines.map((line) => [line.itemId, line.lineTotalMinor]))
  const issues = new Map(allQuote.issues.map((issue) => [issue.itemId, issue.code]))

  const chosen = new Set(selection.picks.map((pick) => pick.activityId))
  const rule = await bundleRuleFor(itinerary.id, userId)
  const selItems = allItems.filter((item) => chosen.has(item.id))
  const selQuote = buildQuote(selItems, catalog.snapshot, now)
  const [discount] = cartBundleDiscounts(bundleLinesOf(selItems, selQuote, catalog.snapshot), [
    rule,
  ])
  const subtotalMinor = selQuote.lines.reduce((sum, line) => sum + line.lineTotalMinor, 0)
  const allSubtotalMinor = allQuote.lines.reduce((sum, line) => sum + line.lineTotalMinor, 0)
  const discountMinor = discount?.amountMinor ?? 0
  const missing = itinerary.activities.filter((act) => !chosen.has(act.activityId)).length

  return {
    lines: allPicks.map((pick) => {
      const act = itinerary.activities.find((one) => one.activityId === pick.activityId)
      return {
        activityId: pick.activityId,
        date: selection.arrival === null ? null : dayDate(arrival, act?.dayNumber ?? 1),
        totalMinor: totals.get(pick.activityId) ?? null,
        // Before dates are chosen, a probe date's issue is not the buyer's.
        issue: selection.arrival === null ? null : (issues.get(pick.activityId) ?? null),
      }
    }),
    subtotalMinor,
    allSubtotalMinor,
    discountMinor,
    allDiscountMinor: rule.eligible ? percentOffMinor(allSubtotalMinor, rule.pct) : 0,
    totalMinor: subtotalMinor - discountMinor,
    complete: missing === 0 && itinerary.activities.length > 0,
    missing,
    ok: selection.arrival !== null && selQuote.ok && selItems.length > 0,
  }
}
