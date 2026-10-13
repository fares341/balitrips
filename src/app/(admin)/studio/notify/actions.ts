'use server'

import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { entitlements, users } from '@/db/schema'
import { notifyUser } from '@/lib/notify'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fbool, fenum, freq, fstr } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome, type ActionOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

const PAGE = adminHref('/notify')
const AUDIENCES = ['user', 'customers', 'plan_holders'] as const
/** حد أمان لإرسال جماعي واحد. */
const MAX_RECIPIENTS = 20_000
const BATCH = 50

/**
 * إرسال إشعار يدوي من الإدارة (الوثيقة 2.5: "إرسال إشعارات").
 * داخل الموقع دائماً؛ البريد وواتساب اختياريان. للمدير فقط.
 */
export async function sendAdminNotification(form: FormData): Promise<void> {
  const actor = await requireCapability('roles.write')
  const { t } = await getAdminI18n()
  let outcome: ActionOutcome
  try {
    const audience = fenum(form, 'audience', AUDIENCES, 'user')
    const title = freq(form, 'title', t('notify.title_label')).trim().slice(0, 120)
    const body = freq(form, 'body', t('notify.message')).trim().slice(0, 1000)
    const rawHref = fstr(form, 'href')
    // رابط داخلي فقط — لا روابط خارجية في إشعارات تحمل اسم الموقع.
    // `/\evil.com` يطبّعه المتصفح إلى `//evil.com`، فيُرفض أي `/` يليه `/` أو `\`.
    const href = rawHref && /^\/(?![/\\])/.test(rawHref) ? rawHref : null
    const channels = { email: fbool(form, 'email'), whatsapp: fbool(form, 'whatsapp') }

    let recipients: string[]
    if (audience === 'user') {
      const email = freq(form, 'email_address', t('notify.customer_email')).trim().toLowerCase()
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt)))
        .limit(1)
      if (!user) throw new Error(t('notify.err_no_account', { email }))
      recipients = [user.id]
    } else if (audience === 'customers') {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'customer'), isNull(users.deletedAt), eq(users.status, 'active')))
        .limit(MAX_RECIPIENTS)
      recipients = rows.map((row) => row.id)
    } else {
      const now = new Date()
      const rows = await db
        .selectDistinct({ id: entitlements.userId })
        .from(entitlements)
        .innerJoin(users, eq(users.id, entitlements.userId))
        .where(
          and(
            isNull(entitlements.revokedAt),
            or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
            isNull(users.deletedAt),
          ),
        )
        .limit(MAX_RECIPIENTS)
      recipients = rows.map((row) => row.id)
    }
    if (recipients.length === 0) throw new Error(t('notify.err_no_recipients'))

    let sent = 0
    for (let index = 0; index < recipients.length; index += BATCH) {
      const chunk = recipients.slice(index, index + BATCH)
      const ids = await Promise.all(
        chunk.map((userId) => notifyUser(userId, 'admin_message', { title, body }, href, channels)),
      )
      sent += ids.filter((id) => id !== null).length
    }

    await writeAudit({
      actor,
      action: 'notification.send',
      entityType: 'notification',
      entityId: null,
      before: null,
      after: { audience, recipients: recipients.length, sent, channels, title },
    })
    outcome = { ok: t('notify.ok_sent', { sent, total: recipients.length }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(PAGE, outcome))
}
