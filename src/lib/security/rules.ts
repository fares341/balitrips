/**
 * الحظر التلقائي وكشف السلوك المشبوه.
 *
 * يُستدعى من `logActivity()` بعد تسجيل أي حدث في `TRIGGER_ACTIONS`. كل قاعدة
 * تعدّ أحداثاً في نافذة زمنية من `activity_log` (استعلامات مفهرسة)، وعند
 * بلوغ العتبة تفتح تنبيهاً في `security_alerts`، وبعضها ينفّذ إجراءً تلقائياً.
 *
 * مبادئ:
 *  - **لا حظر تلقائي يستطيع المهاجم توجيهه ضد ضحية.** محاولات الدخول
 *    الفاشلة على حساب ما لا تحظر الحساب (وإلا يكفي أن يكتب أحد بريدك خطأً
 *    20 مرة ليقفلك) — تحظر الـ IP المهاجِم وتنبّه فقط.
 *  - **الحسابات الإدارية لا تُحظر تلقائياً** — تنبيه فقط. قفل آخر مدير خارج
 *    النظام لا يُصلح إلا من قاعدة البيانات.
 *  - **الحظر التلقائي مؤقت دائماً.** الدائم قرار بشري. الاستثناء `suspend_user`:
 *    تعليق بلا مدة **لحين مراجعة الإدارة** (الوثيقة 18.2) — ليس حكماً نهائياً بل
 *    إيقاف حتى يقرر إنسان، ويُرفع من Studio → Protection. يُستخدم فقط لقواعد لا
 *    يبلغها إلا من يملك الحساب فعلاً (بعد كلمة مرور صحيحة أو بجلسة قائمة).
 *  - يمكن إيقاف كل الإجراءات التلقائية من Studio → Protection (`autoBan`)؛
 *    التنبيهات تستمر.
 *  - تنبيه مفتوح واحد لكل (قاعدة، موضوع) خلال 24 ساعة: التكرار يزيد `hits`،
 *    والإجراء التلقائي لا يتكرر.
 */

import { and, countDistinct, eq, gte, inArray, sql } from 'drizzle-orm'

import { readSetting } from '@/app/(admin)/_lib/settings'
import { db } from '@/db'
import { activityLog, bannedIps, securityAlerts, sessions, users } from '@/db/schema'
import { isElevated, isRole } from '@/lib/auth/roles'

import type { ActivityAction, ActivityEntry } from './activity'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export type Severity = 'low' | 'medium' | 'high'
export type AutoAction = 'ban_ip_1h' | 'ban_user_24h' | 'suspend_user' | null

export interface RuleSpec {
  id: string
  /** الأحداث التي تُعدّ لهذه القاعدة. */
  counts: readonly ActivityAction[]
  /** على من نعدّ. */
  by: 'user' | 'ip'
  /** `distinct_ip` يعدّ عناوين IP مختلفة بدل عدد الأحداث. */
  measure: 'events' | 'distinct_ip' | 'distinct_device'
  windowMs: number
  threshold: number
  severity: Severity
  autoAction: AutoAction
  /** فلتر إضافي على `details->>'why'`. */
  why?: readonly string[]
  /**
   * إشعار الفريق عند فتح التنبيه حتى لو لم تكن الخطورة `high` (الوثيقة 19.2).
   * التنبيهات عالية الخطورة تُبلَّغ دائماً.
   */
  notifyStaff?: boolean
  label: string
}

