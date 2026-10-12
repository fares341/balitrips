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
      firstSeenAt: devices.firstSeenAt,
      lastSeenAt: devices.lastSeenAt,
    })
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.status, 'active')))
    .orderBy(desc(devices.lastSeenAt))
}

/**
 * آخر عمليات تسجيل الدخول (الوثيقة 3.3): الوقت، الحالة، الجهاز، IP.
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
