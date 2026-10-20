/**
 * Loading supplier offers for the assignment rules (`./assign`).
 * Server-only (database access).
 */

import { and, eq, inArray, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { activitySupplierOffers, suppliers } from '@/db/schema'

import { confirmationMode, type OfferFacts } from './assign'

type Executor = Pick<typeof db, 'select'>

export interface OfferWithSupplier extends OfferFacts {
  activityId: string
  supplierName: string
}

/** Every offer of these activities (active or not), with its supplier's state. */
export async function loadOffers(
  activityIds: readonly string[],
  executor: Executor = db,
): Promise<Map<string, OfferWithSupplier[]>> {
  const out = new Map<string, OfferWithSupplier[]>()
  const ids = [...new Set(activityIds)]
  if (ids.length === 0) return out
  const rows = await executor
    .select({ offer: activitySupplierOffers, supplier: suppliers })
    .from(activitySupplierOffers)
    .innerJoin(suppliers, eq(suppliers.id, activitySupplierOffers.supplierId))
    .where(and(inArray(activitySupplierOffers.activityId, ids), isNull(suppliers.deletedAt)))
  for (const { offer, supplier } of rows) {
    const list = out.get(offer.activityId) ?? []
    list.push({
      id: offer.id,
      activityId: offer.activityId,
      supplierId: offer.supplierId,
      supplierName: supplier.name,
      tierId: offer.tierId,
      costMinor: offer.costMinor,
      currency: offer.currency,
      timeSlots: Array.isArray(offer.timeSlots) ? offer.timeSlots : [],
      confirmationMode: confirmationMode(offer.confirmationMode),
      confirmWithinHours: offer.confirmWithinHours,
      leadTimeHours: offer.leadTimeHours,
      active: offer.active,
      priority: offer.priority,
      supplierActive: supplier.status === 'active',
      createdAt: offer.createdAt,
    })
    out.set(offer.activityId, list)
  }
  return out
}
