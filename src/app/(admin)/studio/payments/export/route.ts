import { desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { orders, payments, users } from '@/db/schema'

import { writeAudit } from '../../../_lib/audit'
import { CSV_MAX_ROWS, csvResponse } from '../../../_lib/csv'
import { requireCapability } from '../../../_lib/session'
import { paymentFilters } from '../filters'

/**
 * تصدير تقرير المدفوعات CSV (الوثيقة 21.8 "تصدير التقارير") بنفس فلاتر الصفحة.
 * المبالغ بالوحدة الصغرى وبالعملة — لا تحويل ولا تقريب.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // فيه بريد كل العملاء الدافعين: تصدير بيانات شخصية → للمدير فقط، ومسجَّل.
  const session = await requireCapability('customers.export')
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
    .limit(CSV_MAX_ROWS)

  await writeAudit({
    actor: session,
    action: 'payments.export_csv',
    entityType: 'user',
    entityId: session.userId,
    before: null,
    after: { rows: rows.length, filters: params },
  })

  return csvResponse(
    'payments',
    [
      'created_at',
      'order_number',
      'order_status',
      'customer_email',
      'provider',
      'provider_payment_id',
      'payment_status',
      'amount_minor',
      'currency',
    ],
    rows.map((row) => [
      row.createdAt,
      row.orderNumber,
      row.orderStatus,
      row.email,
      row.provider,
      row.providerPaymentId,
      row.status,
      row.amountMinor,
      row.currency,
    ]),
  )
}
