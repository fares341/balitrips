import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { devices, sessions } from '@/db/schema'

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
