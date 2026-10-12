/**
 * الجدول المخصص كمنتج مدفوع (الوثيقة 13.1 "جدول مخصص").
 *
 * دورة الحياة:
 *  1. الفريق يحدد عرض سعر على الطلب (`quote_minor` + `quote_currency`) من
 *     Studio → Leads.
 *  2. العميل يرى العرض في حسابه، وزر "ادفع" يضيف بند سلة من نوع `custom`
 *     (`refId` = معرّف الطلب).
 *  3. `buildQuote` يسعّره من صف الطلب — عبر `loadPayableCustomQuotes` — لا من
 *     العميل. طلب لا يملكه المشتري، أو بلا عرض، أو مدفوع مسبقاً، غائب عن
 *     الكتالوج → `unknown_item`، فلا يُدفع.
 *  4. عند الدفع يستدعي `grantOrderPlans` (المسار المشترك بين webhook وreconcile
 *     والدفع اليدوي) `markCustomRequestsPaid` في المعاملة نفسها.
 *
 * Server-only.
 */

import { and, eq, gt, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import { customTripRequests, orderItems, orders } from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** حالات لا يُقبل فيها الدفع: الطلب مغلق. */
const CLOSED_STATUSES = ['cancelled', 'completed'] as const

/** حالات تنتقل إلى `in_progress` عند الدفع. */
const ADVANCE_ON_PAY = ['new', 'under_review'] as const

export interface PayableCustomQuote {
  id: string
  priceMinor: number
  currency: string
  startDate: string | null
  endDate: string | null
}

/**
 * عروض الأسعار القابلة للدفع من بين `ids`، لهذا المستخدم وحده.
 *
 * مقيّدة في SQL: المالك، عرض موجب، عملة، غير مدفوع، وغير مغلق. أي شرط ناقص يُسقط
 * الصف — والغياب في الكتالوج يرفض الدفع.
 */
export async function loadPayableCustomQuotes(
  ids: readonly string[],
  userId: string | null,
): Promise<PayableCustomQuote[]> {
  if (ids.length === 0 || userId === null) return []
  const rows = await db
    .select({
      id: customTripRequests.id,
      quoteMinor: customTripRequests.quoteMinor,
      quoteCurrency: customTripRequests.quoteCurrency,
      startDate: customTripRequests.startDate,
      endDate: customTripRequests.endDate,
    })
    .from(customTripRequests)
    .where(
      and(
        inArray(customTripRequests.id, [...ids]),
        eq(customTripRequests.userId, userId),
        isNotNull(customTripRequests.quoteMinor),
        gt(customTripRequests.quoteMinor, 0),
        isNotNull(customTripRequests.quoteCurrency),
        isNull(customTripRequests.paidOrderId),
        notInArray(customTripRequests.status, [...CLOSED_STATUSES]),
      ),
    )
  return rows.flatMap((row) =>
    row.quoteMinor !== null && row.quoteCurrency !== null
      ? [
          {
            id: row.id,
            priceMinor: row.quoteMinor,
            currency: row.quoteCurrency,
            startDate: row.startDate,
            endDate: row.endDate,
          },
        ]
      : [],
  )
}

export function customQuotePriceMap(rows: readonly PayableCustomQuote[]) {
  return new Map(
    rows.map((row) => [row.id, { priceMinor: row.priceMinor, currency: row.currency }]),
  )
}

/** اسم البند المجمّد في الطلب والسلة. التواريخ بصيغة ISO محايدة لغوياً. */
export function customRequestName(row: {
  startDate: string | null
  endDate: string | null
}): Localized {
  const range =
    row.startDate !== null
      ? ` · ${row.startDate}${row.endDate !== null && row.endDate !== row.startDate ? ` → ${row.endDate}` : ''}`
      : ''
  return {
    en: `Custom itinerary${range}`,
    ar: `جدول مخصص${range}`,
    id: `Itinerary kustom${range}`,
  }
}

/**
 * علّم طلبات الجداول المخصصة في طلب مدفوع كمدفوعة. متساوي النتيجة عند التكرار.
 *
 * `paid_order_id` يُكتب فقط إن كان فارغاً: طلب ثانٍ دفع العرض نفسه (جلستا دفع
 * متوازيتان) لا يغيّر الطلب الأول، ويُسجَّل خطأً ليُسترد من Payments.
 */
export async function markCustomRequestsPaid(tx: Tx, orderId: string): Promise<number> {
  const lines = await tx
    .select({ refId: orderItems.refId })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.kind, 'custom')))
  const ids = lines.map((line) => line.refId).filter((id): id is string => id !== null)
  if (ids.length === 0) return 0

  const [owner] = await tx
    .select({ userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)
  if (!owner?.userId) return 0

  const updated = await tx
    .update(customTripRequests)
    .set({
      paidOrderId: orderId,
      status: sql`case when ${customTripRequests.status} in (${sql.join(
        ADVANCE_ON_PAY.map((status) => sql`${status}`),
        sql`, `,
      )}) then 'in_progress' else ${customTripRequests.status} end`,
    })
    .where(
      and(
        inArray(customTripRequests.id, ids),
        eq(customTripRequests.userId, owner.userId),
        isNull(customTripRequests.paidOrderId),
      ),
    )
    .returning({ id: customTripRequests.id })

  if (updated.length < ids.length) {
    const done = new Set(updated.map((row) => row.id))
    const others = await tx
      .select({ id: customTripRequests.id, paidOrderId: customTripRequests.paidOrderId })
      .from(customTripRequests)
      .where(
        inArray(
          customTripRequests.id,
          ids.filter((id) => !done.has(id)),
        ),
      )
    for (const row of others) {
      if (row.paidOrderId !== null && row.paidOrderId !== orderId) {
        console.error('[custom] custom request paid twice — refund one order', {
          requestId: row.id,
          firstOrderId: row.paidOrderId,
          secondOrderId: orderId,
        })
      }
    }
  }
  return updated.length
}
