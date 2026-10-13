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
import { approveDevice, REJECTED_REASON, revokeDevice } from '@/lib/security/devices'
import { normalizeIp } from '@/lib/security/ip'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { getAdminI18n } from '../../_lib/i18n'
import { fbool, fenum, fint, freq, fstr, fuuid } from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome, type ActionOutcome } from '../../_lib/result'
import { requireCapability, type AdminSession } from '../../_lib/session'
import { parseSetting, SETTING_DEFAULTS } from '../../_lib/settings'
import { clearSessionVerification } from '../../_lib/two-factor'
import { clearAllVerifications } from '../../_lib/two-factor'
import type { Translate } from '../../_i18n'

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

async function run(back: string, body: (t: Translate) => Promise<string>): Promise<never> {
  const { t } = await getAdminI18n()
  let outcome: ActionOutcome
  try {
    outcome = { ok: await body(t) }
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

  await run(customerHref(userId), async (t) => {
    if (userId === actor.userId) throw new Error(t('protection.err_ban_self'))
    const reason = freq(form, 'reason', t('protection.reason')).slice(0, 500)
    const duration = fenum(form, 'duration', BAN_DURATIONS, 'permanent')
    const until = untilFor(duration)

    const ended = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!before) throw new Error(t('protection.err_account_gone'))

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
    return t('protection.ok_account_banned', {
      duration: t(`protection.duration_${duration}`),
      count: ended,
    })
  })
}

/**
 * رفع الحظر، أو رفع التعليق التلقائي (`suspended`، الوثيقة 18.2) — زر "رفع الحظر"
 * في صفحة العميل يعمل للحالتين.
 */
export async function unbanUser(userId: string): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(customerHref(userId), (t) => reactivate(t, actor, userId))
}

/** نفس `unbanUser` من قائمة "الحسابات المعلّقة" في صفحة الحماية. */
export async function liftSuspension(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(PROTECTION, (t) =>
    reactivate(t, actor, fuuid(form, 'userId', t('protection.label_account'))),
  )
}

async function reactivate(t: Translate, actor: AdminSession, userId: string): Promise<string> {
  const previous = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!before) throw new Error(t('protection.err_account_gone'))
    if (before.status !== 'banned' && before.status !== 'suspended') {
      throw new Error(t('protection.err_not_banned'))
    }

    await tx
      .update(users)
      .set({ status: 'active', bannedUntil: null, banReason: null })
      .where(eq(users.id, userId))
    await writeAudit(
      {
        actor,
        action: before.status === 'suspended' ? 'user.unsuspend' : 'user.unban',
        entityType: 'user',
        entityId: userId,
        before: { status: before.status, reason: before.banReason },
        after: { status: 'active' },
      },
      tx,
    )
    return before.status
  })
  await logActivity({
    action: previous === 'suspended' ? 'unsuspended' : 'unbanned',
    userId,
    ip: actor.ipAddress,
    details: { by: actor.userId },
  })
  return previous === 'suspended'
    ? t('protection.ok_suspension_lifted')
    : t('protection.ok_ban_lifted')
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

  await run(customerHref(userId), async (t) => {
    const deviceId = fuuid(form, 'deviceId', t('protection.label_device'))
    const mode = fenum(form, 'mode', ['revoke', 'ban', 'ban_all'] as const, 'revoke')

    const [device] = await db
      .select()
      .from(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)))
      .limit(1)
    if (!device) throw new Error(t('protection.err_device_not_owned'))

    const result = await revokeDevice(deviceId, {
      userId,
      status: mode === 'revoke' ? 'revoked' : 'banned',
      reason: `admin_${mode}`,
    })

    if (mode === 'ban_all') {
      const reason = fstr(form, 'reason') ?? t('protection.default_device_ban_reason')
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
      ? t('protection.ok_device_revoked')
      : mode === 'ban'
        ? t('protection.ok_device_banned')
        : t('protection.ok_device_banned_all')
  })
}

export async function liftDeviceBan(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(PROTECTION, async (t) => {
    const id = fuuid(form, 'banId', t('protection.label_ban'))
    const [row] = await db
      .update(bannedDevices)
      .set({ liftedAt: new Date(), liftedBy: actor.userId })
      .where(and(eq(bannedDevices.id, id), isNull(bannedDevices.liftedAt)))
      .returning()
    if (!row) throw new Error(t('protection.err_ban_inactive'))
    await writeAudit({
      actor,
      action: 'device_ban.lift',
      entityType: 'banned_device',
      entityId: id,
      before: { reason: row.reason },
      after: { lifted: true },
    })
    return t('protection.ok_device_ban_lifted')
  })
}

/* --------------------------------------------------------------------------
   IP
   -------------------------------------------------------------------------- */

export async function banIp(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(PROTECTION, async (t) => {
    const ip = normalizeIp(freq(form, 'ip', t('protection.ip_address')))
    if (ip === null) throw new Error(t('protection.err_invalid_ip'))
    if (ip === actor.ipAddress) throw new Error(t('protection.err_own_ip'))
    const reason = freq(form, 'reason', t('protection.reason')).slice(0, 500)
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
    return t('protection.ok_ip_banned', { ip, duration: t(`protection.duration_${duration}`) })
  })
}

