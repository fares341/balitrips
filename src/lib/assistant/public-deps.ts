/**
 * The real data behind the website assistant's tools: thin adapters over the
 * site's existing query and domain functions. Server only.
 */

import { and, asc, eq, inArray } from 'drizzle-orm'

import { readSetting } from '@/app/(admin)/_lib/settings'
import { listInvoices } from '@/app/[locale]/account/_lib/queries'
import { FAQ_GROUPS } from '@/app/[locale]/faq/groups'
import { CONTACT_EMAIL, WHATSAPP_DISPLAY } from '@/components/layout/contact-config'
import { db } from '@/db'
import { orderItems, orders } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { getCartWithTotals } from '@/lib/cart'
import { loadCartCatalog } from '@/lib/cart/catalog'
import {
  getActivityBySlug,
  getItineraryBySlug,
  getPackageBySlug,
  listActivities,
  listCategories,
  listDriverVehicles,
  listItineraries,
  listMapPlaces,
  listPackages,
  listRegions,
  search,
} from '@/lib/content/queries'
import { emptyEntitlements } from '@/lib/entitlements'
import { buildQuote, type QuoteRequestItem } from '@/lib/pricing/quote'
import { searchPlaces } from '@/lib/search/places'

import type { BookingDraft, OrderView, PublicDeps, QuoteOutcome } from './public-tools'
import { createAction } from './store'

const nullable = (value: string | null | undefined) =>
  value === undefined || value === null || value === '' ? null : value

/**
 * A read-only price for one activity booking: the same draft lines and the
 * same `loadCartCatalog` → `buildQuote` path as `addActivityBooking` (the
 * booking box), without writing anything.
 */