export const RULES: readonly RuleSpec[] = [
  {
    id: 'failed_logins_ip',
    counts: ['login_failed'],
    by: 'ip',
    measure: 'events',
    // Better Auth يسمح بـ 5 محاولات / 5 دقائق لكل IP (server.ts)، أي 12 في
    // الساعة كحد أقصى تقريباً. عتبة أعلى من ذلك لن تُبلغ أبداً. مستخدم حقيقي
    // لا يخطئ 12 مرة في ساعة؛ المهاجم الصبور يصل إليها.
    windowMs: HOUR,
    threshold: 12,
    severity: 'high',
    autoAction: 'ban_ip_1h',
    label: 'Many failed sign-ins from one IP (credential stuffing)',
  },
  {
    id: 'failed_logins_account',
    counts: ['login_failed'],
    by: 'user',
    measure: 'events',
    windowMs: 15 * MINUTE,
    threshold: 10,
    severity: 'medium',
    autoAction: null,
    label: 'Many failed sign-ins on one account',
  },
  {
    /**
     * أجهزة مختلفة سُجّلت فعلاً خلال أسبوع. كانت القاعدة تعدّ كل حدث (أول جهاز
     * عند التسجيل، كل طرد، كل محاولة مرفوضة) فيُحظر مستخدم عادي غيّر هاتفه
     * وضغط "دخول" أربع مرات — ومعه يضيع طريق إزالة الجهاز القديم. الآن: 6
     * أجهزة مختلفة في أسبوع = مشاركة حساب حقيقية.
     */
    id: 'device_churn',
    counts: ['new_device'],
    by: 'user',
    measure: 'distinct_device',
    windowMs: 7 * DAY,
    threshold: 6,
    severity: 'high',
    autoAction: 'ban_user_24h',
    label: 'Account keeps switching devices (likely shared)',
  },
  {
    /**
     * محاولات متكررة من أجهزة فوق الحد (محاولات مشاركة، الوثيقة 18.1): تعليق
     * الحساب لحين المراجعة. لا يبلغها المهاجم ضد ضحية: الحدثان يُسجَّلان فقط بعد
     * كلمة مرور صحيحة (`session.create.before`).
     */
    id: 'device_limit_hits',
    counts: ['device_limit_blocked', 'device_pending'],
    by: 'user',
    measure: 'events',
    windowMs: DAY,
    threshold: 10,
    severity: 'medium',
    autoAction: 'suspend_user',
    notifyStaff: true,
    label: 'Repeated sign-ins from devices over the limit',
  },
  {
    id: 'ip_spread',
    counts: ['login'],
    by: 'user',
    measure: 'distinct_ip',
    windowMs: DAY,
    threshold: 6,
    severity: 'medium',
    // تنبيه فقط (المسافر يتنقل بين شبكات الفنادق والجوال)، لكن الفريق يُبلَّغ.
    autoAction: null,
    notifyStaff: true,
    label: 'Sign-ins from many different IPs in a day',
  },
  {
    id: 'unauthorized_probe',
    counts: ['unauthorized_access'],
    by: 'user',
    measure: 'events',
    windowMs: HOUR,
    threshold: 15,
    severity: 'medium',
    // الوثيقة 18.2/19.2: محاولات متكررة لمحتوى غير مملوك → تعليق لحين المراجعة
    // + تنبيه الفريق. تحتاج جلسة قائمة، فلا يوجّهها أحد ضد حساب غيره.
    autoAction: 'suspend_user',
    notifyStaff: true,
    // Only content the account never bought. A paying customer re-opening a
    // file past its download/view cap is not probing — see limit_exhausted.
    why: ['not_entitled'],
    label: 'Repeated attempts to open content the account does not own',
  },
  {
    /** حدود التنزيل/المشاهدة المستنفدة: تنبيه للفريق فقط، بلا تعليق للعميل الذي دفع. */
    id: 'limit_exhausted',
    counts: ['unauthorized_access'],
    by: 'user',
    measure: 'events',
    windowMs: HOUR,
    threshold: 15,
    severity: 'low',
    autoAction: null,
    notifyStaff: true,
    why: ['download_limit', 'view_limit'],
    label: 'Repeated opens of a file past its download or view limit',
  },
  {
    /**
     * جهاز أُزيل ما زال يطلب المحتوى. منفصلة عن unauthorized_probe لأنها **لا
     * تعلّق**: جهاز طُرد بسياسة `evict_oldest` وخريطته مفتوحة يطلب البيانات كل
     * دقيقة — تعليق صاحب الحساب بسببه عقاب للضحية لا للمشارك. تنبيه للمراجعة.
     */
    id: 'revoked_device_use',
    counts: ['unauthorized_access'],
    by: 'user',
    measure: 'events',
    windowMs: HOUR,
    threshold: 15,
    severity: 'low',
    autoAction: null,
    why: ['device_revoked'],
    label: 'A removed device keeps requesting paid content',
  },
  {
    /**
     * نسخ المحتوى آلياً (الوثيقة 18.2: نشاط غير طبيعي). يعدّ فتح الأماكن والبحث
     * في الخريطة فقط — `page_view` يُسجَّل لكل صفحة، وتقييم القواعد عليه يضيف
     * استعلاماً لكل زيارة بلا فائدة: الكاشط يحتاج بيانات الأماكن، وهي تمر من هنا.
     * 300 حدث في 10 دقائق = حدث كل ثانيتين بلا توقف؛ لا يبلغه متصفح بشري.
     * تنبيه للفريق فقط: لا تعليق تلقائي لعميل دفع بسبب حجم استخدام.
     */
    id: 'content_scrape',
    counts: ['view_place', 'search_map'],
    by: 'user',
    measure: 'events',
    windowMs: 10 * MINUTE,
    threshold: 300,
    severity: 'medium',
    autoAction: null,
    notifyStaff: true,
    label: 'Unusually high volume of place views and map searches (possible scraping)',
  },
]