export async function liftIpBan(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(PROTECTION, async (t) => {
    const id = fuuid(form, 'banId', t('protection.label_ban'))
    const [row] = await db
      .update(bannedIps)
      .set({ liftedAt: new Date(), liftedBy: actor.userId })
      .where(and(eq(bannedIps.id, id), isNull(bannedIps.liftedAt)))
      .returning()
    if (!row) throw new Error(t('protection.err_ban_inactive'))
    await writeAudit({
      actor,
      action: 'ip_ban.lift',
      entityType: 'banned_ip',
      entityId: id,
      before: { ip: row.ip, reason: row.reason },
      after: { lifted: true },
    })
    return t('protection.ok_ip_ban_lifted', { ip: row.ip })
  })
}

/* --------------------------------------------------------------------------
   الإعدادات
   -------------------------------------------------------------------------- */

export async function saveSecuritySettings(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(PROTECTION, async (t) => {
    const value = parseSetting('security', {
      newDevicePolicy: fenum(form, 'newDevicePolicy', NEW_DEVICE_POLICIES, 'block'),
      defaultDeviceLimit: fint(form, 'defaultDeviceLimit', 2, t('protection.default_device_limit')),
      pdfDownloads: fenum(form, 'pdfDownloads', PDF_DOWNLOAD_MODES, 'allow'),
      maxDownloadsPerItem: fint(
        form,
        'maxDownloadsPerItem',
        0,
        t('protection.label_download_limit'),
      ),
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
    return t('protection.ok_settings_saved')
  })
}

/* --------------------------------------------------------------------------
   التنبيهات
   -------------------------------------------------------------------------- */

export async function reviewAlert(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(adminHref('/protection/alerts'), async (t) => {
    const id = fuuid(form, 'alertId', t('protection.label_alert'))
    const status = fenum(form, 'status', ['dismissed', 'actioned'] as const, 'dismissed')
    const [row] = await db
      .update(securityAlerts)
      .set({ status, reviewedBy: actor.userId, reviewedAt: new Date() })
      .where(and(eq(securityAlerts.id, id), eq(securityAlerts.status, 'open')))
      .returning({ rule: securityAlerts.rule, subject: securityAlerts.subject })
    if (!row) throw new Error(t('protection.err_alert_closed'))
    await writeAudit({
      actor,
      action: `alert.${status}`,
      entityType: 'security_alert',
      entityId: id,
      before: { status: 'open' },
      after: { status, rule: row.rule, subject: row.subject },
    })
    return status === 'dismissed'
      ? t('protection.ok_alert_dismissed')
      : t('protection.ok_alert_actioned')
  })
}

/* --------------------------------------------------------------------------
   الجلسات
   -------------------------------------------------------------------------- */

export async function endSession(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(adminHref('/protection/sessions'), async (t) => {
    const sessionId = fuuid(form, 'sessionId', t('protection.label_session'))
    if (sessionId === actor.sessionId) {
      throw new Error(t('protection.err_own_session'))
    }
    const [before] = await db.delete(sessions).where(eq(sessions.id, sessionId)).returning()
    if (!before) throw new Error(t('protection.err_session_gone'))
    await clearSessionVerification(sessionId)
    await writeAudit({
      actor,
      action: 'user.session_revoke',
      entityType: 'user',
      entityId: before.userId,
      before: { sessionId, ipAddress: before.ipAddress, deviceId: before.deviceId },
      after: null,
    })
    return t('protection.ok_session_ended')
  })
}

/* --------------------------------------------------------------------------
   موافقة الإدارة على جهاز جديد (الوثيقة 14.2)
   -------------------------------------------------------------------------- */

export async function decideDevice(form: FormData): Promise<void> {
  const actor = await requireCapability('security.write')
  await run(adminHref('/protection/devices?status=pending'), async (t) => {
    const deviceId = fuuid(form, 'deviceId', t('protection.label_device'))
    const decision = fenum(form, 'decision', ['approve', 'reject'] as const, 'reject')
    const [device] = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1)
    if (!device) throw new Error(t('protection.err_device_gone'))
    const rejected = device.status === 'revoked' && device.revokedReason === REJECTED_REASON
    if (device.status !== 'pending' && !(rejected && decision === 'approve')) {
      throw new Error(t('protection.err_device_not_pending'))
    }

    if (decision === 'approve') {
      if ((await approveDevice(deviceId)) === null) {
        throw new Error(t('protection.err_device_changed'))
      }
    } else {
      await revokeDevice(deviceId, {
        userId: device.userId,
        status: 'revoked',
        reason: REJECTED_REASON,
      })
    }
    await writeAudit({
      actor,
      action: `device.${decision}`,
      entityType: 'user',
      entityId: device.userId,
      before: { deviceId, status: device.status, browser: device.browser, os: device.os },
      after: { status: decision === 'approve' ? 'active' : 'revoked' },
    })
    // IP المدير لا يُنسب لسجل العميل. الموافقة تُحسب "جهازاً جديداً" مرة واحدة
    // (طلب الانتظار سُجّل `device_pending` ولا تعدّه قواعد الحماية).
    await logActivity({
      action: decision === 'approve' ? 'new_device' : 'device_revoked',
      userId: device.userId,
      deviceId,
      ip: null,
      details: { by: actor.userId, decision, adminApproval: true },
    })
    return decision === 'approve'
      ? t('protection.ok_device_approved')
      : t('protection.ok_device_rejected')
  })
}
