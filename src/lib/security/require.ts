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

export type BlockedReason = 'banned' | 'device-revoked' | 'session-ended'

/** للصفحات: المستخدم، أو تحويل لتسجيل الدخول / صفحة الحساب مع سبب المنع. */
export async function requireActiveUser(resource: string): Promise<SessionUser> {
  const access = await checkSecureAccess(resource)
  if (access.ok) return access.user
  if (access.reason === 'signed-out') return requireUser()
  redirect({
    href: { pathname: '/account', query: { blocked: access.reason } },
    locale: await getLocale(),
  })
  throw new Error('unreachable: redirect() did not throw')
}

/** للإجراءات وواجهات API: المستخدم أو null (لا تحويل داخل Server Action). */
export async function activeUserOrNull(resource: string): Promise<SessionUser | null> {
  const access = await checkSecureAccess(resource)
  return access.ok ? access.user : null
}
