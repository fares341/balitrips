'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import {
  bannedDevices,
  bannedIps,
  devices,
  securityAlerts,
  sessions,
  siteSettings,
  users,
} from '@/db/schema'
import { NEW_DEVICE_POLICIES, PDF_DOWNLOAD_MODES } from '@/lib/security/config'
import { logActivity } from '@/lib/security/activity'
import { revokeDevice } from '@/lib/security/devices'
import { normalizeIp } from '@/lib/security/ip'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fbool, fenum, fint, freq, fstr, fuuid } from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome, type ActionOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { parseSetting, SETTING_DEFAULTS } from '../../_lib/settings'
import { clearSessionVerification } from '../../_lib/two-factor'
import { clearAllVerifications } from '../../_lib/two-factor'

/**
 * إجراءات الحظر وإدارة الأجهزة.
 *
 * كلها تتطلب `security.write` (للمدير فقط) وتكتب في `audit_log` (من فعل ماذا)
 * و`activity_log` (ما حدث للمستخدم) معاً.
 *
 * **الحظر يحذف الجلسات فوراً.** `getSession()` يرفض المحظور عند قراءة الصف،
 * لكن كوكي التخزين المؤقت قد يجيب حتى 5 دقائق؛ حذف الجلسات يجعل
 * `checkSecureAccess()` يرفض المحتوى المدفوع من الطلب التالي مباشرة.
 */

const BAN_DURATIONS = ['1h', '24h', '7d', '30d', 'permanent'] as const
type BanDuration = (typeof BAN_DURATIONS)[number]

const HOUR_MS = 60 * 60 * 1000
const DURATION_MS: Record<Exclude<BanDuration, 'permanent'>, number> = {
  '1h': HOUR_MS,
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
  '30d': 30 * 24 * HOUR_MS,
}

function untilFor(duration: BanDuration, now = new Date()): Date | null {
  return duration === 'permanent' ? null : new Date(now.getTime() + DURATION_MS[duration])
}

const customerHref = (id: string) => adminHref(`/customers/${id}`)
const PROTECTION = adminHref('/protection')

async function run(back: string, body: () => Promise<string>): Promise<never> {
  let outcome: ActionOutcome
  try {
    outcome = { ok: await body() }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(back, outcome))
}

/* --------------------------------------------------------------------------
   المستخدم
   -------------------------------------------------------------------------- */

export async function banUser(userId: string, form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')

  await run(customerHref(userId), async () => {
    if (userId === actor.userId) throw new Error('You cannot ban your own account.')
    const reason = freq(form, 'reason', 'Reason').slice(0, 500)
    const duration = fenum(form, 'duration', BAN_DURATIONS, 'permanent')
    const until = untilFor(duration)

    const ended = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!before) throw new Error('That account no longer exists')

      await tx
        .update(users)
        .set({ status: 'banned', bannedUntil: until, banReason: reason })
        .where(eq(users.id, userId))
      const killed = await tx
        .delete(sessions)
        .where(eq(sessions.userId, userId))
        .returning({ id: sessions.id })
      await clearAllVerifications(userId, tx)

      await writeAudit(
        {
          actor,
          action: 'user.ban',
          entityType: 'user',
          entityId: userId,
          before: { status: before.status, bannedUntil: before.bannedUntil?.toISOString() ?? null },
          after: { status: 'banned', bannedUntil: until?.toISOString() ?? null, reason },
        },
        tx,
      )
      return killed.length
    })

    await logActivity({
      action: 'banned',
      userId,
      ip: actor.ipAddress,
      details: { by: actor.userId, duration, reason },
    })
    return `Account banned (${duration}). ${ended} session${ended === 1 ? '' : 's'} ended.`
  })
}

export async function unbanUser(userId: string): Promise<void> {
  const actor = await requireCapability('security.write')

  await run(customerHref(userId), async () => {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!before) throw new Error('That account no longer exists')
      if (before.status !== 'banned') throw new Error('That account is not banned.')

      await tx
        .update(users)
        .set({ status: 'active', bannedUntil: null, banReason: null })
        .where(eq(users.id, userId))
      await writeAudit(
        {
          actor,
          action: 'user.unban',
          entityType: 'user',
          entityId: userId,
          before: { status: before.status, reason: before.banReason },
          after: { status: 'active' },
        },
        tx,
      )
    })
    await logActivity({
      action: 'unbanned',
      userId,
      ip: actor.ipAddress,
      details: { by: actor.userId },
    })
    return 'Ban lifted.'
  })
}

