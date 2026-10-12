/**
 * تسليم الإشعارات: بريد (`email.send` بنوع `notification`)، واتساب
 * (`whatsapp.send`)، وتذكير انتهاء الباقة اليومي (`notify.sweep`).
 *
 * كل مهمة تحمل `notificationId` فقط وتعيد قراءة كل شيء: المستخدم ربما حذف
 * حسابه، أو سحب موافقته على واتساب، بين الإدراج والتنفيذ.
 *
 * عدم التكرار: كل قناة تسجّل `notify.<channel>` في `audit_log` بمعرّف الإشعار؛
 * إعادة المحاولة بعد نجاح لا ترسل مرتين.
 */

import { and, eq, gt, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm'

import { db } from '@/db'
import { auditLog, entitlements, notifications, plans, users } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { pick } from '@/lib/content/localize'
import { renderNotificationEmail, sendEmail, toMailLocale } from '@/lib/email'
import { isElevated, isRole } from '@/lib/auth/roles'
import { isPlaceholderEmail } from '@/lib/auth/phone'
import { notifyUser } from '@/lib/notify'
import { isNotificationType } from '@/lib/notify/types'
import { sendWhatsappTemplate, toWhatsappNumber } from '@/lib/notify/whatsapp'

import type { NotifySweepJob, WhatsappJob } from '../queues'

function origin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

function adminBase(): string {
  return (process.env.ADMIN_BASE_PATH ?? '/studio').replace(/\/+$/, '')
}

async function delivered(notificationId: string, channel: string): Promise<boolean> {
  const [row] = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, `notify.${channel}`),
        eq(auditLog.entityType, 'notification'),
        eq(auditLog.entityId, notificationId),
      ),
    )
    .limit(1)
  return row !== undefined
}

async function recordDelivery(notificationId: string, channel: string, to: string): Promise<void> {
  await db.insert(auditLog).values({
    actorId: null,
    action: `notify.${channel}`,
    entityType: 'notification',
    entityId: notificationId,
    before: null,
    after: { to },
  })
}

async function load(notificationId: string) {
  const [row] = await db
    .select({ notification: notifications, user: users })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.userId))
    .where(eq(notifications.id, notificationId))
    .limit(1)
  return row ?? null
}

/** مستلمو إشعارات الفريق: `STAFF_ALERT_EMAILS`، وإلا كل مدير. */
async function staffRecipients(): Promise<
  { email: string; phone: string | null; locale: Locale }[]
> {
  const configured = (process.env.STAFF_ALERT_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.includes('@'))
  const rows = await db
    .select({ email: users.email, phone: users.phone, locale: users.locale, role: users.role })
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        configured.length > 0 ? inArray(users.email, configured) : eq(users.role, 'admin'),
      ),
    )
  const found = rows
    .filter((row) => configured.length > 0 || (isRole(row.role) && isElevated(row.role)))
    .map((row) => ({ email: row.email, phone: row.phone, locale: toMailLocale(row.locale) }))
  // عنوان مُعدّ بلا حساب (بريد مشترك للفريق) يستلم أيضاً.
  for (const email of configured) {
    if (!found.some((row) => row.email === email)) found.push({ email, phone: null, locale: 'en' })
  }
  return found
}

export async function sendNotificationEmail(notificationId: string): Promise<void> {
  if (await delivered(notificationId, 'email')) return
  const row = await load(notificationId)
  if (row === null) return
  const { notification, user } = row
  const params = notification.params ?? {}

  if (notification.audience === 'staff') {
    const href = notification.href ? `${origin()}${adminBase()}${notification.href}` : null
    const recipients = await staffRecipients()
    for (const recipient of recipients) {
      const rendered = renderNotificationEmail({
        locale: recipient.locale,
        name: null,
        type: notification.type,
        params,
        url: href,
      })
      const result = await sendEmail({ to: recipient.email, ...rendered })
      if (!result.delivered)
        throw new Error(`staff mail not delivered: ${result.error ?? 'unknown'}`)
    }
    await recordDelivery(notificationId, 'email', recipients.map((r) => r.email).join(','))
    return
  }

  if (!user || user.deletedAt !== null) return
  // Phone-only account: no mailbox — the bell and WhatsApp carry it instead.
  if (isPlaceholderEmail(user.email)) return
  const locale = toMailLocale(user.locale)
  const rendered = renderNotificationEmail({
    locale,
    name: user.name,
    type: notification.type,
    params,
    url: notification.href
      ? `${origin()}${getPathname({ href: notification.href, locale })}`
      : null,
  })
  const result = await sendEmail({ to: user.email, ...rendered })
  if (!result.delivered)
    throw new Error(`notification mail not delivered: ${result.error ?? 'unknown'}`)
  await recordDelivery(notificationId, 'email', user.email)
}

export async function handleWhatsappJob(job: WhatsappJob): Promise<void> {
  if (await delivered(job.notificationId, 'whatsapp')) return
  const row = await load(job.notificationId)
  if (row === null) return
  const { notification, user } = row
  if (!isNotificationType(notification.type)) return
  const params = notification.params ?? {}

  if (notification.audience === 'staff') {
    const to = toWhatsappNumber(process.env.STAFF_WHATSAPP_NUMBER)
    const result = await sendWhatsappTemplate(to, notification.type, params, 'en')
    if (result.sent) await recordDelivery(job.notificationId, 'whatsapp', to ?? '')
    return
  }

  // موافقة صريحة فقط (سياسة Meta). بلا موافقة لا نرسل حتى رسالة تشغيلية.
  if (!user || user.deletedAt !== null || !user.whatsappOptIn) return
  const to = toWhatsappNumber(user.phone)
  const result = await sendWhatsappTemplate(to, notification.type, params, user.locale)
  if (result.sent) await recordDelivery(job.notificationId, 'whatsapp', to ?? '')
  else if (result.reason === 'rejected') {
    console.warn('[whatsapp] template rejected', { type: notification.type, detail: result.detail })
  }
}

/**
 * تذكير قبل انتهاء الباقة بـ 3 أيام (افتراضياً). مرة واحدة لكل صلاحية:
 * `params.entitlementId` يمنع التكرار بين تشغيلين.
 */
export async function handleNotifySweep(job: NotifySweepJob): Promise<{ reminded: number }> {
  const withinDays = job.withinDays ?? 3
  const now = new Date()
  const horizon = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000)

  const expiring = await db
    .select({
      id: entitlements.id,
      userId: entitlements.userId,
      expiresAt: entitlements.expiresAt,
      planName: plans.name,
      locale: users.locale,
    })
    .from(entitlements)
    .innerJoin(users, eq(users.id, entitlements.userId))
    .leftJoin(plans, eq(plans.id, entitlements.planId))
    .where(
      and(
        isNull(entitlements.revokedAt),
        isNotNull(entitlements.expiresAt),
        gt(entitlements.expiresAt, now),
        lte(entitlements.expiresAt, horizon),
        isNull(users.deletedAt),
        sql`not exists (
          select 1 from ${notifications} n
          where n.type = 'plan_expiring' and n.params->>'entitlementId' = ${entitlements.id}::text
        )`,
      ),
    )

  for (const row of expiring) {
    const locale = toMailLocale(row.locale)
    await notifyUser(
      row.userId,
      'plan_expiring',
      {
        entitlementId: row.id,
        plan: row.planName ? pick(row.planName, locale) : 'Map access',
        date: (row.expiresAt ?? now).toISOString().slice(0, 10),
      },
      '/plans',
    )
  }
  console.info('[notify] expiry sweep', { reminded: expiring.length })
  return { reminded: expiring.length }
}
