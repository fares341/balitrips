import { and, desc, eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { activityLog, devices, sessions } from '@/db/schema'

export async function currentDeviceId(sessionId: string): Promise<string | null> {
  const [row] = await db
    .select({ deviceId: sessions.deviceId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1)
  return row?.deviceId ?? null
}

/** أجهزة المستخدم الفعّالة، الأحدث استخداماً أولاً. البصمة لا تُعرض أبداً. */
export async function listMyDevices(userId: string) {
  return db
    .select({
      id: devices.id,
      browser: devices.browser,
      os: devices.os,
      deviceType: devices.deviceType,
      firstSeenAt: devices.firstSeenAt,
      lastSeenAt: devices.lastSeenAt,
    })
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.status, 'active')))
    .orderBy(desc(devices.lastSeenAt))
}

/**
 * آخر عمليات تسجيل الدخول (الوثيقة 3.3): الوقت، الحالة، الجهاز، IP، الموقع التقريبي.
 * الفاشلة تظهر أيضاً — من يرى محاولات لم يقم بها يعرف أن عليه تغيير كلمة المرور.
 */
export async function listMyLogins(userId: string, limit = 10) {
  return db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      ip: activityLog.ip,
      at: activityLog.createdAt,
      browser: devices.browser,
      os: devices.os,
      deviceType: devices.deviceType,
      details: activityLog.details,
    })
    .from(activityLog)
    .leftJoin(devices, eq(devices.id, activityLog.deviceId))
    .where(
      and(
        eq(activityLog.userId, userId),
        inArray(activityLog.action, ['login', 'login_failed', 'login_blocked']),
      ),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(limit)
}

/**
 * "Chrome · macOS" لسطر في سجل الدخول: من الجهاز المسجّل، وإلا من تفاصيل السجل
 * (المحاولات الفاشلة والمرفوضة لا جهاز لها، لكنها تحفظ المتصفح والنظام).
 */
export function loginDevice(row: {
  browser: string | null
  os: string | null
  deviceType: string | null
  details: unknown
}): { label: string; deviceType: string | null } | null {
  const details =
    row.details !== null && typeof row.details === 'object'
      ? (row.details as { browser?: unknown; os?: unknown; deviceType?: unknown })
      : {}
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)
  const browser = row.browser ?? text(details.browser)
  const os = row.os ?? text(details.os)
  if (browser === null && os === null) return null
  return {
    label: `${browser ?? '—'} · ${os ?? '—'}`,
    deviceType: row.deviceType ?? text(details.deviceType),
  }
}

/** "Denpasar, ID" من تفاصيل سجل الدخول (رؤوس الـ CDN)، أو null. */
export function loginPlace(details: unknown): string | null {
  if (details === null || typeof details !== 'object') return null
  const { city, country } = details as { city?: unknown; country?: unknown }
  const parts = [city, country].filter(
    (part): part is string => typeof part === 'string' && part !== '',
  )
  return parts.length > 0 ? parts.join(', ') : null
}
