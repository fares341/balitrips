'use server'

/**
 * ترتيب أماكن "رحلتي": تحريك لأعلى/لأسفل، تعيين يوم، إزالة.
 * كل استعلام مقيّد بـ `user_id` — معرّف بند لمستخدم آخر لا يطابق شيئاً.
 */

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import { mapPlaces, tripItems } from '@/db/schema'
import { activeUserOrNull } from '@/lib/security/require'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_DAYS = 30

function idFrom(form: FormData): string | null {
  const raw = form.get('itemId')
  return typeof raw === 'string' && UUID.test(raw) ? raw : null
}

const refresh = () => revalidatePath('/[locale]/account/trip', 'page')

export async function moveTripItem(form: FormData): Promise<void> {
  const user = await activeUserOrNull('trip:edit')
  const id = idFrom(form)
  const direction = form.get('dir') === 'up' ? -1 : 1
  if (user === null || id === null) return

  await db.transaction(async (tx) => {
    // نفس ترتيب العرض (اليوم ثم الموضع). كان الترتيب هنا بالموضع وحده بينما
    // القائمة تُعرض حسب اليوم، فبعد تعيين الأيام كانت الأسهم تحرّك عنصراً آخر.
    const all = await tx
      .select({ id: tripItems.id, dayNumber: tripItems.dayNumber, placeId: tripItems.placeId })
      .from(tripItems)
      .where(eq(tripItems.userId, user.id))
      .orderBy(
        sql`${tripItems.dayNumber} asc nulls last`,
        asc(tripItems.position),
        asc(tripItems.createdAt),
      )
      .for('update')
    if (all.length === 0) return

    // ما يراه المستخدم فعلاً (منشور، غير مخفي) — الأسهم تتحرك بين هذه فقط.
    const visibleIds = new Set(
      (
        await tx
          .select({ id: mapPlaces.id })
          .from(mapPlaces)
          .where(
            and(
              inArray(
                mapPlaces.id,
                all.map((row) => row.placeId),
              ),
              isNull(mapPlaces.deletedAt),
              eq(mapPlaces.status, 'published'),
              eq(mapPlaces.isHidden, false),
            ),
          )
      ).map((row) => row.id),
    )
    const visible = all.filter((row) => visibleIds.has(row.placeId))

    const index = visible.findIndex((row) => row.id === id)
    const swap = index + direction
    if (index < 0 || swap < 0 || swap >= visible.length) return
    // التحريك داخل اليوم نفسه؛ النقل بين الأيام من قائمة اليوم.
    if (visible[index]?.dayNumber !== visible[swap]?.dayNumber) return

    // تبديل العنصرين في القائمة الكاملة، ثم إعادة ترقيم الكل (المخفي أيضاً) كي
    // لا تتصادم المواضع عند ظهوره مجدداً.
    const ordered = all.map((row) => row.id)
    const a = ordered.indexOf(visible[index]?.id as string)
    const b = ordered.indexOf(visible[swap]?.id as string)
    const first = ordered[a] as string
    ordered[a] = ordered[b] as string
    ordered[b] = first
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
  const user = await activeUserOrNull('trip:edit')
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
  const user = await activeUserOrNull('trip:edit')
  const id = idFrom(form)
  if (user === null || id === null) return
  await db.delete(tripItems).where(and(eq(tripItems.id, id), eq(tripItems.userId, user.id)))
  refresh()
}
