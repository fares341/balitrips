/**
 * سجل نشاط المستخدم.
 *
 * يختلف عن `audit_log`: ذاك يسجّل تعديلات الإدارة (قبل/بعد)، وهذا يسجّل ما
 * يفعله المستخدمون — وهو ما سيعتمد عليه نظام الحظر التلقائي في الدفعة القادمة.
 *
 * **الكتابة لا تُفشل الطلب أبداً.** خطأ في كتابة السجل يُطبع ويُبتلع: تحميل
 * PDF دفع العميل ثمنه لا يجب أن يفشل لأن جدول السجل ممتلئ أو مقفل.
 */

import { db } from '@/db'
import { activityLog } from '@/db/schema'

export const ACTIVITY_ACTIONS = [
  'login',
  'logout',
  'login_failed',
  'login_blocked',
  'new_device',
  'device_evicted',
  'device_limit_blocked',
  /** جهاز فوق الحد ينتظر موافقة الإدارة (سياسة require_approval). */
  'device_pending',
  'device_revoked',
  'open_map',
  'search_map',
  'view_place',
  'save_place',
  'add_to_trip',
  'view_pdf',
  'download_pdf',
  'unauthorized_access',
  'change_password',
  'purchase',
  'update_request',
  'banned',
  'unbanned',
  /** تعليق تلقائي لحين مراجعة الإدارة (الوثيقة 18.2)، ورفعه. */
  'suspended',
  'unsuspended',
  /** الوثيقة 15.1/19.1: الإدارة غيّرت حالة طلب العميل (تأكيد، تنفيذ، استرداد، إلغاء). */
  'update_order',
  /** الوثيقة 15.2: "الصفحات التي زارها". */
  'page_view',
] as const

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number]

export function isActivityAction(value: string): value is ActivityAction {
  return (ACTIVITY_ACTIONS as readonly string[]).includes(value)
}

export interface ActivityEntry {
  action: ActivityAction
  userId?: string | null
  ip?: string | null
  deviceId?: string | null
  details?: Record<string, unknown> | null
}

/** حد حجم التفاصيل — السجل ليس مكاناً لتخزين أجسام الطلبات. */
const MAX_DETAILS_CHARS = 4000

function boundedDetails(details: Record<string, unknown> | null | undefined) {
  if (details === null || details === undefined) return null
  const text = JSON.stringify(details)
  return text.length <= MAX_DETAILS_CHARS
    ? details
    : { truncated: text.slice(0, MAX_DETAILS_CHARS) }
}

export async function logActivity(entry: ActivityEntry): Promise<void> {
  try {
    await db.insert(activityLog).values({
      action: entry.action,
      userId: entry.userId ?? null,
      ip: entry.ip ?? null,
      deviceId: entry.deviceId ?? null,
      details: boundedDetails(entry.details),
    })
  } catch (error) {
    console.error('[activity] failed to record', entry.action, error)
    return
  }

  // الحظر التلقائي (./rules). استيراد ديناميكي لأن rules تستورد أنواع هذا
  // الملف، ولأن معظم الأحداث (فتح الخريطة، تحميل PDF) لا تحتاجه أصلاً.
  if (RULE_TRIGGERS.has(entry.action)) {
    const { evaluateSecurityRules } = await import('./rules')
    await evaluateSecurityRules(entry)
  }
}

/** نسخة من `TRIGGER_ACTIONS` في ./rules — مكررة هنا لتفادي استيراده لكل حدث. */
export const RULE_TRIGGERS: ReadonlySet<ActivityAction> = new Set<ActivityAction>([
  'login_failed',
  'new_device',
  'device_limit_blocked',
  'device_pending',
  'login',
  'unauthorized_access',
])
