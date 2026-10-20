/**
 * The data behind the Studio assistant's tools: the same tables and the same
 * shapes the Studio pages read, through drizzle. Server only.
 *
 * Authorization is NOT here — it is in staff-tools.ts, in front of every call.
 * These functions only read (or, for proposals, describe the current state).
 */

import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  sum,
  type SQL,
} from 'drizzle-orm'

import { readSettings } from '@/app/(admin)/_lib/settings'
import { db } from '@/db'
import {
  activities,
  articles,
  categories,
  contactMessages,
  customTripRequests,
  entitlements,
  itineraries,
  mapPlaces,
  orderItems,
  orders,
  packages,
  payments,
  regions,
  users,
} from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { listMapTaxonomy } from '@/lib/content/queries'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { boundingBox } from '@/lib/geo'
import { isInWater } from '@/lib/geo/water'
import { formatMoney } from '@/lib/money'

import { expandMapsLink } from './maps-link'
import { DUPLICATE_M, photonSearch, resolveLocation } from './place-location'
import type { ContentType, Range, StaffDeps, StaffOrderRow } from './staff-tools'
import { createAction } from './store'

const BALI_OFFSET_MS = 8 * 60 * 60 * 1000
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)

/** Start of the range, at Bali midnight; null for "all". */
export function rangeStart(range: Range, now = new Date()): Date | null {
  if (range === 'all') return null
  const bali = new Date(now.getTime() + BALI_OFFSET_MS)
  const midnight =
    Date.UTC(bali.getUTCFullYear(), bali.getUTCMonth(), bali.getUTCDate()) - BALI_OFFSET_MS
  const days = range === 'today' ? 0 : range === '7d' ? 6 : 29
  return new Date(midnight - days * 24 * 60 * 60 * 1000)
}

const placedAt = sql`coalesce(${orders.placedAt}, ${orders.createdAt})`

function orderRow(row: {
  id: string
  orderNumber: string
  status: string
  totalMinor: number
  currency: string
  snapshot: { name?: string; email?: string } | null
  userName: string | null
  userEmail: string | null
  placedAt: Date | null
  createdAt: Date
}): StaffOrderRow {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    totalMinor: row.totalMinor,
    currency: row.currency,
    customerName: row.snapshot?.name ?? row.userName ?? null,
    customerEmail: row.snapshot?.email ?? row.userEmail ?? null,
    placedAt: (row.placedAt ?? row.createdAt).toISOString(),
  }
}

const orderColumns = {
  id: orders.id,
  orderNumber: orders.orderNumber,
  status: orders.status,
  totalMinor: orders.totalMinor,
  currency: orders.presentmentCurrency,
  snapshot: orders.customerSnapshot,
  userName: users.name,
  userEmail: users.email,
  placedAt: orders.placedAt,
  createdAt: orders.createdAt,
}

/** The columns the content tools read, from whichever table. */
interface ContentColumns {
  id: AnyPgColumn
  slug: AnyPgColumn
  name: AnyPgColumn
  status: AnyPgColumn
  deletedAt: AnyPgColumn
  updatedAt: AnyPgColumn
}

function contentColumns(
  type: ContentType | 'place',
): ContentColumns & { price?: { minor: AnyPgColumn; currency: AnyPgColumn } } {
  switch (type) {
    case 'activity':
      return {
        id: activities.id,
        slug: activities.slug,
        name: activities.name,
        status: activities.status,
        deletedAt: activities.deletedAt,
        updatedAt: activities.updatedAt,
        price: { minor: activities.priceMinor, currency: activities.currency },
      }
    case 'package':
      return {
        id: packages.id,
        slug: packages.slug,
        name: packages.name,
        status: packages.status,
        deletedAt: packages.deletedAt,
        updatedAt: packages.updatedAt,
        price: { minor: packages.priceMinor, currency: packages.currency },
      }
    case 'itinerary':
      return {
        id: itineraries.id,
        slug: itineraries.slug,
        name: itineraries.name,
        status: itineraries.status,
        deletedAt: itineraries.deletedAt,
        updatedAt: itineraries.updatedAt,
        price: { minor: itineraries.priceMinor, currency: itineraries.currency },
      }
    case 'article':
      return {
        id: articles.id,
        slug: articles.slug,
        name: articles.title,
        status: articles.status,
        deletedAt: articles.deletedAt,
        updatedAt: articles.updatedAt,
      }
    case 'place':
      return {
        id: mapPlaces.id,
        slug: mapPlaces.slug,
        name: mapPlaces.name,
        status: mapPlaces.status,
        deletedAt: mapPlaces.deletedAt,
        updatedAt: mapPlaces.updatedAt,
      }
  }
}

