/**
 * فحص الحظر: مستخدم، جهاز، IP.
 *
 * يُستدعى في نقطتين: عند إنشاء الجلسة (تسجيل الدخول) وفي `requireSecureAccess()`
 * قبل كل محتوى مدفوع. الثانية هي ما يجعل الحظر فورياً حتى لجلسة قائمة.
 */

import { and, eq, gt, isNull, or } from 'drizzle-orm'

import { db } from '@/db'
import { bannedDevices, bannedIps, users } from '@/db/schema'

export type BanReason = 'user' | 'device' | 'ip'

/** هل ما زال الحظر سارياً؟ `until` = null يعني دائم. */
export function isBanActive(until: Date | string | null | undefined, now = new Date()): boolean {
  if (until === null || until === undefined) return true
  const date = until instanceof Date ? until : new Date(until)
  if (Number.isNaN(date.getTime())) return true // قيمة تالفة: نفشل في الاتجاه الآمن
  return date.getTime() > now.getTime()
}

/** هل المستخدم محظور الآن؟ حظر مؤقت منتهٍ لا يُحتسب. */
export function isUserBanned(
  user: { status: string; bannedUntil: Date | string | null } | null | undefined,
  now = new Date(),
): boolean {
  if (user === null || user === undefined) return false
  return user.status === 'banned' && isBanActive(user.bannedUntil, now)
}

const live = (now: Date) => (until: typeof bannedIps.until | typeof bannedDevices.until) =>
  or(isNull(until), gt(until, now))

export interface BanQuery {
  userId?: string | null
  fingerprintHash?: string | null
  ip?: string | null
}

/** أول سبب حظر ينطبق، أو null. */
export async function findActiveBan(query: BanQuery, now = new Date()): Promise<BanReason | null> {
  const [userRow, deviceRow, ipRow] = await Promise.all([
    query.userId
      ? db
          .select({ status: users.status, bannedUntil: users.bannedUntil })
          .from(users)
          .where(eq(users.id, query.userId))
          .limit(1)
          .then((rows) => rows[0])
      : undefined,
    query.fingerprintHash
      ? db
          .select({ id: bannedDevices.id })
          .from(bannedDevices)
          .where(
            and(
              eq(bannedDevices.fingerprintHash, query.fingerprintHash),
              isNull(bannedDevices.liftedAt),
              live(now)(bannedDevices.until),
            ),
          )
          .limit(1)
          .then((rows) => rows[0])
      : undefined,
    query.ip
      ? db
          .select({ id: bannedIps.id })
          .from(bannedIps)
          .where(
            and(eq(bannedIps.ip, query.ip), isNull(bannedIps.liftedAt), live(now)(bannedIps.until)),
          )
          .limit(1)
          .then((rows) => rows[0])
      : undefined,
  ])

  if (isUserBanned(userRow, now)) return 'user'
  if (deviceRow !== undefined) return 'device'
  if (ipRow !== undefined) return 'ip'
  return null
}
