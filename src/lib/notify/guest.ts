/**
 * بريد لمن لا حساب له (طلب جدول مخصص من ضيف): لا صف في `notifications` لأنه
 * لا مستخدم يُربط به، فيُرسل مباشرة بقالب الإشعار العام (`notif_<type>_t/_b`).
 *
 * لا يرمي أبداً. لا يرسل لعنوان بديل لحساب الجوال (`@phone.balitrips.invalid`)
 * — `sendEmail` يرفضه أيضاً، والفحص هنا يوفّر العرض.
 */

import { and, isNull, sql } from 'drizzle-orm'

import { absoluteUrl } from '@/app/[locale]/_meta'
import { db } from '@/db'
import { customTripRequests } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { isPlaceholderEmail } from '@/lib/auth/phone'
import { renderNotificationEmail, sendEmail } from '@/lib/email'
import { logActivity } from '@/lib/security/activity'

import type { NotificationParams } from './types'

export async function emailGuest(input: {
  to: string | null | undefined
  locale: Locale
  /** مفاتيح النص `notif_<type>_t` / `notif_<type>_b`. */
  type: string
  params: NotificationParams
  name?: string | null
  /** مسار داخل الموقع (بلا لغة) للزر، أو null بلا زر. */
  href?: string | null
}): Promise<boolean> {
  const to = input.to?.trim().toLowerCase() ?? ''
  if (!to.includes('@') || isPlaceholderEmail(to)) return false
  try {
    const rendered = renderNotificationEmail({
      locale: input.locale,
      name: input.name ?? null,
      type: input.type,
      params: input.params,
      url: input.href ? absoluteUrl(input.href, input.locale) : null,
    })
    const result = await sendEmail({ to, ...rendered })
    if (!result.delivered) {
      console.warn('[notify] guest mail not delivered', { type: input.type, error: result.error })
    }
    return result.delivered
  } catch (error) {
    console.error('[notify] guest mail failed', { type: input.type, error })
    return false
  }
}

/**
 * اربط طلبات الجدول المخصص التي أُرسلت ضيفاً (`user_id` فارغ) ببريد هذا الحساب
 * (مطابقة بأحرف صغيرة). يُستدعى فقط لبريد **مؤكَّد** — من يملك البريد يملك الطلب.
 * يعيد عدد الطلبات المربوطة.
 */
export async function linkGuestCustomRequests(userId: string, email: string): Promise<number> {
  const address = email.trim().toLowerCase()
  if (!address.includes('@') || isPlaceholderEmail(address)) return 0
  const linked = await db
    .update(customTripRequests)
    .set({ userId })
    .where(
      and(
        isNull(customTripRequests.userId),
        sql`lower(trim(${customTripRequests.email})) = ${address}`,
      ),
    )
    .returning({ id: customTripRequests.id })
  for (const row of linked) {
    await logActivity({
      action: 'update_request',
      userId,
      details: { requestId: row.id, kind: 'custom_trip', event: 'linked_on_signup' },
    })
  }
  return linked.length
}
