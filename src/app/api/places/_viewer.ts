import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { emptyEntitlements, loadEntitlements, type EntitlementSet } from '@/lib/entitlements'
import { checkSecureAccess } from '@/lib/security/guard'

/**
 * من يسأل؟ نفس حارس المحتوى المدفوع: حساب محظور أو جهاز مُزال أو جلسة
 * أنهتها الإدارة يُعامل كزائر — يرى الأماكن المجانية فقط.
 */
export async function viewer(resource: string): Promise<{
  userId: string | null
  ip: string | null
  deviceId: string | null
  held: EntitlementSet
}> {
  const access = await checkSecureAccess(resource)
  if (!access.ok) return { userId: null, ip: null, deviceId: null, held: emptyEntitlements() }
  return {
    userId: access.user.id,
    ip: access.ip,
    deviceId: access.deviceId,
    held: await loadEntitlements(access.user.id),
  }
}

export function localeOf(value: string | null): Locale {
  return value !== null && isLocale(value) ? value : defaultLocale
}

export const NO_STORE = { 'Cache-Control': 'private, no-store' } as const