function contentTable(type: ContentType | 'place') {
  switch (type) {
    case 'activity':
      return activities
    case 'package':
      return packages
    case 'itinerary':
      return itineraries
    case 'article':
      return articles
    case 'place':
      return mapPlaces
  }
}

interface ContentRow {
  id: string
  slug: string
  name: Record<string, string> | null
  status: string
  priceMinor: number | null
  currency: string | null
}

/** One query shape for every content table (columns picked by type). */
async function contentRows(
  type: ContentType | 'place',
  filters: (cols: ContentColumns) => SQL[],
  limit: number,
): Promise<ContentRow[]> {
  const cols = contentColumns(type)
  const rows = await db
    .select({
      id: sql<string>`${cols.id}`,
      slug: sql<string>`${cols.slug}`,
      name: sql<Record<string, string> | null>`${cols.name}`,
      status: sql<string>`${cols.status}`,
      priceMinor: cols.price ? sql<number | null>`${cols.price.minor}` : sql<number | null>`null`,
      currency: cols.price ? sql<string | null>`${cols.price.currency}` : sql<string | null>`null`,
    })
    .from(contentTable(type))
    .where(and(isNull(cols.deletedAt), ...filters(cols)))
    .orderBy(desc(cols.updatedAt))
    .limit(limit)
  return rows.map((row) => ({
    ...row,
    priceMinor: row.priceMinor === null ? null : Number(row.priceMinor),
  }))
}

