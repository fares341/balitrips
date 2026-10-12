'use server'

/**
 * ترتيب أماكن "رحلتي": سحب وإفلات، تحريك لأعلى/لأسفل، تعيين يوم، ترتيب حسب
 * المسافة (مسار مقترح)، إزالة.
 * كل استعلام مقيّد بـ `user_id` — معرّف بند لمستخدم آخر لا يطابق شيئاً.
 */

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import { mapPlaces, tripItems } from '@/db/schema'
import { canSeePlace } from '@/lib/entitlements'
import { loadPermissions } from '@/lib/entitlements/plans'
import { suggestRoute } from '@/lib/geo'
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** كل بنود المستخدم بترتيب العرض، مقفلة للتعديل. */
async function lockedItems(tx: Tx, userId: string) {
  return tx
    .select({ id: tripItems.id, dayNumber: tripItems.dayNumber, placeId: tripItems.placeId })
    .from(tripItems)
    .where(eq(tripItems.userId, userId))
    .orderBy(
      sql`${tripItems.dayNumber} asc nulls last`,
      asc(tripItems.position),
      asc(tripItems.createdAt),
    )
    .for('update')
}

async function renumber(tx: Tx, userId: string, ordered: readonly string[]) {
  for (const [position, itemId] of ordered.entries()) {
    await tx
      .update(tripItems)
      .set({ position })
      .where(and(eq(tripItems.id, itemId), eq(tripItems.userId, userId)))
  }
}

/**
 * سحب وإفلات (الوثيقة 12.2 "ترتيب الأماكن يدوياً"): القائمة الجديدة كما يراها
 * المستخدم. معرّف لا يخصه يُتجاهل؛ البنود غير المرسلة (مخفية) تحتفظ بمكانها
 * النسبي بعد المرسلة. اليوم لا يتغير هنا — النقل بين الأيام من قائمة اليوم.
 */
export async function reorderTripItems(orderedIds: readonly string[]): Promise<void> {
  const user = await activeUserOrNull('trip:edit')
  if (user === null || !Array.isArray(orderedIds) || orderedIds.length > 500) return
  const wanted = orderedIds.filter((id): id is string => typeof id === 'string' && UUID.test(id))

  await db.transaction(async (tx) => {
    const all = await lockedItems(tx, user.id)
    const owned = new Set(all.map((row) => row.id))
    const sent = [...new Set(wanted.filter((id) => owned.has(id)))]
    const sentSet = new Set(sent)
    // لكل يوم (بترتيب العرض): المرسلة بالترتيب الجديد، ثم غير المرسلة كما كانت.
    const days: (number | null)[] = []
    for (const row of all) if (!days.includes(row.dayNumber)) days.push(row.dayNumber)
    const dayOf = new Map(all.map((row) => [row.id, row.dayNumber]))
    const ordered = days.flatMap((day) => [
      ...sent.filter((id) => dayOf.get(id) === day),
      ...all.filter((row) => row.dayNumber === day && !sentSet.has(row.id)).map((row) => row.id),
    ])
    await renumber(tx, user.id, ordered)
  })
  refresh()
}

/**
 * "رتّب حسب المسافة" (الوثيقة 12.3): لكل يوم، مسار قصير يبدأ من أول مكان فيه.
 * `day` في النموذج = يوم واحد، أو فارغ = كل الأيام.
 */
export async function suggestTripRoute(form: FormData): Promise<void> {
  const user = await activeUserOrNull('trip:edit')
  if (user === null) return
  const rawDay = String(form.get('day') ?? '')
  const onlyDay = rawDay === '' ? null : Number.parseInt(rawDay, 10)

  await db.transaction(async (tx) => {
    const all = await lockedItems(tx, user.id)
    if (all.length < 3) return
    // الأماكن المقفلة على المستخدم (باقة انتهت) لا تدخل الحساب: ترتيبها حسب
    // المسافة سيكشف أين تقع نسبةً لما يراه.
    const { entitlements: held } = await loadPermissions(user.id)
    const coords = await tx
      .select({
        id: mapPlaces.id,
        lat: mapPlaces.lat,
        lon: mapPlaces.lon,
        isFree: mapPlaces.isFree,
        requiredEntitlement: mapPlaces.requiredEntitlement,
        isHiddenGem: mapPlaces.isHiddenGem,
      })
      .from(mapPlaces)
      .where(
        inArray(
          mapPlaces.id,
          all.map((row) => row.placeId),
        ),
      )
    const where = new Map(coords.map((row) => [row.id, row]))

    const groups = new Map<number | null, typeof all>()
    for (const row of all) groups.set(row.dayNumber, [...(groups.get(row.dayNumber) ?? []), row])

    const ordered: string[] = []
    for (const [day, rows] of groups) {
      const located = rows.flatMap((row) => {
        const point = where.get(row.placeId)
        return point && canSeePlace(point, held)
          ? [{ id: row.id, lat: point.lat, lon: point.lon }]
          : []
      })
      const apply = onlyDay === null || onlyDay === day
      const routed = apply ? suggestRoute(located).map((row) => row.id) : located.map((r) => r.id)
      const routedSet = new Set(routed)
      // مكان مقفل يبقى في آخر يومه.
      ordered.push(...routed, ...rows.filter((row) => !routedSet.has(row.id)).map((r) => r.id))
    }
    await renumber(tx, user.id, ordered)
  })
  refresh()
}
