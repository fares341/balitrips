/**
 * ربط الأجهزة بالحسابات وتطبيق حد الأجهزة.
 *
 * النموذج: كل جلسة مرتبطة بجهاز (`sessions.device_id`)، والجهاز يُسجَّل
 * ويُفحص **مرة واحدة عند تسجيل الدخول**. الصفحات المحمية لا تحتاج البصمة
 * بعدها: يكفي أن جلستها ما زالت مرتبطة بجهاز فعّال (`requireSecureAccess()`).
 * هذا يعني أن نسخ كوكي الجلسة إلى جهاز آخر يُورّث الجهاز الأصلي — وهي حدود
 * أي نظام بصمة في المتصفح، والتخفيف منها مهمة الحظر التلقائي (تغيّر IP
 * والمتصفح على نفس الجلسة) في الدفعة الثانية.
 *
 * سياسة الجهاز الجديد عند بلوغ الحد (Studio → Protection، وإلا `SECURITY_NEW_DEVICE_POLICY`):
 *  - `block`         (الافتراضي) يُرفض الدخول، ويُطلب من المستخدم إزالة جهاز
 *                     من صفحة "أجهزتي" على جهاز مسجّل، أو التواصل مع الدعم.
 *  - `evict_oldest`  يُسجَّل خروج أقدم جهاز استخداماً ويُقبل الجديد.
 *  - `warn`          يُقبل ويُسجَّل في السجل كتجاوز للمراجعة.
 */

import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import { devices, entitlements, sessions, users } from '@/db/schema'
import { isElevated, isRole } from '@/lib/auth/roles'

import { readSetting } from '@/app/(admin)/_lib/settings'

import { notifyStaff, notifyUser } from '@/lib/notify'

import { logActivity } from './activity'
import {
  MAX_DEVICE_LIMIT,
  NEW_DEVICE_POLICIES,
  defaultDeviceLimit,
  newDevicePolicy,
  type NewDevicePolicy,
} from './config'
import type { DeviceIdentity } from './fingerprint'

export { NEW_DEVICE_POLICIES, defaultDeviceLimit, newDevicePolicy, type NewDevicePolicy }

/** الإعدادات الحالية (من Studio، وإلا من env). */
async function currentPolicy(): Promise<{ policy: NewDevicePolicy; fallbackLimit: number }> {
  const settings = await readSetting('security')
  return { policy: settings.newDevicePolicy, fallbackLimit: settings.defaultDeviceLimit }
}

/**
 * الحد الفعلي: أعلى `device_limit` بين صلاحيات المستخدم الحيّة، وإلا الافتراضي.
 * صلاحية بلا `device_limit` تحتسب بالافتراضي.
 */
export function effectiveDeviceLimit(limits: readonly (number | null)[], fallback: number): number {
  let best = fallback
  for (const limit of limits) {
    const value = limit ?? fallback
    if (value > best) best = value
  }
  return Math.min(best, MAX_DEVICE_LIMIT)
}

export type NewDeviceDecision = 'allow' | 'evict' | 'block' | 'warn' | 'approval'

/** قرار نقي (قابل للاختبار) لجهاز غير معروف سابقاً لهذا الحساب. */
export function decideNewDevice(input: {
  activeCount: number
  limit: number
  policy: NewDevicePolicy
}): NewDeviceDecision {
  if (input.activeCount < input.limit) return 'allow'
  if (input.policy === 'evict_oldest') return 'evict'
  if (input.policy === 'warn') return 'warn'
  if (input.policy === 'require_approval') return 'approval'
  return 'block'
}

export class DeviceLimitError extends Error {
  constructor(
    readonly limit: number,
    readonly active: number,
  ) {
    super(`Device limit reached (${active}/${limit})`)
    this.name = 'DeviceLimitError'
  }
}

/** سبب الرفض الذي يميّز "رفضه مدير" عن "أزاله المستخدم". */
export const REJECTED_REASON = 'admin_rejected'

/** جهاز ينتظر موافقة الإدارة: الدخول مرفوض حتى يوافق مدير (الوثيقة 14.2). */
export class DeviceApprovalPendingError extends Error {
  constructor(readonly deviceId: string) {
    super('This device is waiting for an administrator to approve it')
    this.name = 'DeviceApprovalPendingError'
  }
}

export class DeviceBannedError extends Error {
  constructor() {
    super('This device is banned for this account')
    this.name = 'DeviceBannedError'
  }
}

async function liveDeviceLimits(userId: string): Promise<(number | null)[]> {
  const now = new Date()
  const rows = await db
    .select({ limit: entitlements.deviceLimit })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        isNull(entitlements.revokedAt),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
      ),
    )
  return rows.map((row) => row.limit)
}

export async function deviceLimitFor(userId: string): Promise<number> {
  const [limits, { fallbackLimit }] = await Promise.all([liveDeviceLimits(userId), currentPolicy()])
  return effectiveDeviceLimit(limits, fallbackLimit)
}

export interface RegisterInput {
  userId: string
  identity: DeviceIdentity
  userAgent: string | null
  ip: string | null
}

