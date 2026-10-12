'use server'

/**
 * "شارك رحلتي" (الوثيقة 12.3): إنشاء/تدوير رابط عام، وإيقافه.
 *
 * التدوير يُبطل الرابط القديم فوراً (الرمز نفسه يُستبدل). كل كتابة مقيّدة
 * بـ `user_id` الجلسة — لا معرّف يأتي من النموذج.
 */

import { randomBytes } from 'node:crypto'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import { tripShares } from '@/db/schema'
import { activeUserOrNull } from '@/lib/security/require'

const refresh = () => revalidatePath('/[locale]/account/trip', 'page')

export async function shareTrip(): Promise<void> {
  const user = await activeUserOrNull('trip:share')
  if (user === null) return

  const token = randomBytes(32).toString('base64url')
  await db
    .insert(tripShares)
    .values({ userId: user.id, token })
    .onConflictDoUpdate({
      target: tripShares.userId,
      set: { token, createdAt: sql`now()`, revokedAt: null },
    })
  refresh()
}

export async function stopSharingTrip(): Promise<void> {
  const user = await activeUserOrNull('trip:share')
  if (user === null) return

  await db
    .update(tripShares)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(tripShares.userId, user.id), isNull(tripShares.revokedAt)))
  refresh()
}
