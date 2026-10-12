/**
 * حارس المحتوى المدفوع: الجلسة + الجهاز + الحظر، من قاعدة البيانات مباشرة.
 *
 * لماذا لا يكفي `getSession()`؟ لأن Better Auth يجيبها غالباً من كوكي
 * التخزين المؤقت (حتى 5 دقائق). جلسة حذفتها الإدارة أو جهاز أُزيل سيبقى
 * "مسجّلاً" خلال تلك المدة. هذا الحارس يقرأ صف الجلسة نفسه في كل مرة، لذا
 * الحظر وإزالة الجهاز يسريان على المحتوى المحمي **فوراً**.
 *
 * كلفة الاستعلام الإضافي مقبولة لأنه يعمل فقط على مسارات المحتوى المدفوع
 * (تحميل PDF، بيانات الخريطة المقفلة)، لا على الصفحات العامة.
 *
 * ليس middleware: `src/proxy.ts` ممنوع من قراءة الكوكيز كي يبقى الموقع
 * قابلاً للتخزين في Cloudflare، وليس حدّاً للصلاحيات أصلاً.
 */

import { and, eq, gt } from 'drizzle-orm'
import { headers } from 'next/headers'

import { db } from '@/db'
import { devices, sessions } from '@/db/schema'
import { getSession, type SessionUser } from '@/lib/auth/session'

import { logActivity } from './activity'
import { findActiveBan, type BanReason } from './bans'
import { clientIp } from './ip'

export type SecureAccess =
  | { ok: true; user: SessionUser; sessionId: string; deviceId: string | null; ip: string | null }
  | { ok: false; reason: 'signed-out' }
  | { ok: false; reason: 'session-ended'; userId: string }
  | { ok: false; reason: 'banned'; ban: BanReason; userId: string }
  | { ok: false; reason: 'device-revoked'; userId: string }

export async function checkSecureAccess(resource: string): Promise<SecureAccess> {
  const session = await getSession()
  if (session === null) return { ok: false, reason: 'signed-out' }

  const ip = clientIp(await headers())
  const userId = session.user.id

  const [row] = await db
    .select({
      deviceId: sessions.deviceId,
      deviceStatus: devices.status,
      fingerprintHash: devices.fingerprintHash,
    })
    .from(sessions)
    .leftJoin(devices, eq(devices.id, sessions.deviceId))
    .where(and(eq(sessions.id, session.sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1)

  // الكوكي ما زال صالحاً لكن الصف حُذف: تسجيل خروج من الإدارة أو إزالة جهاز.
  if (row === undefined) {
    await logActivity({
      action: 'unauthorized_access',
      userId,
      ip,
      details: { resource, why: 'session_ended' },
    })
    return { ok: false, reason: 'session-ended', userId }
  }

  if (row.deviceId !== null && row.deviceStatus !== 'active') {
    await logActivity({
      action: 'unauthorized_access',
      userId,
      ip,
      deviceId: row.deviceId,
      details: { resource, why: 'device_revoked' },
    })
    return { ok: false, reason: 'device-revoked', userId }
  }

  const ban = await findActiveBan({ userId, fingerprintHash: row.fingerprintHash, ip })
  if (ban !== null) {
    await logActivity({
      action: 'unauthorized_access',
      userId,
      ip,
      deviceId: row.deviceId,
      details: { resource, why: `banned_${ban}` },
    })
    return { ok: false, reason: 'banned', ban, userId }
  }

  return { ok: true, user: session.user, sessionId: session.sessionId, deviceId: row.deviceId, ip }
}
