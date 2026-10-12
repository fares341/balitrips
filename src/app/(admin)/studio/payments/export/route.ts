import { desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { orders, payments, users } from '@/db/schema'

import { requireCapability } from '../../../_lib/session'
import { paymentFilters } from '../filters'

/**
 * تصدير تقرير المدفوعات CSV (الوثيقة 21.8 "تصدير التقارير") بنفس فلاتر الصفحة.
 * المبالغ بالوحدة الصغرى وبالعملة — لا تحويل ولا تقريب.
 */
export const dynamic = 'force-dynamic'

const MAX_ROWS = 50_000

/** خلية CSV آمنة: اقتباس، ومنع حقن الصيغ في Excel (= + - @). */
function cell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export async function GET(request: Request) {
  await requireCapability('payments.read')
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const { where } = paymentFilters(params)

  const rows = await db
    .select({
      createdAt: payments.createdAt,
      orderNumber: orders.orderNumber,
      orderStatus: orders.status,
      email: users.email,
      provider: payments.provider,
      providerPaymentId: payments.providerPaymentId,
      status: payments.status,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .leftJoin(users, eq(users.id, orders.userId))
    .where(where)
    .orderBy(desc(payments.createdAt))
    .limit(MAX_ROWS)

  const header = [
    'created_at',
    'order_number',
    'order_status',
    'customer_email',
    'provider',
    'provider_payment_id',
    'payment_status',
    'amount_minor',
    'currency',
  ]
  const lines = [header.map(cell).join(',')]
  for (const row of rows) {
    lines.push(
      [
        row.createdAt.toISOString(),
        row.orderNumber,
        row.orderStatus,
        row.email,
        row.provider,
        row.providerPaymentId,
        row.status,
        row.amountMinor,
        row.currency,
      ]
        .map(cell)
        .join(','),
    )
  }
  const stamp = new Date().toISOString().slice(0, 10)
  // BOM: Excel يفتح UTF-8 (أسماء وبريد عربي) بشكل صحيح.
  return new Response(`﻿${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payments-${stamp}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
