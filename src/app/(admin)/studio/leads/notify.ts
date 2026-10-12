import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { customTripRequests, users } from '@/db/schema'
import { toMailLocale, translator } from '@/lib/email'
import { notifyUser } from '@/lib/notify'

/**
 * أبلغ صاحب الطلب بتغيّر حالته، بلغته. فقط إن كان الطلب مرتبطاً بحساب:
 * طلب ضيف لا وجهة له داخل الموقع (اربطه بحساب من صفحة الطلب أولاً).
 * الحالة `new` لا تُبلّغ (هي حالة الإنشاء).
 */
export async function notifyRequestStatus(requestId: string, status: string): Promise<void> {
  if (status === 'new') return
  const [row] = await db
    .select({
      userId: customTripRequests.userId,
      locale: users.locale,
      name: customTripRequests.name,
    })
    .from(customTripRequests)
    .leftJoin(users, eq(users.id, customTripRequests.userId))
    .where(eq(customTripRequests.id, requestId))
    .limit(1)
  if (!row?.userId) return
  if (status === 'completed') {
    // اكتمال الجدول: داخل الموقع + بريد + واتساب (لمن وافق).
    await notifyUser(row.userId, 'custom_completed', { name: row.name ?? '' }, '/account/schedules')
    return
  }
  const t = translator(toMailLocale(row.locale)) as unknown as (key: string) => string
  let label = status
  try {
    label = t(`cstatus_${status}`)
  } catch {
    // مفتاح غير موجود: نرسل المفتاح الخام بدل لا شيء.
  }
  await notifyUser(row.userId, 'custom_status', { status: label }, '/account/schedules')
}
