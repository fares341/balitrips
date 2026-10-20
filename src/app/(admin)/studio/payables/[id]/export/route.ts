import { asc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { orderItems, orders, supplierSettlements, suppliers } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { formatMoneyInput } from '@/lib/money-input'

import { writeAudit } from '../../../../_lib/audit'
import { CSV_MAX_ROWS, csvResponse } from '../../../../_lib/csv'
import { requireCapability } from '../../../../_lib/session'

/** One supplier payment run as CSV: every line it pays, with the supplier's reference. */
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability('suppliers.write')
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 })

  const [run] = await db
    .select({ run: supplierSettlements, supplierName: suppliers.name })
    .from(supplierSettlements)
    .innerJoin(suppliers, eq(suppliers.id, supplierSettlements.supplierId))
    .where(eq(supplierSettlements.id, id))
    .limit(1)
  if (!run) return new Response('Not found', { status: 404 })

  const lines = await db
    .select({
      orderNumber: orders.orderNumber,
      name: orderItems.nameSnapshot,
      travelDate: orderItems.travelDate,
      travelTime: orderItems.travelTime,
      guests: orderItems.guests,
      bookingStatus: orderItems.bookingStatus,
      supplierRef: orderItems.supplierRef,
      costMinor: orderItems.costMinor,
      costCurrency: orderItems.costCurrency,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orderItems.settlementId, id))
    .orderBy(asc(orderItems.travelDate))
    .limit(CSV_MAX_ROWS)

  await writeAudit({
    actor: session,
    action: 'supplier_settlement.export',
    entityType: 'supplier_settlement',
    entityId: id,
    before: null,
    after: { lines: lines.length },
  })

  return csvResponse(
    `supplier-payment-${run.supplierName.replace(/[^\w-]+/g, '-').slice(0, 40) || 'supplier'}`,
    [
      'supplier',
      'period_from',
      'period_to',
      'order',
      'item',
      'travel_date',
      'time',
      'guests',
      'status',
      'supplier_reference',
      'cost',
      'currency',
    ],
    lines.map((line) => [
      run.supplierName,
      run.run.periodFrom,
      run.run.periodTo,
      line.orderNumber,
      pick(line.name, 'en', ''),
      line.travelDate,
      line.travelTime ? line.travelTime.slice(0, 5) : '',
      line.guests,
      line.bookingStatus,
      line.supplierRef,
      line.costMinor === null
        ? ''
        : formatMoneyInput(line.costMinor, line.costCurrency ?? run.run.currency),
      line.costCurrency ?? run.run.currency,
    ]),
  )
}
