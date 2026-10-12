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
 * سياسة الجهاز الجديد عند بلوغ الحد (`SECURITY_NEW_DEVICE_POLICY`):
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

import { notifyUser } from '@/lib/notify'

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

export type NewDeviceDecision = 'allow' | 'evict' | 'block' | 'warn'

/** قرار نقي (قابل للاختبار) لجهاز غير معروف سابقاً لهذا الحساب. */
export function decideNewDevice(input: {
  activeCount: number
  limit: number
  policy: NewDevicePolicy
}): NewDeviceDecision {
  if (input.activeCount < input.limit) return 'allow'
  if (input.policy === 'evict_oldest') return 'evict'
  if (input.policy === 'warn') return 'warn'
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

    const limit = elevated
      ? Number.POSITIVE_INFINITY
      : effectiveDeviceLimit(await liveDeviceLimits(userId), defaultDeviceLimit())
    const decision = decideNewDevice({
      activeCount: active.length,
      limit,
      policy: newDevicePolicy(),
    })

    if (decision === 'block') throw new DeviceLimitError(limit, active.length)

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