export const staffDeps: StaffDeps = {
  async stats(input) {
    const today = rangeStart('today') as Date
    const month = rangeStart('30d') as Date
    const out: Record<string, unknown> = {}
    if (input.orders) {
      const [[todayRow], [awaiting]] = await Promise.all([
        db.select({ n: count() }).from(orders).where(gte(placedAt, today)),
        db
          .select({ n: count() })
          .from(orderItems)
          .innerJoin(orders, eq(orders.id, orderItems.orderId))
          .where(
            and(
              inArray(orders.status, ['paid', 'confirmed', 'partially_refunded']),
              inArray(orderItems.bookingStatus, [
                'created',
                'pending_supplier',
                'pending_availability',
                'sent_to_provider',
              ]),
            ),
          ),
      ])
      out.ordersToday = Number(todayRow?.n ?? 0)
      out.bookingsAwaitingProvider = Number(awaiting?.n ?? 0)
    }
    if (input.payments) {
      const revenue = await db
        .select({ currency: orders.presentmentCurrency, total: sum(orders.totalMinor) })
        .from(orders)
        .where(
          and(
            gte(placedAt, month),
            inArray(orders.status, ['paid', 'confirmed', 'partially_refunded']),
          ),
        )
        .groupBy(orders.presentmentCurrency)
      out.revenueLast30Days = revenue.map((row) =>
        formatMoney(Number(row.total ?? 0), row.currency, 'en'),
      )
    }
    if (input.leads) {
      const [[trips], [contacts]] = await Promise.all([
        db
          .select({ n: count() })
          .from(customTripRequests)
          .where(eq(customTripRequests.status, 'new')),
        db.select({ n: count() }).from(contactMessages).where(eq(contactMessages.status, 'new')),
      ])
      out.newCustomTripRequests = Number(trips?.n ?? 0)
      out.newContactMessages = Number(contacts?.n ?? 0)
    }
    if (input.customers) {
      const now = new Date()
      const [[accounts], [mapUsers]] = await Promise.all([
        db.select({ n: count() }).from(users).where(isNull(users.deletedAt)),
        db
          .select({ n: sql<number>`count(distinct ${entitlements.userId})::int` })
          .from(entitlements)
          .where(
            and(
              inArray(entitlements.kind, ['map_access', 'vip']),
              isNull(entitlements.revokedAt),
              lte(entitlements.startsAt, now),
              or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
            ),
          ),
      ])
      out.accounts = Number(accounts?.n ?? 0)
      out.activeMapUsers = Number(mapUsers?.n ?? 0)
    }
    return out
  },

  async listOrders({ range, status, q, limit }) {
    const filters: SQL[] = []
    const start = rangeStart(range)
    if (start) filters.push(gte(placedAt, start))
    if (status) filters.push(eq(orders.status, status))
    if (q) {
      const like = `%${escapeLike(q)}%`
      const match = or(
        ilike(orders.orderNumber, like),
        ilike(users.email, like),
        sql`${orders.customerSnapshot} ->> 'email' ilike ${like}`,
        sql`${orders.customerSnapshot} ->> 'name' ilike ${like}`,
      )
      if (match) filters.push(match)
    }
    const rows = await db
      .select(orderColumns)
      .from(orders)
      .leftJoin(users, eq(users.id, orders.userId))
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
    return rows.map(orderRow)
  },

  async getOrder(orderNumber) {
    const [row] = await db
      .select(orderColumns)
      .from(orders)
      .leftJoin(users, eq(users.id, orders.userId))
      .where(eq(orders.orderNumber, orderNumber.toUpperCase()))
      .limit(1)
    const found =
      row ??
      (
        await db
          .select(orderColumns)
          .from(orders)
          .leftJoin(users, eq(users.id, orders.userId))
          .where(eq(orders.orderNumber, orderNumber))
          .limit(1)
      )[0]
    if (!found) return null
    const items = await db
      .select({
        id: orderItems.id,
        name: orderItems.nameSnapshot,
        kind: orderItems.kind,
        quantity: orderItems.quantity,
        travelDate: orderItems.travelDate,
        travelTime: orderItems.travelTime,
        bookingStatus: orderItems.bookingStatus,
        lineTotalMinor: orderItems.lineTotalMinor,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, found.id))
      .orderBy(orderItems.createdAt)
    return {
      ...orderRow(found),
      items: items.map((item) => ({ ...item, name: pick(item.name, 'en') })),
    }
  },

  async orderPayments(orderId) {
    const rows = await db
      .select({
        status: payments.status,
        amountMinor: payments.amountMinor,
        currency: payments.currency,
        method: payments.method,
        provider: payments.provider,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .orderBy(payments.createdAt)
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
  },

  async listBookings({ from, to, status, limit }) {
    const filters: SQL[] = [
      gte(orderItems.travelDate, from),
      lte(orderItems.travelDate, to),
      // Only lines someone has paid for are bookings to arrange.
      inArray(orders.status, ['paid', 'confirmed', 'partially_refunded']),
    ]
    if (status) filters.push(eq(orderItems.bookingStatus, status))
    const rows = await db
      .select({
        id: orderItems.id,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        name: orderItems.nameSnapshot,
        kind: orderItems.kind,
        quantity: orderItems.quantity,
        travelDate: orderItems.travelDate,
        travelTime: orderItems.travelTime,
        bookingStatus: orderItems.bookingStatus,
        lineTotalMinor: orderItems.lineTotalMinor,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(...filters))
      .orderBy(orderItems.travelDate, orderItems.travelTime)
      .limit(limit)
    return rows.map((row) => ({ ...row, name: pick(row.name, 'en') }))
  },

  async listCustomers({ q, limit }) {
    const filters: SQL[] = [isNull(users.deletedAt)]
    if (q) {
      const like = `%${escapeLike(q)}%`
      const match = or(ilike(users.email, like), ilike(users.name, like), ilike(users.phone, like))
      if (match) filters.push(match)
    }
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(...filters))
      .orderBy(desc(users.createdAt))
      .limit(limit)
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
  },

  async getCustomer(id) {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
    if (!user) return null
    const now = new Date()
    const [orderRows, accessRows] = await Promise.all([
      db
        .select({
          orderNumber: orders.orderNumber,
          status: orders.status,
          totalMinor: orders.totalMinor,
          currency: orders.presentmentCurrency,
          placedAt: orders.placedAt,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(eq(orders.userId, id))
        .orderBy(desc(orders.createdAt))
        .limit(10),
      db
        .select({ kind: entitlements.kind, expiresAt: entitlements.expiresAt })
        .from(entitlements)
        .where(
          and(
            eq(entitlements.userId, id),
            isNull(entitlements.revokedAt),
            lte(entitlements.startsAt, now),
            or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
          ),
        ),
    ])
    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
      orders: orderRows.map((row) => ({
        orderNumber: row.orderNumber,
        status: row.status,
        totalMinor: row.totalMinor,
        currency: row.currency,
        placedAt: (row.placedAt ?? row.createdAt).toISOString(),
      })),
      access: accessRows.map((row) => ({
        kind: row.kind,
        expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      })),
    }
  },

  async listLeads({ kind, status, limit }) {
    if (kind === 'contact') {
      const rows = await db
        .select({
          id: contactMessages.id,
          name: contactMessages.name,
          email: contactMessages.email,
          subject: contactMessages.subject,
          status: contactMessages.status,
          createdAt: contactMessages.createdAt,
        })
        .from(contactMessages)
        .where(status ? eq(contactMessages.status, status) : undefined)
        .orderBy(desc(contactMessages.createdAt))
        .limit(limit)
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
    }
    const rows = await db
      .select({
        id: customTripRequests.id,
        name: customTripRequests.name,
        email: customTripRequests.email,
        phone: customTripRequests.phone,
        status: customTripRequests.status,
        travellers: customTripRequests.travellers,
        startDate: customTripRequests.startDate,
        endDate: customTripRequests.endDate,
        theme: customTripRequests.theme,
        budgetTier: customTripRequests.budgetTier,
        createdAt: customTripRequests.createdAt,
      })
      .from(customTripRequests)
      .where(status ? eq(customTripRequests.status, status) : undefined)
      .orderBy(desc(customTripRequests.createdAt))
      .limit(limit)
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
  },

  async getLead({ kind, id }) {
    if (kind === 'contact') {
      const [row] = await db
        .select()
        .from(contactMessages)
        .where(eq(contactMessages.id, id))
        .limit(1)
      if (!row) return null
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        subject: row.subject,
        message: row.message.slice(0, 2000),
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      }
    }
    const [row] = await db
      .select()
      .from(customTripRequests)
      .where(eq(customTripRequests.id, id))
      .limit(1)
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      travellers: row.travellers,
      startDate: row.startDate,
      endDate: row.endDate,
      days: row.days,
      theme: row.theme,
      budgetTier: row.budgetTier,
      interests: row.interests,
      preferredAreas: row.preferredAreas,
      wantsDriver: row.wantsDriver,
      hasChildren: row.hasChildren,
      notes: row.notes?.slice(0, 2000) ?? null,
      internalNotes: row.adminNotes?.slice(0, 2000) ?? null,
      quote:
        row.quoteMinor !== null && row.quoteCurrency
          ? formatMoney(row.quoteMinor, row.quoteCurrency, 'en')
          : null,
      paid: row.paidOrderId !== null,
      createdAt: row.createdAt.toISOString(),
    }
  },

  async paymentsSummary(range) {
    const start = rangeStart(range)
    const rows = await db
      .select({
        status: payments.status,
        currency: payments.currency,
        n: count(),
        total: sum(payments.amountMinor),
      })
      .from(payments)
      .where(start ? gte(payments.createdAt, start) : undefined)
      .groupBy(payments.status, payments.currency)
    return rows.map((row) => ({
      status: row.status,
      currency: row.currency,
      count: Number(row.n),
      amountMinor: Number(row.total ?? 0),
    }))
  },

  async listContent({ type, q, status, limit }) {
    const like = q ? `%${escapeLike(q)}%` : null
    const rows = await contentRows(
      type,
      (cols) => {
        const filters: SQL[] = []
        if (status) filters.push(eq(cols.status, status))
        if (like) {
          const match = or(ilike(cols.slug, like), sql`${cols.name}::text ilike ${like}`)
          if (match) filters.push(match)
        }
        return filters
      },
      limit,
    )
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: pick(row.name, 'en', row.slug),
      status: row.status,
      price:
        row.priceMinor !== null && row.currency
          ? formatMoney(row.priceMinor, row.currency, 'en')
          : null,
    }))
  },

  async settings() {
    const { values } = await readSettings()
    return {
      currencies: values.currencies,
      fees: values.fees,
      contact: values.contact,
      assistant: {
        publicEnabled: values.assistant.publicEnabled,
        studioEnabled: values.assistant.studioEnabled,
        model: values.assistant.model || '(server default)',
        fallbackModel: values.assistant.fallbackModel || '(server default)',
        dailyMessagesPerIp: values.assistant.dailyMessagesPerIp,
        dailyBudgetUsd: values.assistant.dailyBudgetUsd,
      },
    }
  },

  async orderItemState(orderNumber, orderItemId) {
    const [row] = await db
      .select({
        orderId: orders.id,
        name: orderItems.nameSnapshot,
        bookingStatus: orderItems.bookingStatus,
        orderStatus: orders.status,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.id, orderItemId),
          or(
            eq(orders.orderNumber, orderNumber),
            eq(orders.orderNumber, orderNumber.toUpperCase()),
          ),
        ),
      )
      .limit(1)
    return row ? { ...row, name: pick(row.name, 'en') } : null
  },

  async contentState(type: ContentType, id: string) {
    const [row] = await contentRows(type, (cols) => [eq(cols.id, id)], 1)
    return row ? { name: pick(row.name, 'en', row.slug), status: row.status } : null
  },

  async leadState(kind, id) {
    if (kind === 'contact') {
      const [row] = await db
        .select({ name: contactMessages.name, status: contactMessages.status })
        .from(contactMessages)
        .where(eq(contactMessages.id, id))
        .limit(1)
      return row ? { name: row.name, status: row.status, notes: null } : null
    }
    const [row] = await db
      .select({
        name: customTripRequests.name,
        status: customTripRequests.status,
        notes: customTripRequests.adminNotes,
      })
      .from(customTripRequests)
      .where(eq(customTripRequests.id, id))
      .limit(1)
    return row ? { name: row.name ?? '—', status: row.status, notes: row.notes } : null
  },

  async slugTaken(slug) {
    const [row] = await db
      .select({ id: mapPlaces.id })
      .from(mapPlaces)
      .where(eq(mapPlaces.slug, slug))
      .limit(1)
    return row !== undefined
  },

  async regionId(key) {
    const [row] = await db
      .select({ id: regions.id })
      .from(regions)
      .where(eq(regions.key, key))
      .limit(1)
    return row?.id ?? null
  },

  locate: (text) =>
    resolveLocation(text, {
      expand: (url) => expandMapsLink(url),
      search: (query) => photonSearch(query),
    }),

  inWater: (point) => isInWater(point.lat, point.lon),

  async placesNear(point, locale) {
    // A box a little wider than the duplicate distance; the exact distance is measured after.
    const box = boundingBox(point, (DUPLICATE_M * 2) / 1000)
    const rows = await db
      .select({
        id: mapPlaces.id,
        slug: mapPlaces.slug,
        name: mapPlaces.name,
        lat: mapPlaces.lat,
        lon: mapPlaces.lon,
      })
      .from(mapPlaces)
      .where(
        and(
          isNull(mapPlaces.deletedAt),
          gte(mapPlaces.lat, box.minLat),
          lte(mapPlaces.lat, box.maxLat),
          gte(mapPlaces.lon, box.minLon),
          lte(mapPlaces.lon, box.maxLon),
        ),
      )
      .limit(20)
    return rows.map((row) => ({
      id: row.id,
      name: pick(row.name, locale, row.slug),
      lat: row.lat,
      lon: row.lon,
    }))
  },

  async placeTaxonomy() {
    const taxonomy = await listMapTaxonomy()
    return { regions: taxonomy.regions, categories: taxonomy.categories }
  },

  async categoryId(key) {
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.key, key))
      .limit(1)
    return row?.id ?? null
  },

  createAction: (input) => createAction(input),
}