/**
 * يسجّل الجهاز لعملية دخول ويعيد `devices.id`، أو يرمي
 * `DeviceLimitError` / `DeviceBannedError`.
 *
 * يعمل داخل معاملة تقفل صف المستخدم (`FOR UPDATE`) كي لا يتجاوز دخولان
 * متزامنان من جهازين جديدين الحد معاً.
 */
export async function registerSignInDevice(input: RegisterInput): Promise<string> {
  const { userId, identity } = input
  const settings = await currentPolicy()
  const result = await db.transaction(async (tx) => {
    const [owner] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .for('update')
      .limit(1)
    const elevated = owner !== undefined && isRole(owner.role) && isElevated(owner.role)

    const [existing] = await tx
      .select()
      .from(devices)
      .where(and(eq(devices.userId, userId), eq(devices.fingerprintHash, identity.fingerprintHash)))
      .limit(1)

    if (existing?.status === 'banned') throw new DeviceBannedError()
    // رفضه مدير صراحةً: لا يعود "معلّقاً" مع كل محاولة (ولا تنبيه جديد للإدارة).
    // يبقى ممنوعاً حتى يوافق عليه مدير من Studio → Protection → Devices.
    if (existing?.status === 'revoked' && existing.revokedReason === REJECTED_REASON) {
      throw new DeviceBannedError()
    }

    const now = new Date()
    const seen = {
      lastSeenAt: now,
      ip: input.ip,
      userAgent: input.userAgent,
      browser: identity.browser,
      os: identity.os,
    }

    if (existing?.status === 'active') {
      await tx.update(devices).set(seen).where(eq(devices.id, existing.id))
      return { deviceId: existing.id, event: null }
    }

    // جهاز جديد، أو جهاز أُزيل سابقاً ويعود: كلاهما يستهلك خانة.
    const active = await tx
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.userId, userId), eq(devices.status, 'active')))
      .orderBy(asc(devices.lastSeenAt))

    // الإعدادات من Studio → Protection (وإلا من env). كانت تُقرأ من env فقط،
    // فلم يكن لتغييرها من لوحة التحكم أي أثر عند تسجيل الدخول.
    const limit = elevated
      ? Number.POSITIVE_INFINITY
      : effectiveDeviceLimit(await liveDeviceLimits(userId), settings.fallbackLimit)
    const decision = decideNewDevice({
      activeCount: active.length,
      limit,
      policy: settings.policy,
    })

    if (decision === 'block') throw new DeviceLimitError(limit, active.length)

    if (decision === 'approval' && existing?.status === 'pending') {
      // ما زال ينتظر الإدارة: لا جلسة، ولا طلب موافقة ثانٍ. (إن تحرّرت خانة أو
      // تغيّرت السياسة منذ الطلب، لا نصل هنا ويُقبل الجهاز بالمسار العادي.)
      await tx.update(devices).set(seen).where(eq(devices.id, existing.id))
      return { deviceId: existing.id, event: null, pending: 'again' as const }
    }
    if (decision === 'approval') {
      // يُسجَّل الجهاز "معلّقاً" ويُرفض الدخول حتى يوافق مدير من لوحة التحكم.
      let pendingId: string
      if (existing !== undefined) {
        await tx
          .update(devices)
          .set({ ...seen, status: 'pending', revokedAt: null, revokedReason: null })
          .where(eq(devices.id, existing.id))
        pendingId = existing.id
      } else {
        const [inserted] = await tx
          .insert(devices)
          .values({
            userId,
            fingerprintHash: identity.fingerprintHash,
            weak: identity.weak,
            status: 'pending',
            ...seen,
          })
          .returning({ id: devices.id })
        if (inserted === undefined) throw new Error('device insert returned nothing')
        pendingId = inserted.id
      }
      return {
        deviceId: pendingId,
        event: null,
        pending: 'new' as const,
        limit,
        active: active.length,
      }
    }

    let evictedId: string | null = null
    if (decision === 'evict') {
      // قد يكون العدد أكبر من الحد (خُفّضت الباقة)؛ نزيل ما يكفي للعودة تحت الحد.
      const surplus = active.slice(0, active.length - limit + 1).map((row) => row.id)
      if (surplus.length > 0) {
        await tx
          .update(devices)
          .set({ status: 'revoked', revokedAt: now, revokedReason: 'evicted_by_new_device' })
          .where(inArray(devices.id, surplus))
        await tx.delete(sessions).where(inArray(sessions.deviceId, surplus))
        evictedId = surplus[0] ?? null
      }
    }

    let deviceId: string
    if (existing !== undefined) {
      await tx
        .update(devices)
        .set({ ...seen, status: 'active', revokedAt: null, revokedReason: null })
        .where(eq(devices.id, existing.id))
      deviceId = existing.id
    } else {
      const [inserted] = await tx
        .insert(devices)
        .values({
          userId,
          fingerprintHash: identity.fingerprintHash,
          weak: identity.weak,
          ...seen,
        })
        .returning({ id: devices.id })
      if (inserted === undefined) throw new Error('device insert returned nothing')
      deviceId = inserted.id
    }

    return {
      deviceId,
      event: {
        decision,
        evictedId,
        limit: Number.isFinite(limit) ? limit : null,
        active: active.length,
      },
    }
  })

  if ('pending' in result && result.pending !== undefined) {
    if (result.pending === 'new') {
      // `device_pending` لا تعدّه قاعدة device_churn: الجهاز يُحسب مرة واحدة فقط،
      // كـ `new_device` عند الموافقة — وإلا كانت موافقة المدير نفسها تحظر العميل.
      await logActivity({
        action: 'device_pending',
        userId,
        ip: input.ip,
        deviceId: result.deviceId,
        details: {
          awaitingApproval: true,
          limit: Number.isFinite(result.limit) ? result.limit : null,
          active: result.active,
          browser: identity.browser,
          os: identity.os,
        },
      })
      const [owner] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
      await notifyStaff(
        'staff_device_approval',
        { email: owner?.email ?? userId, device: `${identity.browser} · ${identity.os}` },
        '/protection/devices?status=pending',
      )
    }
    throw new DeviceApprovalPendingError(result.deviceId)
  }

  if (result.event !== null) {
    await logActivity({
      action: 'new_device',
      userId,
      ip: input.ip,
      deviceId: result.deviceId,
      details: { ...result.event, browser: identity.browser, os: identity.os, weak: identity.weak },
    })
    // تنبيه المستخدم بجهاز جديد — لكن ليس لأول جهاز (التسجيل نفسه).
    if (result.event.active > 0) {
      await notifyUser(
        userId,
        'new_device_login',
        {
          device: `${identity.browser} · ${identity.os}`,
          when: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
        },
        '/account/devices',
      )
    }
    const device = `${identity.browser} · ${identity.os}`
    // سياسة "warn": قُبل الجهاز فوق الحد — المستخدم يرى رسالة الترقية (الوثيقة 14.2)،
    // لا سطراً في السجل فقط.
    if (result.event.decision === 'warn' && result.event.limit !== null) {
      await notifyUser(
        userId,
        'device_limit_warning',
        { device, limit: result.event.limit },
        '/account/devices',
      )
    }
    // الوثيقة 4.3: تنبيه الإدارة عند دخول مستخدم مدفوع من جهاز جديد.
    if (result.event.active > 0 && (await liveDeviceLimits(userId)).length > 0) {
      const [owner] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
      await notifyStaff(
        'staff_paid_new_device',
        { email: owner?.email ?? userId, device, active: result.event.active + 1 },
        `/customers/${userId}`,
      )
    }
    if (result.event.evictedId !== null) {
      await logActivity({
        action: 'device_evicted',
        userId,
        ip: input.ip,
        deviceId: result.event.evictedId,
        details: { replacedBy: result.deviceId },
      })
    }
  }

  return result.deviceId
}

