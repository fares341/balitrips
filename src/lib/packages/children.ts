/**
 * The child order items of a paid package — pure, no database (phase 3).
 * See `./expand.ts` for when and how they are written.
 */

import type { OrderItemOptions, orderItems } from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'

type Insert = typeof orderItems.$inferInsert

export interface PackageSpec {
  packageId: string
  activities: { activityId: string; name: Localized; dayOffset: number | null }[]
  itinerary: { id: string; name: Localized; version: number } | null
  vipPlan: { id: string; name: Localized } | null
}

export interface PackageLine {
  id: string
  orderId: string
  refId: string | null
  travelDate: string | null
  guests: number | null
  quantity: number
}

export interface OrderLineRef {
  id: string
  kind: string
  refId: string | null
  parentItemId: string | null
}

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/

/** `date` + `days`, as a plain date. Null in → null out. */
export function addDays(date: string | null, days: number): string | null {
  if (date === null || !PLAIN_DATE.test(date)) return null
  const base = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(base)) return null
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * The child items still missing for one package line — pure. `lines` are all
 * the order's lines (children included), so a second run, or an itinerary /
 * plan the customer also bought on its own in this order, adds nothing.
 */
export function packageChildItems(
  line: PackageLine,
  spec: PackageSpec,
  lines: readonly OrderLineRef[],
): Insert[] {
  const children = lines.filter((row) => row.parentItemId === line.id)
  const hasChild = (kind: string, refId: string) =>
    children.some((row) => row.kind === kind && row.refId === refId)
  const people = Math.max(1, line.guests ?? line.quantity)
  const options: OrderItemOptions = { includedInPackage: spec.packageId }

  const out: Insert[] = []
  for (const activity of spec.activities) {
    if (hasChild('activity', activity.activityId)) continue
    out.push({
      orderId: line.orderId,
      kind: 'activity',
      refId: activity.activityId,
      nameSnapshot: activity.name,
      unitPriceMinor: 0,
      quantity: people,
      lineTotalMinor: 0,
      refVersion: null,
      travelDate:
        activity.dayOffset === null || activity.dayOffset < 0
          ? null
          : addDays(line.travelDate, activity.dayOffset),
      travelTime: null,
      guests: people,
      vehicleClass: null,
      endDate: null,
      parentItemId: line.id,
      options,
    })
  }

  const itinerary = spec.itinerary
  if (
    itinerary !== null &&
    !lines.some((row) => row.kind === 'itinerary' && row.refId === itinerary.id)
  ) {
    out.push({
      orderId: line.orderId,
      kind: 'itinerary',
      refId: itinerary.id,
      nameSnapshot: itinerary.name,
      unitPriceMinor: 0,
      quantity: 1,
      lineTotalMinor: 0,
      refVersion: itinerary.version,
      travelDate: null,
      travelTime: null,
      guests: null,
      vehicleClass: null,
      endDate: null,
      parentItemId: line.id,
      options,
    })
  }

  const plan = spec.vipPlan
  if (
    plan !== null &&
    !lines.some(
      (row) => row.kind === 'plan' && (row.refId === plan.id || row.parentItemId === line.id),
    )
  ) {
    out.push({
      orderId: line.orderId,
      kind: 'plan',
      refId: plan.id,
      nameSnapshot: plan.name,
      unitPriceMinor: 0,
      quantity: 1,
      lineTotalMinor: 0,
      refVersion: null,
      travelDate: null,
      travelTime: null,
      guests: null,
      vehicleClass: null,
      endDate: null,
      parentItemId: line.id,
      options,
    })
  }
  return out
}
