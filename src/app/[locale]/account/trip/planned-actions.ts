'use server'

/**
 * ترتيب أماكن "رحلتي": تحريك لأعلى/لأسفل، تعيين يوم، إزالة.
 * كل استعلام مقيّد بـ `user_id` — معرّف بند لمستخدم آخر لا يطابق شيئاً.
 */

import { and, asc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import { tripItems } from '@/db/schema'
import { getUser } from '@/lib/auth/session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_DAYS = 30

function idFrom(form: FormData): string | null {
  const raw = form.get('itemId')
  return typeof raw === 'string' && UUID.test(raw) ? raw : null
}

const refresh = () => revalidatePath('/[locale]/account/trip', 'page')

export async function moveTripItem(form: FormData): Promise<void> {
  const user = await getUser()
  const id = idFrom(form)
  const direction = form.get('dir') === 'up' ? -1 : 1
  if (user === null || id === null) return

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: tripItems.id, position: tripItems.position })
      .from(tripItems)
      .where(eq(tripItems.userId, user.id))
      .orderBy(asc(tripItems.position), asc(tripItems.createdAt))
      .for('update')

    const index = rows.findIndex((row) => row.id === id)
    const swap = index + direction
    if (index < 0 || swap < 0 || swap >= rows.length) return

    // إعادة ترقيم كاملة: مواضع مكررة (من إدخالات متزامنة) تُصلح نفسها هنا.
    const ordered = rows.map((row) => row.id)
    const a = ordered[index] as string
    ordered[index] = ordered[swap] as string
    ordered[swap] = a
    for (const [position, itemId] of ordered.entries()) {
      await tx
        .update(tripItems)
        .set({ position })
        .where(and(eq(tripItems.id, itemId), eq(tripItems.userId, user.id)))
    }
  })
  refresh()
}

export async function setTripItemDay(form: FormData): Promise<void> {
  const user = await getUser()
  const id = idFrom(form)
  if (user === null || id === null) return
  const raw = Number.parseInt(String(form.get('day') ?? ''), 10)
  const day = Number.isFinite(raw) && raw >= 1 && raw <= MAX_DAYS ? raw : null

  await db
    .update(tripItems)
    .set({ dayNumber: day })
    .where(and(eq(tripItems.id, id), eq(tripItems.userId, user.id)))
  refresh()
}

export async function removeTripItem(form: FormData): Promise<void> {
  const user = await getUser()
  const id = idFrom(form)
  if (user === null || id === null) return
  await db.delete(tripItems).where(and(eq(tripItems.id, id), eq(tripItems.userId, user.id)))
  refresh()
}
