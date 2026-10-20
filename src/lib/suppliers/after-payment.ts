/**
 * What happens to each booked line when its order is paid (phase 2).
 *
 * Runs inside the transaction that records the money — the payment webhook
 * and Studio's "mark as paid" — so a paid order never exists without it.
 * Re-runnable: a line already moved past `created` is left alone, and places
 * are held only while `capacity_held` is 0.
 *
 * For every activity line:
 *   1. hold its places (`reserveActivityCapacity`);
 *   2. give it to the best supplier offer (`pickOffer`), freezing the cost;
 *   3. set its status: instant offer + places held → `confirmed`; no places
 *      → `pending_availability`; otherwise `pending_supplier`.
 * Digital products complete; other provider lines wait for the provider.
 */

import { eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { activityTiers, auditLog, orderItems } from '@/db/schema'
import { activityOfLine, reserveActivityCapacity } from '@/lib/availability/activity'
import { tierPricing } from '@/lib/booking/price'
import {
  bookingStatusAfterPayment,
  isActivityKind,
  isBookingStatus,
  type CapacityOutcome,
} from '@/lib/orders/booking-status'

import { lineCostMinor, pickOffer } from './assign'
import { loadOffers } from './offers'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function applyPaidBookings(tx: Tx, orderId: string, now = new Date()): Promise<void> {
  const items = await tx
    .select({
      id: orderItems.id,
      kind: orderItems.kind,
      refId: orderItems.refId,
      status: orderItems.bookingStatus,
      travelDate: orderItems.travelDate,
      travelTime: orderItems.travelTime,
      guests: orderItems.guests,
      quantity: orderItems.quantity,
      capacityHeld: orderItems.capacityHeld,
      supplierId: orderItems.supplierId,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))

  // Which activity (and package) each activity line books.
  const targets = new Map<string, { activityId: string; tierId: string | null }>()
  for (const item of items) {
    if (!isActivityKind(item.kind)) continue
    const target = await activityOfLine(tx, item.kind, item.refId)
    if (target) targets.set(item.id, target)
  }
  const offersByActivity = await loadOffers(
    [...targets.values()].map((target) => target.activityId),
    tx,
  )
  const tierIds = [...targets.values()]
    .map((target) => target.tierId)
    .filter((id): id is string => id !== null)
  const tierModes = new Map(
    (tierIds.length
      ? await tx
          .select({ id: activityTiers.id, pricingMode: activityTiers.pricingMode })
          .from(activityTiers)
          .where(inArray(activityTiers.id, tierIds))
      : []
    ).map((row) => [row.id, tierPricing(row.pricingMode)]),
  )

  for (const item of items) {
    if (!isBookingStatus(item.status) || item.status !== 'created') continue
    const target = targets.get(item.id) ?? null
    const people = Math.max(1, item.guests ?? item.quantity)

    let capacity: CapacityOutcome = 'unlimited'
    let held = item.capacityHeld
    if (target !== null && item.travelDate !== null && held === 0) {
      capacity = await reserveActivityCapacity(
        tx,
        target.activityId,
        item.travelDate,
        item.travelTime,
        people,
      )
      if (capacity === 'reserved' || capacity === 'unlimited') held = people
    }

    let assignment: {
      supplierId: string
      supplierOfferId: string
      costMinor: number
      costCurrency: string
    } | null = null
    let instant = false
    if (target !== null && item.supplierId === null) {
      const offer = pickOffer(
        offersByActivity.get(target.activityId) ?? [],
        { tierId: target.tierId, travelDate: item.travelDate, travelTime: item.travelTime },
        now,
      )
      if (offer !== null) {
        instant = offer.confirmationMode === 'instant'
        const pricing = target.tierId
          ? (tierModes.get(target.tierId) ?? 'per_person')
          : 'per_person'
        assignment = {
          supplierId: offer.supplierId,
          supplierOfferId: offer.id,
          costMinor: lineCostMinor(offer, pricing, people, item.quantity),
          costCurrency: offer.currency,
        }
      }
    }

    const next = bookingStatusAfterPayment({
      kind: item.kind,
      current: item.status,
      instant,
      capacity,
    })

    await tx
      .update(orderItems)
      .set({
        capacityHeld: held,
        ...(assignment ?? {}),
        ...(next !== null
          ? {
              bookingStatus: next,
              bookingStatusAt: now,
              ...(next === 'confirmed'
                ? { supplierConfirmedAt: now, fulfilmentStatus: 'confirmed' }
                : {}),
            }
          : {}),
      })
      .where(eq(orderItems.id, item.id))

    if (next !== null || assignment !== null) {
      await tx.insert(auditLog).values({
        actorId: null,
        action: 'order_item.booking_status',
        entityType: 'order_item',
        entityId: item.id,
        before: { bookingStatus: item.status, orderId },
        after: {
          bookingStatus: next ?? item.status,
          orderId,
          reason: 'paid',
          capacity,
          ...(assignment
            ? { supplierId: assignment.supplierId, supplierOfferId: assignment.supplierOfferId }
            : {}),
        },
      })
    }
  }
}
