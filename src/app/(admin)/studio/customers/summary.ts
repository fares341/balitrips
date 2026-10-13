import { and, desc, eq, gt, inArray, isNull, lte, max, or } from 'drizzle-orm'

import { db } from '@/db'
import { activityLog, entitlements, plans, sessions } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { pick } from '@/lib/content/localize'

import type { Translate } from '../../_i18n'

/**
 * "الباقة الحالية" و"آخر دخول" لقائمة العملاء وصفحة العميل (الوثيقة 21.2).
 *
 * آخر دخول: أحدث `login` في سجل النشاط، وإلا أحدث جلسة (السجل يُقلَّم بعد مدة
 * الاحتفاظ، والجلسات تبقى). استعلامان مجمّعان لصفحة كاملة، لا استعلام لكل صف.
 */

export interface LiveAccess {
  id: string
  kind: string
  /** اسم الباقة بلغة الاستوديو، أو null لمنح بلا باقة. */
  plan: string | null
  expiresAt: Date | null
  /** نسخة من باقة عائلية يملكها شخص آخر. */
  shared: boolean
}

export interface AccountSummary {
  lastLogin: Date | null
  access: LiveAccess[]
}

export async function loadAccountSummaries(
  userIds: readonly string[],
  locale: Locale = 'en',
): Promise<Map<string, AccountSummary>> {
  const out = new Map<string, AccountSummary>()
  if (userIds.length === 0) return out
  const ids = [...userIds]
  const now = new Date()

  const [logins, sessionRows, accessRows] = await Promise.all([
    db
      .select({ userId: activityLog.userId, at: max(activityLog.createdAt) })
      .from(activityLog)
      .where(and(inArray(activityLog.userId, ids), eq(activityLog.action, 'login')))
      .groupBy(activityLog.userId),
    db
      .select({ userId: sessions.userId, at: max(sessions.createdAt) })
      .from(sessions)
      .where(inArray(sessions.userId, ids))
      .groupBy(sessions.userId),
    db
      .select({
        id: entitlements.id,
        userId: entitlements.userId,
        kind: entitlements.kind,
        planName: plans.name,
        expiresAt: entitlements.expiresAt,
        sharedByUserId: entitlements.sharedByUserId,
      })
      .from(entitlements)
      .leftJoin(plans, eq(plans.id, entitlements.planId))
      .where(
        and(
          inArray(entitlements.userId, ids),
          isNull(entitlements.revokedAt),
          lte(entitlements.startsAt, now),
          or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
        ),
      )
      .orderBy(desc(entitlements.startsAt)),
  ])

  const entry = (userId: string): AccountSummary => {
    let found = out.get(userId)
    if (!found) {
      found = { lastLogin: null, access: [] }
      out.set(userId, found)
    }
    return found
  }
  const later = (a: Date | null, b: Date | string | null): Date | null => {
    const next = b === null ? null : new Date(b)
    if (next === null || Number.isNaN(next.getTime())) return a
    return a === null || next > a ? next : a
  }

  for (const row of logins) {
    if (row.userId) entry(row.userId).lastLogin = later(entry(row.userId).lastLogin, row.at)
  }
  for (const row of sessionRows) {
    const summary = entry(row.userId)
    // سجل النشاط هو المصدر الأدق؛ الجلسة بديل فقط حين لا سجل.
    if (summary.lastLogin === null) summary.lastLogin = later(null, row.at)
  }
  for (const row of accessRows) {
    entry(row.userId).access.push({
      id: row.id,
      kind: row.kind,
      plan: row.planName ? pick(row.planName, locale) || null : null,
      expiresAt: row.expiresAt,
      shared: row.sharedByUserId !== null,
    })
  }
  return out
}

/** سطر قصير: "VIP plan (until 1 Nov 2026)" أو "Map access (lifetime)" — بلغة الاستوديو. */
export function accessLine(access: LiveAccess, t: Translate, intl: string): string {
  const until = access.expiresAt
    ? t('customers.access_until', {
        date: new Intl.DateTimeFormat(intl, {
          dateStyle: 'medium',
          timeZone: 'Asia/Makassar',
        }).format(access.expiresAt),
      })
    : t('customers.access_lifetime')
  const kindKey = `customers.kind_${access.kind}`
  const kind = t(kindKey) === kindKey ? access.kind : t(kindKey)
  return t(access.shared ? 'customers.access_line_family' : 'customers.access_line', {
    plan: access.plan ?? kind,
    until,
  })
}
