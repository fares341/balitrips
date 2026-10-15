/**
 * `security.prune` — الاحتفاظ بسجل النشاط.
 *
 * `activity_log` يكبر مع كل دخول وتحميل؛ بلا تنظيف يصبح أكبر جدول في
 * قاعدة بيانات بحجم 1 GiB. الافتراضي 180 يوماً (`ACTIVITY_RETENTION_DAYS`)
 * — أطول من أي نافذة تستخدمها قواعد الحظر (7 أيام) ويغطي نزاعات الدفع
 * المعتادة. التنبيهات المغلقة تُحذف بعد سنة؛ المفتوحة لا تُحذف أبداً.
 *
 * الحذف على دفعات كي لا يقفل الجدول طويلاً.
 */

import { and, inArray, lt, ne, sql } from 'drizzle-orm'

import { db } from '@/db'
import { activityLog, securityAlerts } from '@/db/schema'

import { pruneAssistant } from '@/lib/assistant/store'

import type { SecurityPruneJob } from '../queues'

/** AI assistant conversations: ASSISTANT_RETENTION_DAYS, default 90. */
export function assistantRetentionDays(): number {
  const raw = Number.parseInt(process.env.ASSISTANT_RETENTION_DAYS ?? '', 10)
  return Number.isFinite(raw) && raw >= 1 ? Math.min(raw, 3650) : 90
}

const DAY_MS = 24 * 60 * 60 * 1000
const BATCH = 5000
const MAX_BATCHES = 200

export function retentionDays(override?: number): number {
  if (override !== undefined) return override
  const raw = Number.parseInt(process.env.ACTIVITY_RETENTION_DAYS ?? '', 10)
  return Number.isFinite(raw) && raw >= 7 ? Math.min(raw, 3650) : 180
}

export async function handleSecurityPruneJob(job: SecurityPruneJob) {
  const days = retentionDays(job.retentionDays)
  const cutoff = new Date(Date.now() - days * DAY_MS)

  let activityDeleted = 0
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const batch = db
      .select({ id: activityLog.id })
      .from(activityLog)
      .where(lt(activityLog.createdAt, cutoff))
      .limit(BATCH)
    const deleted = await db
      .delete(activityLog)
      .where(inArray(activityLog.id, batch))
      .returning({ id: activityLog.id })
    activityDeleted += deleted.length
    if (deleted.length < BATCH) break
  }

  const alerts = await db
    .delete(securityAlerts)
    .where(
      and(
        ne(securityAlerts.status, 'open'),
        lt(securityAlerts.updatedAt, sql`now() - interval '365 days'`),
      ),
    )
    .returning({ id: securityAlerts.id })

  // Same daily job: assistant chats past their retention (messages and
  // proposed actions cascade), and the old usage counters.
  const assistant = await pruneAssistant(assistantRetentionDays())

  const summary = {
    retentionDays: days,
    activityDeleted,
    alertsDeleted: alerts.length,
    assistantConversationsDeleted: assistant.conversations,
  }
  console.info('[security] prune complete', summary)
  return summary
}