/* --------------------------------------------------------------------------
   الأجهزة
   -------------------------------------------------------------------------- */

/**
 * `mode`:
 *  - `revoke`   تسجيل خروج الجهاز وتحرير خانته (يمكنه الدخول مجدداً).
 *  - `ban`      منع هذا الجهاز من الدخول لهذا الحساب.
 *  - `ban_all`  منع بصمة هذا الجهاز على المنصة كلها (`banned_devices`).
 */
export async function actOnDevice(userId: string, form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')

  await run(customerHref(userId), async () => {
    const deviceId = fuuid(form, 'deviceId', 'Device')
    const mode = fenum(form, 'mode', ['revoke', 'ban', 'ban_all'] as const, 'revoke')

    const [device] = await db
      .select()
      .from(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)))
      .limit(1)
    if (!device) throw new Error('That device does not belong to this account')

    const result = await revokeDevice(deviceId, {
      userId,
      status: mode === 'revoke' ? 'revoked' : 'banned',
      reason: `admin_${mode}`,
    })

    if (mode === 'ban_all') {
      const reason = fstr(form, 'reason') ?? 'Banned from customer page'
      await db.insert(bannedDevices).values({
        fingerprintHash: device.fingerprintHash,
        reason: reason.slice(0, 500),
        until: null,
        createdBy: actor.userId,
      })
    }

    await writeAudit({
      actor,
      action: `device.${mode}`,
      entityType: 'user',
      entityId: userId,
      before: { deviceId, status: device.status, browser: device.browser, os: device.os },
      after: { status: mode === 'revoke' ? 'revoked' : 'banned' },
    })
    await logActivity({
      action: 'device_revoked',
      userId,
      deviceId,
      ip: actor.ipAddress,
      details: { by: actor.userId, mode, sessionsEnded: result?.sessionsEnded ?? 0 },
    })

    return mode === 'revoke'
      ? 'Device signed out. Its slot is free.'
      : mode === 'ban'
        ? 'Device banned for this account.'
        : 'Device fingerprint banned platform-wide.'
  })
}

export async function liftDeviceBan(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(PROTECTION, async () => {
    const id = fuuid(form, 'banId', 'Ban')
    const [row] = await db
      .update(bannedDevices)
      .set({ liftedAt: new Date(), liftedBy: actor.userId })
      .where(and(eq(bannedDevices.id, id), isNull(bannedDevices.liftedAt)))
      .returning()
    if (!row) throw new Error('That ban is not active')
    await writeAudit({
      actor,
      action: 'device_ban.lift',
      entityType: 'banned_device',
      entityId: id,
      before: { reason: row.reason },
      after: { lifted: true },
    })
    return 'Device ban lifted. Accounts that banned this device individually stay blocked until the device is removed from each.'
  })
}

/* --------------------------------------------------------------------------
   IP
   -------------------------------------------------------------------------- */

export async function banIp(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(PROTECTION, async () => {
    const ip = normalizeIp(freq(form, 'ip', 'IP address'))
    if (ip === null) throw new Error('That is not a valid IPv4 or IPv6 address.')
    if (ip === actor.ipAddress) throw new Error('That is your own IP address.')
    const reason = freq(form, 'reason', 'Reason').slice(0, 500)
    const duration = fenum(form, 'duration', BAN_DURATIONS, '24h')
    const until = untilFor(duration)

    const [row] = await db
      .insert(bannedIps)
      .values({ ip, reason, until, createdBy: actor.userId })
      .returning({ id: bannedIps.id })
    await writeAudit({
      actor,
      action: 'ip.ban',
      entityType: 'banned_ip',
      entityId: row?.id ?? null,
      before: null,
      after: { ip, reason, until: until?.toISOString() ?? null },
    })
    return `${ip} banned (${duration}). New sign-ins and paid content are refused from it; existing sessions from it are refused on their next protected request.`
  })
}

