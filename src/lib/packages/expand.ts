/**
 * A paid package becomes real bookings (phase 3).
 *
 * Before phase 3 a package was one cart line and one order line: nothing
 * existed for its activities, so no supplier was asked and no place was held.
 * Now, in the same transaction that records the payment, each package line
 * gets child order items:
 *
 *  - one `activity` item per package activity — price 0, `parentItemId` = the
 *    package line, its own booking status, travel date = trip start + the
 *    activity's day (no day set → no date, the team arranges it). They are
 *    created BEFORE `applyPaidBookings`, so they go through the same phase 2
 *    supplier assignment and capacity hold as any activity;
 *  - one `itinerary` item when the package includes an itinerary (pinned to
 *    its current version) — unless the order already holds that itinerary;
 *  - one `plan` item when the package includes VIP with a plan chosen —
 *    unless the order already holds a line for that plan. `grantOrderPlans`
 *    then grants it like any paid plan, and a refund of the package takes it
 *    back with the children.
 *
 * Idempotent: a child is only created when no child of the same kind and ref
 * exists under the package line, so a replayed webhook, the reconcile sweep
 * and "mark as paid" never double a booking.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm'

import { db } from '@/db'
import {
  activities,
  itineraries,
  orderItems,
  packageActivities,
  packages,
  plans,
} from '@/db/schema'

import { packageChildItems, type OrderLineRef, type PackageSpec } from './children'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Load each package's components as they are NOW (bought = paid for now). */
async function loadSpecs(tx: Tx, packageIds: readonly string[]): Promise<Map<string, PackageSpec>> {
  const out = new Map<string, PackageSpec>()
  if (packageIds.length === 0) return out
  const ids = [...packageIds]
  const [packageRows, activityRows] = await Promise.all([
    tx
      .select({
        id: packages.id,
        itineraryId: packages.itineraryId,
        includesVip: packages.includesVip,
        vipPlanId: packages.vipPlanId,
      })
      .from(packages)
      .where(inArray(packages.id, ids)),
    tx
      .select({
        packageId: packageActivities.packageId,
        activityId: packageActivities.activityId,
        dayOffset: packageActivities.dayOffset,
        sortOrder: packageActivities.sortOrder,
        name: activities.name,
      })
      .from(packageActivities)
      .innerJoin(activities, eq(activities.id, packageActivities.activityId))
      .where(and(inArray(packageActivities.packageId, ids), isNull(activities.deletedAt))),
  ])
  const itineraryIds = packageRows
    .map((row) => row.itineraryId)
    .filter((id): id is string => id !== null)
  const planIds = packageRows
    .filter((row) => row.includesVip)
    .map((row) => row.vipPlanId)
    .filter((id): id is string => id !== null)
  const [itineraryRows, planRows] = await Promise.all([
    itineraryIds.length
      ? tx
          .select({ id: itineraries.id, name: itineraries.name, version: itineraries.version })
          .from(itineraries)
          .where(and(inArray(itineraries.id, itineraryIds), isNull(itineraries.deletedAt)))
      : Promise.resolve([]),
    planIds.length
      ? tx
          .select({ id: plans.id, name: plans.name })
          .from(plans)
          .where(and(inArray(plans.id, planIds), eq(plans.entitlementKind, 'vip')))
      : Promise.resolve([]),
  ])

  for (const row of packageRows) {
    const itinerary = itineraryRows.find((one) => one.id === row.itineraryId) ?? null
    const plan = row.includesVip ? (planRows.find((one) => one.id === row.vipPlanId) ?? null) : null
    out.set(row.id, {
      packageId: row.id,
      activities: activityRows
        .filter((one) => one.packageId === row.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((one) => ({ activityId: one.activityId, name: one.name, dayOffset: one.dayOffset })),
      itinerary,
      vipPlan: plan,
    })
  }
  return out
}

/** Create the missing child items of every package line of a paid order. */
export async function expandPaidPackages(tx: Tx, orderId: string): Promise<number> {
  const lines = await tx
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      kind: orderItems.kind,
      refId: orderItems.refId,
      parentItemId: orderItems.parentItemId,
      travelDate: orderItems.travelDate,
      guests: orderItems.guests,
      quantity: orderItems.quantity,
      fulfilmentStatus: orderItems.fulfilmentStatus,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))

  const packageLines = lines.filter(
    (row) =>
      row.kind === 'package' &&
      row.refId !== null &&
      row.fulfilmentStatus !== 'refunded' &&
      row.fulfilmentStatus !== 'cancelled',
  )
  if (packageLines.length === 0) return 0

  const specs = await loadSpecs(tx, [...new Set(packageLines.map((row) => row.refId as string))])
  const known: OrderLineRef[] = lines.map((row) => ({
    id: row.id,
    kind: row.kind,
    refId: row.refId,
    parentItemId: row.parentItemId,
  }))
  let created = 0
  for (const line of packageLines) {
    const spec = specs.get(line.refId as string)
    if (!spec) continue
    const inserts = packageChildItems(line, spec, known)
    if (inserts.length === 0) continue
    const rows = await tx.insert(orderItems).values(inserts).returning({
      id: orderItems.id,
      kind: orderItems.kind,
      refId: orderItems.refId,
      parentItemId: orderItems.parentItemId,
    })
    known.push(...rows)
    created += rows.length
  }
  return created
}
