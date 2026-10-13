/**
 * منسّق الإشعارات: داخل الموقع + بريد + واتساب.
 *
 *   notifyUser(userId, 'custom_pdf_ready', { name }, '/account/schedules')
 *   notifyStaff('staff_custom_request', { name, travellers }, '/leads')
 *
 * الصف داخل الموقع يُكتب فوراً (هو المصدر الذي يقرأ منه الجرس والصفحة).
 * البريد وواتساب يُرسلان عبر طوابير pg-boss بمعرّف الإشعار فقط — المهمة تعيد
 * قراءة كل شيء من قاعدة البيانات، فلا بيانات شخصية في حمولة الطابور.
 *
 * لا شيء هنا يرمي: إشعار فاشل لا يجب أن يُفشل دفعاً أو رفع ملف. الأخطاء تُسجَّل.
 */

import { db } from '@/db'
import { notifications } from '@/db/schema'

import {
  STAFF_NOTIFICATION_TYPES,
  USER_NOTIFICATION_TYPES,
  type NotificationParams,
  type StaffNotificationType,
  type UserNotificationType,
} from './types'

export * from './types'

type Channels = { email?: boolean; whatsapp?: boolean }

async function enqueueChannels(notificationId: string, channels: Channels): Promise<void> {
  // استيراد ديناميكي: هذا الملف يُستورد من مسارات الويب، والطوابير تفتح اتصال
  // pg-boss — لا نريده في كل طلب لا يرسل شيئاً.
  const { enqueueEmail, enqueueWhatsapp } = await import('@/worker/queues')
  if (channels.email) await enqueueEmail({ kind: 'notification', notificationId })
  if (channels.whatsapp) await enqueueWhatsapp({ notificationId })
}

export async function notifyUser(
  userId: string,
  type: UserNotificationType,
  params: NotificationParams = {},
  href: string | null = null,
  override: Channels = {},
): Promise<string | null> {
  try {
    const [row] = await db
      .insert(notifications)
      .values({ audience: 'user', userId, type, params, href })
      .returning({ id: notifications.id })
    if (!row) return null
    await enqueueChannels(row.id, { ...USER_NOTIFICATION_TYPES[type], ...override })
    return row.id
  } catch (error) {
    console.error('[notify] user notification failed', { type, userId, error })
    return null
  }
}

export async function notifyStaff(
  type: StaffNotificationType,
  params: NotificationParams = {},
  href: string | null = null,
): Promise<string | null> {
  try {
    const [row] = await db
      .insert(notifications)
      .values({ audience: 'staff', userId: null, type, params, href })
      .returning({ id: notifications.id })
    if (!row) return null
    await enqueueChannels(row.id, STAFF_NOTIFICATION_TYPES[type])
    return row.id
  } catch (error) {
    console.error('[notify] staff notification failed', { type, error })
    return null
  }
}

/** حجم الدفعة لإدراج الإشعارات الجماعية وإرسال مهامها إلى الطابور. */
const BULK_CHUNK = 500
const ENQUEUE_PARALLEL = 25

/**
 * نفس الإشعار لعدد كبير من المستخدمين (مثلاً كل من اشترى جدولاً): إدراج على
 * دفعات بدل صف لكل `await`، ثم مهام البريد/واتساب بالتوازي في مجموعات صغيرة.
 * يعيد عدد الصفوف المُدرجة. لا يرمي.
 */
export async function notifyUsers(
  userIds: readonly string[],
  type: UserNotificationType,
  params: NotificationParams = {},
  href: string | null = null,
  override: Channels = {},
): Promise<number> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return 0
  const channels = { ...USER_NOTIFICATION_TYPES[type], ...override }
  let inserted = 0
  try {
    for (let start = 0; start < unique.length; start += BULK_CHUNK) {
      const chunk = unique.slice(start, start + BULK_CHUNK)
      const rows = await db
        .insert(notifications)
        .values(chunk.map((userId) => ({ audience: 'user', userId, type, params, href })))
        .returning({ id: notifications.id })
      inserted += rows.length
      if (!channels.email && !channels.whatsapp) continue
      for (let at = 0; at < rows.length; at += ENQUEUE_PARALLEL) {
        await Promise.all(
          rows.slice(at, at + ENQUEUE_PARALLEL).map((row) => enqueueChannels(row.id, channels)),
        )
      }
    }
  } catch (error) {
    console.error('[notify] bulk user notification failed', { type, inserted, error })
  }
  return inserted
}