export async function quoteActivityBooking(draft: BookingDraft): Promise<QuoteOutcome> {
  const kind = draft.packageId === null ? 'activity' : 'activity_tier'
  const refId = draft.packageId ?? draft.activityId
  const addons = [...draft.addons]
    .map((a) => ({ id: a.id, qty: a.qty }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const lines = (endDate: string | null): QuoteRequestItem[] => {
    const main: QuoteRequestItem = {
      id: 'booking',
      kind,
      refId,
      quantity: draft.people,
      travelDate: nullable(draft.date),
      travelTime: nullable(draft.time),
      guests: draft.people,
      endDate,
      parentItemId: null,
      options: { addons },
    }
    if (!draft.driver) return [main]
    return [
      main,
      {
        id: 'driver',
        kind: 'driver',
        refId: null,
        quantity: 1,
        travelDate: nullable(draft.date),
        travelTime: null,
        guests: draft.people,
        endDate: endDate ?? nullable(draft.date),
        parentItemId: 'booking',
      },
    ]
  }

  const fail = (code: string): QuoteOutcome => ({
    ok: false,
    totalMinor: 0,
    currency: '',
    issues: [{ code }],
    lines: [],
  })

  const probe = await loadCartCatalog(lines(null), emptyEntitlements())
  const parent =
    kind === 'activity_tier'
      ? probe.snapshot.activityTiers.get(refId)?.activityId
      : probe.snapshot.activities.has(refId)
        ? refId
        : undefined
  if (parent !== draft.activityId) return fail('unknown_item')
  const multiDay = probe.snapshot.activities.get(draft.activityId)?.multiDay === true
  const endDate = multiDay ? nullable(draft.endDate) : null

  const quote = buildQuote(lines(endDate), probe.snapshot)
  if (!quote.ok) {
    return {
      ok: false,
      totalMinor: 0,
      currency: quote.currency,
      issues: quote.issues.map((issue) => ({
        code: issue.code,
        driver: issue.itemId === 'driver',
      })),
      lines: [],
    }
  }
  const out: QuoteOutcome['lines'] = []
  for (const line of quote.lines) {
    if (line.breakdown && line.breakdown.length > 0) {
      for (const part of line.breakdown) {
        out.push({
          kind: part.kind,
          refId: part.refId,
          totalMinor: part.totalMinor,
          currency: line.currency,
          quantity: part.quantity,
          included: part.included,
        })
      }
    } else {
      out.push({
        kind: line.kind === 'driver' ? 'driver' : 'package',
        refId: line.refId,
        totalMinor: line.lineTotalMinor,
        currency: line.currency,
        quantity: line.quantity,
      })
    }
  }
  return {
    ok: true,
    totalMinor: quote.totalMinor,
    currency: quote.currency,
    issues: [],
    lines: out,
  }
}

/** The caller's own orders, with each line's booking status. */
async function ordersOf(userId: string): Promise<OrderView[]> {
  const invoices = await listInvoices(userId)
  const recent = invoices.slice(0, 10)
  if (recent.length === 0) return []
  const items = await db
    .select({
      orderId: orderItems.orderId,
      name: orderItems.nameSnapshot,
      kind: orderItems.kind,
      bookingStatus: orderItems.bookingStatus,
      travelDate: orderItems.travelDate,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        // Scoped twice: the ids come from this user's invoices AND the join
        // re-checks the owner, so a bug upstream cannot widen it.
        eq(orders.userId, userId),
        inArray(
          orderItems.orderId,
          recent.map((invoice) => invoice.id),
        ),
      ),
    )
    .orderBy(asc(orderItems.createdAt))
  return recent.map((invoice) => ({
    orderNumber: invoice.orderNumber,
    date: invoice.date.toISOString().slice(0, 10),
    status: invoice.status,
    totalMinor: invoice.totalMinor,
    currency: invoice.currency,
    items: items
      .filter((item) => item.orderId === invoice.id)
      .map((item) => ({
        name: item.name,
        kind: item.kind,
        bookingStatus: item.bookingStatus,
        travelDate: item.travelDate,
      })),
  }))
}

const MESSAGES: Record<Locale, () => Promise<Record<string, string>>> = {
  en: async () => (await import('../../../messages/en.json')).default as Record<string, string>,
  ar: async () => (await import('../../../messages/ar.json')).default as Record<string, string>,
  id: async () => (await import('../../../messages/id.json')).default as Record<string, string>,
}

export const publicDeps: PublicDeps = {
  search: (q, locale) => search(q, locale, 6),
  listActivities: (options) =>
    listActivities({
      categoryKey: options.categoryKey ?? null,
      sort: options.sort ?? null,
      limit: options.limit,
      locale: options.locale,
    }),
  getActivity: (slug) => getActivityBySlug(slug),
  listPackages: () => listPackages(),
  getPackage: (slug) => getPackageBySlug(slug),
  listItineraries: () => listItineraries(),
  getItinerary: (slug) => getItineraryBySlug(slug),
  taxonomy: async () => {
    const [regions, categories] = await Promise.all([
      listRegions({ includeAreas: true }),
      listCategories(),
    ])
    return { regions, categories }
  },
  searchPlaces: (input, held, locale) => searchPlaces(input, held, locale),
  findPlace: async (slug) => (await listMapPlaces()).find((place) => place.slug === slug) ?? null,
  drivers: () => listDriverVehicles(),
  policy: (id) => readSetting(`policy.${id}`),
  contact: async () => ({ whatsapp: WHATSAPP_DISPLAY, email: CONTACT_EMAIL }),
  messages: (locale) => MESSAGES[locale](),
  faqKeys: () => FAQ_GROUPS,
  quote: quoteActivityBooking,
  myTrip: async () => {
    const cart = await getCartWithTotals()
    if (cart === null) return null
    return {
      itemCount: cart.itemCount,
      totalMinor: cart.totalMinor,
      currency: cart.currency,
      ok: cart.ok,
      lines: cart.groups.flatMap((group) =>
        group.lines.map((line) => ({
          name: line.name,
          kind: line.kind,
          travelDate: line.travelDate,
          travelTime: line.travelTime,
          guests: line.guests,
          lineTotalMinor: line.lineTotalMinor,
          currency: line.currency,
          issue: line.issue?.code ?? null,
        })),
      ),
    }
  },
  myOrders: ordersOf,
  createAction: (input) => createAction(input),
}