export async function liftIpBan(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(PROTECTION, async () => {
    const id = fuuid(form, 'banId', 'Ban')
    const [row] = await db
      .update(bannedIps)
      .set({ liftedAt: new Date(), liftedBy: actor.userId })
      .where(and(eq(bannedIps.id, id), isNull(bannedIps.liftedAt)))
      .returning()
    if (!row) throw new Error('That ban is not active')
    await writeAudit({
      actor,
      action: 'ip_ban.lift',
      entityType: 'banned_ip',
      entityId: id,
      before: { ip: row.ip, reason: row.reason },
      after: { lifted: true },
    })
    return `Ban on ${row.ip} lifted.`
  })
}

/* --------------------------------------------------------------------------
   الإعدادات
   -------------------------------------------------------------------------- */

export async function saveSecuritySettings(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(PROTECTION, async () => {
    const value = parseSetting('security', {
      newDevicePolicy: fenum(form, 'newDevicePolicy', NEW_DEVICE_POLICIES, 'block'),
      defaultDeviceLimit: fint(form, 'defaultDeviceLimit', 2, 'Default device limit'),
      pdfDownloads: fenum(form, 'pdfDownloads', PDF_DOWNLOAD_MODES, 'allow'),
      maxDownloadsPerItem: fint(form, 'maxDownloadsPerItem', 0, 'Download limit'),
      autoBan: fbool(form, 'autoBan'),
    })

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ value: siteSettings.value })
        .from(siteSettings)
        .where(eq(siteSettings.key, 'security'))
        .limit(1)
      await tx
        .insert(siteSettings)
        .values({ key: 'security', value, updatedByActorId: actor.userId })
        .onConflictDoUpdate({
          target: siteSettings.key,
          set: { value, updatedByActorId: actor.userId, updatedAt: sql`now()` },
        })
      await writeAudit(
        {
          actor,
          action: 'config.update',
          entityType: 'setting',
          entityId: null,
          before: { security: existing?.value ?? SETTING_DEFAULTS.security },
          after: { security: value },
        },
        tx,
      )
    })
    return 'Security settings saved. They apply to the next sign-in and the next PDF request.'
  })
}

/* --------------------------------------------------------------------------
   التنبيهات
   -------------------------------------------------------------------------- */

export async function reviewAlert(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(adminHref('/protection/alerts'), async () => {
    const id = fuuid(form, 'alertId', 'Alert')
    const status = fenum(form, 'status', ['dismissed', 'actioned'] as const, 'dismissed')
    const [row] = await db
      .update(securityAlerts)
      .set({ status, reviewedBy: actor.userId, reviewedAt: new Date() })
      .where(and(eq(securityAlerts.id, id), eq(securityAlerts.status, 'open')))
      .returning({ rule: securityAlerts.rule, subject: securityAlerts.subject })
    if (!row) throw new Error('That alert is no longer open')
    await writeAudit({
      actor,
      action: `alert.${status}`,
      entityType: 'security_alert',
      entityId: id,
      before: { status: 'open' },
      after: { status, rule: row.rule, subject: row.subject },
    })
    return status === 'dismissed' ? 'Alert dismissed.' : 'Alert marked as handled.'
  })
}

/* --------------------------------------------------------------------------
   الجلسات
   -------------------------------------------------------------------------- */

export async function endSession(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(adminHref('/protection/sessions'), async () => {
    const sessionId = fuuid(form, 'sessionId', 'Session')
    if (sessionId === actor.sessionId) {
      throw new Error('That is your own session. Use sign out instead.')
    }
    const [before] = await db.delete(sessions).where(eq(sessions.id, sessionId)).returning()
    if (!before) throw new Error('That session has already ended')
    await clearSessionVerification(sessionId)
    await writeAudit({
      actor,
      action: 'user.session_revoke',
      entityType: 'user',
      entityId: before.userId,
      before: { sessionId, ipAddress: before.ipAddress, deviceId: before.deviceId },
      after: null,
    })
    return 'Session ended. Paid content is refused from its next request; pages may show it signed in for up to five minutes.'
  })
}