export const TRIGGER_ACTIONS: ReadonlySet<ActivityAction> = new Set(
  RULES.flatMap((rule) => rule.counts),
)

/** قرار نقي: هل تجاوز العدد العتبة؟ مفصول للاختبار. */
export function breaches(rule: Pick<RuleSpec, 'threshold'>, observed: number): boolean {
  return observed >= rule.threshold
}

async function measure(rule: RuleSpec, subject: { userId?: string | null; ip?: string | null }) {
  const since = new Date(Date.now() - rule.windowMs)
  const conditions = [
    inArray(activityLog.action, [...rule.counts]),
    gte(activityLog.createdAt, since),
  ]
  if (rule.by === 'user') conditions.push(eq(activityLog.userId, subject.userId as string))
  else conditions.push(eq(activityLog.ip, subject.ip as string))
  if (rule.why !== undefined) {
    conditions.push(inArray(sql<string>`${activityLog.details}->>'why'`, [...rule.why]))
  }

  const [row] = await db
    .select({
      value:
        rule.measure === 'distinct_ip'
          ? countDistinct(activityLog.ip)
          : rule.measure === 'distinct_device'
            ? countDistinct(activityLog.deviceId)
            : sql<number>`count(*)::int`,
    })
    .from(activityLog)
    .where(and(...conditions))
  return Number(row?.value ?? 0)
}

/** يفتح تنبيهاً أو يحدّث المفتوح. يعيد true إذا كان التنبيه جديداً. */
async function raise(
  rule: RuleSpec,
  subject: string,
  values: { userId: string | null; ip: string | null; observed: number },
): Promise<boolean> {
  const since = new Date(Date.now() - DAY)
  const [open] = await db
    .select({ id: securityAlerts.id })
    .from(securityAlerts)
    .where(
      and(
        eq(securityAlerts.rule, rule.id),
        eq(securityAlerts.subject, subject),
        eq(securityAlerts.status, 'open'),
        gte(securityAlerts.updatedAt, since),
      ),
    )
    .limit(1)

  const details = {
    label: rule.label,
    observed: values.observed,
    threshold: rule.threshold,
    windowMinutes: Math.round(rule.windowMs / MINUTE),
  }

  if (open !== undefined) {
    await db
      .update(securityAlerts)
      .set({ hits: sql`${securityAlerts.hits} + 1`, details })
      .where(eq(securityAlerts.id, open.id))
    return false
  }

  await db.insert(securityAlerts).values({
    rule: rule.id,
    severity: rule.severity,
    subject,
    userId: values.userId,
    ip: values.ip,
    details,
  })
  return true
}

