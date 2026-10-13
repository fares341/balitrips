import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { customTripRequests, users } from '@/db/schema'
import { defaultLocale } from '@/i18n/config'
import { toMailLocale, translator } from '@/lib/email'
import { notifyUser } from '@/lib/notify'
import { emailGuest } from '@/lib/notify/guest'
import { logActivity } from '@/lib/security/activity'

/** "تحديث الطلبات" (الوثيقة 15.1) في سجل نشاط صاحب الطلب — إن كان له حساب. */
export async function logRequestActivity(
  requestId: string,
  event: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const [row] = await db
    .select({ userId: customTripRequests.userId })
    .from(customTripRequests)
    .where(eq(customTripRequests.id, requestId))
    .limit(1)
  if (!row?.userId) return
  await logActivity({
    action: 'update_request',
    userId: row.userId,
    details: { requestId, kind: 'custom_trip', event, ...details },
  })
}

function statusLabel(locale: string | null, status: string): string {
  const t = translator(toMailLocale(locale)) as unknown as (key: string) => string
  try {
    const value = t(`cstatus_${status}`)
    return value.endsWith(`cstatus_${status}`) ? status : value
  } catch {
    // مفتاح غير موجود: نرسل المفتاح الخام بدل لا شيء.
    return status
  }
}

/**
 * أبلغ صاحب الطلب بتغيّر حالته، بلغته. طلب مرتبط بحساب: إشعار (داخل الموقع +
 * بريد + واتساب). طلب ضيف: بريد مباشر إلى `custom_trip_requests.email` (بالإنجليزية
 * — الطلب لا يحفظ لغة)، يدعوه للتسجيل بنفس البريد ليُربط الطلب تلقائياً.
 * الحالة `new` لا تُبلّغ (هي حالة الإنشاء).
 */
export async function notifyRequestStatus(requestId: string, status: string): Promise<void> {
  if (status === 'new') return
  const [row] = await db
    .select({
      userId: customTripRequests.userId,
      locale: users.locale,
      name: customTripRequests.name,
      email: customTripRequests.email,
    })
    .from(customTripRequests)
    .leftJoin(users, eq(users.id, customTripRequests.userId))
    .where(eq(customTripRequests.id, requestId))
    .limit(1)
  if (!row) return
  if (!row.userId) {
    await emailGuest({
      to: row.email,
      locale: defaultLocale,
      type: 'custom_status_guest',
      params: { status: statusLabel(defaultLocale, status) },
      // بلا الاسم: كتبه الضيف والعنوان غير متحقق منه (كما في تأكيد الاستلام).
      href: '/account/schedules',
    })
    return
  }
  if (status === 'completed') {
    // اكتمال الجدول: داخل الموقع + بريد + واتساب (لمن وافق).
    await notifyUser(row.userId, 'custom_completed', { name: row.name ?? '' }, '/account/schedules')
    return
  }
  await notifyUser(
    row.userId,
    'custom_status',
    { status: statusLabel(row.locale, status) },
    '/account/schedules',
  )
}
