import { writeAudit } from '../../../_lib/audit'
import { CSV_MAX_ROWS, csvResponse } from '../../../_lib/csv'
import { requireCapability } from '../../../_lib/session'
import { loadOrderProfit, profitFilters } from '../queries'

/**
 * الأرباح CSV: one row per paid order with its money broken down, in the
 * page's date range. Admin only (`finance.read`); every export is audited.
 * Amounts are minor units (cents) so the file sums exactly in a spreadsheet.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await requireCapability('finance.read')
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const { where } = profitFilters(params)
  const rows = await loadOrderProfit(where, CSV_MAX_ROWS)

  await writeAudit({
    actor: session,
    action: 'profit.export_csv',
    entityType: 'order',
    entityId: null,
    before: null,
    after: { rows: rows.length, filters: params },
  })

  return csvResponse(
    'profit',
    [
      'order',
      'placed_at',
      'currency',
      'sales_minor',
      'discount_minor',
      'fees_minor',
      'tax_minor',
      'charged_minor',
      'refunded_minor',
      'revenue_minor',
      'supplier_cost_minor',
      'margin_minor',
      'cost_lines_in_other_currency',
    ],
    rows.map((row) => {
      const revenue = row.totalMinor - row.taxMinor - row.refundedMinor
      return [
        row.orderNumber,
        row.placedAt,
        row.currency,
        row.subtotalMinor,
        row.discountMinor,
        row.feesMinor,
        row.taxMinor,
        row.totalMinor,
        row.refundedMinor,
        revenue,
        row.costMinor,
        revenue - row.costMinor,
        row.foreignCostLines,
      ]
    }),
  )
}