/**
 * إزالة جهاز (من المستخدم أو الإدارة): يُسجَّل خروجه فوراً من كل جلساته.
 * `status: 'banned'` يمنع هذا الجهاز من الدخول لهذا الحساب مجدداً.
 */
export async function revokeDevice(
  deviceId: string,
  options: { userId?: string; status?: 'revoked' | 'banned'; reason: string },
): Promise<{ sessionsEnded: number } | null> {
  return db.transaction(async (tx) => {
    const where =
      options.userId === undefined
        ? eq(devices.id, deviceId)
        : and(eq(devices.id, deviceId), eq(devices.userId, options.userId))

    const [updated] = await tx
      .update(devices)
      .set({
        status: options.status ?? 'revoked',
        revokedAt: new Date(),
        revokedReason: options.reason.slice(0, 64),
      })
      .where(where)
      .returning({ id: devices.id })
    if (updated === undefined) return null

    const ended = await tx
      .delete(sessions)
      .where(eq(sessions.deviceId, deviceId))
      .returning({ id: sessions.id })
    return { sessionsEnded: ended.length }
  })
}

/** عدد الأجهزة الفعّالة — للعرض. */
export async function activeDeviceCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.status, 'active')))
  return row?.value ?? 0
}

/**
 * موافقة الإدارة على جهاز معلّق: يصبح فعّالاً (حتى فوق الحد — الموافقة استثناء
 * مقصود)، ويُبلَّغ المستخدم أن يسجّل الدخول مجدداً.
 */
export async function approveDevice(deviceId: string): Promise<{ userId: string } | null> {
  const [row] = await db
    .update(devices)
    .set({ status: 'active', revokedAt: null, revokedReason: null })
    .where(
      and(
        eq(devices.id, deviceId),
        or(
          eq(devices.status, 'pending'),
          and(eq(devices.status, 'revoked'), eq(devices.revokedReason, REJECTED_REASON)),
        ),
      ),
    )
    .returning({ userId: devices.userId, browser: devices.browser, os: devices.os })
  if (!row) return null
  await notifyUser(
    row.userId,
    'device_approved',
    { device: `${row.browser ?? '?'} · ${row.os ?? '?'}` },
    '/account',
  )
  return { userId: row.userId }
}