async function applyAutoAction(
  rule: RuleSpec,
  subject: string,
  values: { userId: string | null; ip: string | null },
): Promise<AutoAction> {
  if (rule.autoAction === 'ban_ip_1h' && values.ip !== null) {
    await db.insert(bannedIps).values({
      ip: values.ip,
      reason: `Automatic: ${rule.label}`,
      until: new Date(Date.now() + HOUR),
      createdBy: null,
    })
  } else if (rule.autoAction === 'suspend_user' && values.userId !== null) {
    const userId = values.userId
    const [owner] = await db
      .select({ role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    // محظور أو معطّل أو معلّق أصلاً: لا شيء نضيفه. الحسابات الإدارية لا تُعلَّق.
    if (owner === undefined || owner.status !== 'active') return null
    if (isRole(owner.role) && isElevated(owner.role)) return null

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: 'suspended',
          bannedUntil: null,
          banReason: `Automatic (pending review): ${rule.label}`,
        })
        .where(and(eq(users.id, userId), eq(users.status, 'active')))
      await tx.delete(sessions).where(eq(sessions.userId, userId))
    })
    // بعد الالتزام. `suspended` ليس من أحداث القواعد، فلا تقييم متداخل.
    const { logActivity } = await import('./activity')
    await logActivity({
      action: 'suspended',
      userId,
      ip: values.ip,
      details: { rule: rule.id, automatic: true },
    })
  } else if (rule.autoAction === 'ban_user_24h' && values.userId !== null) {
    const [owner] = await db
      .select({ role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, values.userId))
      .limit(1)
    if (owner === undefined || owner.status === 'banned') return null
    if (isRole(owner.role) && isElevated(owner.role)) return null

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: 'banned',
          bannedUntil: new Date(Date.now() + DAY),
          banReason: `Automatic: ${rule.label}`,
        })
        .where(eq(users.id, values.userId as string))
      await tx.delete(sessions).where(eq(sessions.userId, values.userId as string))
    })
  } else {
    return null
  }

  await db
    .update(securityAlerts)
    .set({ autoAction: rule.autoAction })
    .where(
      and(
        eq(securityAlerts.rule, rule.id),
        eq(securityAlerts.subject, subject),
        eq(securityAlerts.status, 'open'),
      ),
    )
  return rule.autoAction
}

/**
 * قيّم القواعد لحدث سُجّل للتو. لا يرمي أبداً — فشل الكشف لا يُفشل الطلب.
 * يعيد الإجراءات التلقائية التي نُفّذت (للسجل والاختبارات).
 */
export async function evaluateSecurityRules(entry: ActivityEntry): Promise<AutoAction[]> {
  const applied: AutoAction[] = []
  try {
    const candidates = RULES.filter((rule) => rule.counts.includes(entry.action))
    if (candidates.length === 0) return applied

    let autoBan: boolean | null = null

    for (const rule of candidates) {
      const key = rule.by === 'user' ? entry.userId : entry.ip
      if (key === null || key === undefined) continue

      const observed = await measure(rule, entry)
      if (!breaches(rule, observed)) continue

      const subject = `${rule.by}:${key}`
      const values = {
        userId: entry.userId ?? null,
        ip: entry.ip ?? null,
        observed,
      }
      const isNew = await raise(rule, subject, values)
      if (isNew && (rule.severity === 'high' || rule.notifyStaff === true)) {
        const { notifyStaff } = await import('@/lib/notify')
        await notifyStaff('staff_security_alert', { rule: rule.id, subject }, '/protection/alerts')
      }
      if (!isNew || rule.autoAction === null) continue

      autoBan ??= (await readSetting('security')).autoBan
      if (!autoBan) continue

      const done = await applyAutoAction(rule, subject, values)
      if (done !== null) {
        applied.push(done)
        console.warn('[security] automatic action', { rule: rule.id, subject, action: done })
      }
    }
  } catch (error) {
    console.error('[security] rule evaluation failed', entry.action, error)
  }
  return applied
}
