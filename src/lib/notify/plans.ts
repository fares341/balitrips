/**
 * إشعار "تفعيل الباقة" (`plan_activated`) لكل منح وصول خارج شراء باقة:
 * جدول يشمل الخريطة، منح يدوي من الإدارة (صلاحية أو باقة).
 *
 * شراء الباقة نفسه يُبلَّغ في `notifyOrderPaid` (./orders). يُستدعى **بعد**
 * التزام المعاملة التي منحت الصلاحية. لا يرمي أبداً.
 */

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { plans, users } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { pick } from '@/lib/content/localize'
import { toMailLocale, translator } from '@/lib/email'

import { notifyUser } from './index'

/**
 * اسم الوصول بلغة العميل: اسم الباقة إن وُجدت، وإلا اسم نوع الصلاحية
 * (`vip` → "VIP · Hidden Gems"، غيره → "Interactive Map access").
 */
export function accessLabel(
  planName: Parameters<typeof pick>[0] | null | undefined,
  kind: string | null | undefined,
  locale: Locale,
): string {
  const fromPlan = planName ? pick(planName, locale) : ''
  if (fromPlan !== '') return fromPlan
  const t = translator(locale) as unknown as (key: string) => string
  try {
    return t(kind === 'vip' ? 'sub_vip_t' : 'acct_subs_map')
  } catch {
    return kind === 'vip' ? 'VIP' : 'Map access'
  }
}

export async function notifyPlanActivated(
  userId: string,
  grant: { kind: string; planId?: string | null; entitlementId?: string | null },
): Promise<void> {
  try {
    const [user] = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user) return
    let planName: Parameters<typeof pick>[0] | null = null
    if (grant.planId) {
      const [plan] = await db
        .select({ name: plans.name })
        .from(plans)
        .where(eq(plans.id, grant.planId))
        .limit(1)
      planName = plan?.name ?? null
    }
    const locale = toMailLocale(user.locale)
    await notifyUser(
      userId,
      'plan_activated',
      {
        plan: accessLabel(planName, grant.kind, locale),
        ...(grant.entitlementId ? { entitlementId: grant.entitlementId } : {}),
      },
      '/map',
    )
  } catch (error) {
    console.error('[notify] plan activated notification failed', { userId, error })
  }
}
