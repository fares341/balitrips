/**
 * Order items for the activities a package includes (pure, unit-tested).
 *
 * Used by checkout inside its transaction. Each included activity of a priced
 * package line becomes its own order item: kind `activity`, price 0, same
 * date, its own time when it has one (else the package's), the party of the
 * package, and `parentItemId` = the package's order item — so staff confirm it
 * with the provider separately (`bookingStatus` per item).
 */

import type { Localized } from '@/db/schema/_shared'
import type { orderItems } from '@/db/schema'
import type { Quote, QuoteRequestItem } from '@/lib/pricing/quote'

/** `names`: `part:<activityId>` → the activity's name, as checkout loads them. */
export function includedOrderItems(
  quote: Quote,
  requestItems: readonly QuoteRequestItem[],
  orderItemIds: ReadonlyMap<string, string>,
  orderId: string,
  names: ReadonlyMap<string, Localized>,
): (typeof orderItems.$inferInsert)[] {
  const out: (typeof orderItems.$inferInsert)[] = []
  for (const line of quote.lines) {
    const parentId = orderItemIds.get(line.itemId)
    const item = requestItems.find((i) => i.id === line.itemId)
    if (!parentId || !item) continue
    for (const part of line.breakdown ?? []) {
      if (part.kind !== 'included' || part.refId === null) continue
      out.push({
        orderId,
        kind: 'activity',
        refId: part.refId,
        nameSnapshot: names.get(`part:${part.refId}`) ?? {
          en: 'Included activity',
          ar: 'فعالية مشمولة',
          id: 'Aktivitas termasuk',
        },
        unitPriceMinor: 0,
        quantity: part.quantity,
        lineTotalMinor: 0,
        refVersion: null,
        travelDate: item.travelDate,
        travelTime: part.time ?? item.travelTime,
        guests: item.guests ?? part.quantity,
        vehicleClass: null,
        endDate: null,
        parentItemId: parentId,
        options: { includedInTier: line.refId ?? undefined },
      })
    }
  }
  return out
}
