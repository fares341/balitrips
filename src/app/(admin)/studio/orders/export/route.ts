import { desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { orders, users } from '@/db/schema'

import { writeAudit } from '../../../_lib/audit'
import { CSV_MAX_ROWS, csvResponse } from '../../../_lib/csv'
import { requireCapability } from '../../../_lib/session'
import { orderFilters } from '../filters'

/**
 * Phase 4: orders as CSV, with the list's filters. Customer details make it
 * personal data, so admin only (`customers.export`) and audited. Amounts in
 * minor units (cents).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await requireCapability('customers.export')
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const { where } = orderFilters(params)

  const rows = await db
    .select({
      orderNumber: orders.orderNumber,
      status: orders.status,
      placedAt: orders.placedAt,
      createdAt: orders.createdAt,
      currency: orders.presentmentCurrency,
      subtotalMinor: orders.subtotalMinor,
      discountMinor: orders.discountMinor,
      couponCode: orders.couponCode,
      feesMinor: orders.feesMinor,
      taxMinor: orders.taxMinor,
      totalMinor: orders.totalMinor,
      invoiceNumber: orders.invoiceNumber,
      customer: orders.customerSnapshot,
      accountEmail: users.email,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(CSV_MAX_ROWS)

  await writeAudit({
    actor: session,
    action: 'orders.export_csv',
    entityType: 'order',
    entityId: null,
    before: null,
    after: { rows: rows.length, filters: params },
  })

  return csvResponse(
    'orders',
    [
      'order',
      'status',
      'placed_at',
      'currency',
      'subtotal_minor',
      'discount_minor',
      'coupon',
      'fees_minor',
      'tax_minor',
      'total_minor',
      'invoice',
      'customer_name',
      'customer_email',
      'customer_phone',
      'customer_country',
    ],
    rows.map((row) => [
      row.orderNumber,
      row.status,
      row.placedAt ?? row.createdAt,
      row.currency,
      row.subtotalMinor,
      row.discountMinor,
      row.couponCode,
      row.feesMinor,
      row.taxMinor,
      row.totalMinor,
      row.invoiceNumber,
      row.customer?.name ?? '',
      row.customer?.email ?? row.accountEmail ?? '',
      row.customer?.phone ?? '',
      row.customer?.country ?? '',
    ]),
  )
}
