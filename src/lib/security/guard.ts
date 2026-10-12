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
 * إعادة استخدام الجلسة (الوثيقة 18.1 "نشاط غير طبيعي"): إن اختلفت عائلة المتصفح
 * أو نظام التشغيل بين User-Agent الذي أُنشئت به الجلسة والطلب الحالي، فالكوكي
 * نُسخ إلى جهاز آخر. تُحذف الجلسة، ويُسجَّل `unauthorized_access` بسبب
 * `session_reuse`، ويُبلَّغ الفريق. الإصدارات لا تُقارن (تحديث المتصفح طبيعي).
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
import { describeAgent, sameAgentFamily } from './fingerprint'
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

  const requestHeaders = await headers()
  const ip = clientIp(requestHeaders)
  const userId = session.user.id

  const [row] = await db
    .select({
      deviceId: sessions.deviceId,
      userAgent: sessions.userAgent,
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

  const currentAgent = requestHeaders.get('user-agent')
  if (!sameAgentFamily(row.userAgent, currentAgent)) {
    await endReusedSession({
      sessionId: session.sessionId,
      userId,
      email: session.user.email,
      ip,
      deviceId: row.deviceId,
      resource,
      storedAgent: row.userAgent,
      currentAgent,
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

/**
 * كوكي جلسة يُستخدم من متصفح/نظام غير الذي أُنشئ عليه: احذف الجلسة، سجّل، نبّه الفريق.
 * الحذف أولاً (بلا معاملة مفتوحة)، ثم السجل والإشعار.
 */
async function endReusedSession(input: {
  sessionId: string
  userId: string
  email: string
  ip: string | null
  deviceId: string | null
  resource: string
  storedAgent: string | null
  currentAgent: string | null
}): Promise<void> {
  const ended = await db
    .delete(sessions)
    .where(eq(sessions.id, input.sessionId))
    .returning({ id: sessions.id })
  // طلب متزامن حذفها قبلنا: سُجّل ونُبّه مرة واحدة بالفعل.
  if (ended.length === 0) return

  const stored = describeAgent(input.storedAgent)
  const current = describeAgent(input.currentAgent)
  await logActivity({
    action: 'unauthorized_access',
    userId: input.userId,
    ip: input.ip,
    deviceId: input.deviceId,
    details: {
      resource: input.resource,
      why: 'session_reuse',
      expected: `${stored.browser} · ${stored.os}`,
      seen: `${current.browser} · ${current.os}`,
      deviceType: current.deviceType,
    },
  })
  // استيراد ديناميكي كما في ./rules: الإشعارات تفتح طوابير pg-boss.
  const { notifyStaff } = await import('@/lib/notify')
  await notifyStaff(
    'staff_security_alert',
    { rule: 'session_reuse', subject: input.email },
    `/customers/${input.userId}`,
  )
}
