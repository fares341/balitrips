'use server'

/**
 * إزالة جهاز من حساب المستخدم نفسه.
 *
 * هذا هو مخرج سياسة `block`: من بلغ حد الأجهزة يزيل جهازاً قديماً من جهاز
 * مسجّل، ثم يدخل من الجديد. الجهاز الحالي لا يُزال من هنا (لتسجيل الخروج
 * زر مستقل) — إزالته تعني جلسة تنتهي في منتصف الطلب.
 */

import { getLocale } from 'next-intl/server'
import { headers } from 'next/headers'

import { redirect } from '@/i18n/routing'
import { getSession } from '@/lib/auth/session'
import { logActivity } from '@/lib/security/activity'
import { revokeDevice } from '@/lib/security/devices'
import { activeUserOrNull } from '@/lib/security/require'
import { clientIp } from '@/lib/security/ip'

import { currentDeviceId } from './queries'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function removeMyDevice(form: FormData): Promise<void> {
  const locale = await getLocale()
  // الفحص الكامل (جلسة من قاعدة البيانات، جهاز، حظر) — لا كاش الكوكي.
  const user = await activeUserOrNull('account:devices')
  const session = user === null ? null : await getSession()
  if (user === null || session === null) {
    redirect({ href: '/account', locale })
    return
  }

  const raw = form.get('deviceId')
  const deviceId = typeof raw === 'string' && UUID.test(raw) ? raw : null
  let outcome = 'error'

  if (deviceId !== null && deviceId !== (await currentDeviceId(session.sessionId))) {
    // مقيّد بـ userId داخل الاستعلام: معرّف مزوّر لجهاز شخص آخر لا يطابق شيئاً.
    const result = await revokeDevice(deviceId, {
      userId: user.id,
      reason: 'removed_by_user',
      onlyActive: true,
    })
    if (result !== null) {
      outcome = 'removed'
      await logActivity({
        action: 'device_revoked',
        userId: user.id,
        ip: clientIp(await headers()),
        deviceId,
        details: { by: 'user', sessionsEnded: result.sessionsEnded },
      })
    }
  }

  redirect({ href: { pathname: '/account/devices', query: { r: outcome } }, locale })
}
