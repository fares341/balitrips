/**
 * Phase 3 catalogue facts for `applyCoverage` (see `./quote.ts`), loaded once
 * per cart / checkout and merged into an already-built `CatalogSnapshot` —
 * the same way `applyExtras` adds phase 2's facts. Shared by the cart
 * (`@/lib/cart/catalog`) and checkout (`@/lib/orders/checkout`), so both
 * price a cart identically.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  itineraries,
  itineraryPackageLinks,
  orderItems,
  orders,
  packages,
  plans,
} from '@/db/schema'

import type { CatalogSnapshot, QuoteRequestItem } from './quote'

const SETTLED = ['paid', 'confirmed', 'partially_refunded']

export async function applyCoverageFacts(
  snapshot: CatalogSnapshot,
  items: readonly QuoteRequestItem[],
  userId: string | null,
): Promise<void> {
  const idsOf = (kind: string) => [
    ...new Set(
      items.filter((i) => i.kind === kind && i.refId !== null).map((i) => i.refId as string),
    ),
  ]
  const itineraryIds = idsOf('itinerary').filter((id) => snapshot.itineraries.has(id))
  const packageIds = idsOf('package').filter((id) => snapshot.packages.has(id))
  const planIds = idsOf('plan').filter((id) => snapshot.plans.has(id))

  if (itineraryIds.length > 0) {
    const rows = await db
      .select({
        id: itineraries.id,
        includesMap: itineraries.includesMap,
        isVip: itineraries.isVip,
        mapAccess: itineraries.mapAccess,
      })
      .from(itineraries)
      .where(inArray(itineraries.id, itineraryIds))
    for (const row of rows) {
      const entry = snapshot.itineraries.get(row.id)
      if (!entry) continue
      entry.grantsVip = row.mapAccess === 'vip_included' && row.includesMap && row.isVip
    }
  }

  if (planIds.length > 0) {
    const rows = await db
      .select({ id: plans.id, kind: plans.entitlementKind })
      .from(plans)
      .where(inArray(plans.id, planIds))
    for (const row of rows) {
      const entry = snapshot.plans.get(row.id)
      if (entry) entry.kind = row.kind
    }
  }

  if (packageIds.length === 0) return

  const [packageRows, links] = await Promise.all([
    db
      .select({
        id: packages.id,
        itineraryId: packages.itineraryId,
        includesVip: packages.includesVip,
        vipPlanId: packages.vipPlanId,
      })
      .from(packages)
      .where(inArray(packages.id, packageIds)),
    db
      .select({
        packageId: itineraryPackageLinks.packageId,
        itineraryId: itineraryPackageLinks.itineraryId,
        priceRule: itineraryPackageLinks.priceRule,
      })
      .from(itineraryPackageLinks)
      .where(inArray(itineraryPackageLinks.packageId, packageIds)),
  ])

  const creditIds = new Set<string>()
  for (const row of packageRows) {
    const entry = snapshot.packages.get(row.id)
    if (!entry) continue
    const own = links.filter((link) => link.packageId === row.id)
    const covers = new Set<string>()
    if (row.itineraryId !== null) covers.add(row.itineraryId)
    for (const link of own) {
      if (link.priceRule === 'included' || link.priceRule === 'deducted_on_upgrade') {
        covers.add(link.itineraryId)
      }
    }
    const credits = own
      .filter((link) => link.priceRule === 'deducted_on_upgrade')
      .map((link) => link.itineraryId)
    for (const id of credits) creditIds.add(id)
    entry.coversItineraries = [...covers]
    entry.creditItineraries = credits
    // VIP with the package only counts when a plan says what VIP means.
    entry.includesVip = row.includesVip && row.vipPlanId !== null
  }

  if (userId === null || creditIds.size === 0) return
  const owned = await db
    .select({
      refId: orderItems.refId,
      paid: sql<number>`max(${orderItems.lineTotalMinor} - ${orderItems.refundedMinor})`.mapWith(
        Number,
      ),
      currency: orders.presentmentCurrency,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orderItems.kind, 'itinerary'),
        inArray(orderItems.refId, [...creditIds]),
        inArray(orders.status, SETTLED),
        isNull(orderItems.parentItemId),
        sql`${orderItems.fulfilmentStatus} not in ('refunded', 'cancelled')`,
      ),
    )
    .groupBy(orderItems.refId, orders.presentmentCurrency)
  const map = new Map<string, { paidMinor: number; currency: string }>()
  for (const row of owned) {
    if (row.refId === null || !Number.isFinite(row.paid)) continue
    const current = map.get(row.refId)
    if (!current || current.paidMinor < row.paid) {
      map.set(row.refId, { paidMinor: row.paid, currency: row.currency })
    }
  }
  snapshot.ownedItineraries = map
}
