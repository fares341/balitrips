/**
 * بوابة صفحات الحساب وإجراءاته: نفس `checkSecureAccess()` المستخدم للخريطة وPDF.
 *
 * `requireUser()` وحده يتحقق من الجلسة وحظر المستخدم فقط — جهاز مُزال أو IP
 * محظور أو جهاز محظور كان يستطيع فتح المفضلة ورحلتي والفواتير والدفع. هنا
 * الفحص الكامل من قاعدة البيانات في كل طلب.
 */

import { getLocale } from 'next-intl/server'

import { redirect } from '@/i18n/routing'
import { requireUser, type SessionUser } from '@/lib/auth/session'

import { checkSecureAccess } from './guard'

/**
 * قيمة `?blocked=` في صفحة الحساب. `suspended` = معلّق لحين مراجعة الإدارة
 * (الوثيقة 18.2) ونصّه `acct_blocked_suspended`.
 */
export type BlockedReason = 'banned' | 'suspended' | 'device-revoked' | 'session-ended'

/** مفتاح الرسالة لكل سبب منع في صفحة الحساب. */
export const BLOCKED_MESSAGE_KEYS: Record<BlockedReason, string> = {
  banned: 'acct_blocked_banned',
  suspended: 'acct_blocked_suspended',
  'device-revoked': 'acct_blocked_device',
  'session-ended': 'acct_blocked_device',
}

/** للصفحات: المستخدم، أو تحويل لتسجيل الدخول / صفحة الحساب مع سبب المنع. */
export async function requireActiveUser(resource: string): Promise<SessionUser> {
  const access = await checkSecureAccess(resource)
  if (access.ok) return access.user
  if (access.reason === 'signed-out') return requireUser()
  const blocked: BlockedReason =
    access.reason === 'banned' && access.ban === 'suspended' ? 'suspended' : access.reason
  redirect({
    href: { pathname: '/account', query: { blocked } },
    locale: await getLocale(),
  })
  throw new Error('unreachable: redirect() did not throw')
}

/** للإجراءات وواجهات API: المستخدم أو null (لا تحويل داخل Server Action). */
export async function activeUserOrNull(resource: string): Promise<SessionUser | null> {
  const access = await checkSecureAccess(resource)
  return access.ok ? access.user : null
}
