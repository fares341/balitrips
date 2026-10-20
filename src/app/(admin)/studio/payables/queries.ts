import { and, eq, gte, inArray, isNotNull, isNull, lte, type SQL } from 'drizzle-orm'

import { orderItems, orders } from '@/db/schema'

/**
 * What we owe a supplier: lines they ran or confirmed, on orders the customer
 * paid (and did not get back), with a cost recorded, not yet in a payment run.
 */
export const PAYABLE_BOOKING_STATUSES = ['confirmed', 'in_progress', 'completed'] as const
export const PAID_ORDER_STATUSES = ['paid', 'confirmed', 'partially_refunded'] as const

export function payableWhere(filter: {
  supplierId?: string
  currency?: string
  from?: string | null
  to?: string | null
}): SQL {
  const parts: (SQL | undefined)[] = [
    isNotNull(orderItems.supplierId),
    isNull(orderItems.settlementId),
    isNotNull(orderItems.costMinor),
    isNotNull(orderItems.costCurrency),
    inArray(orderItems.bookingStatus, [...PAYABLE_BOOKING_STATUSES]),
    inArray(orders.status, [...PAID_ORDER_STATUSES]),
    filter.supplierId ? eq(orderItems.supplierId, filter.supplierId) : undefined,
    filter.currency ? eq(orderItems.costCurrency, filter.currency) : undefined,
    filter.from ? gte(orderItems.travelDate, filter.from) : undefined,
    filter.to ? lte(orderItems.travelDate, filter.to) : undefined,
  ]
  return and(...parts) as SQL
}
