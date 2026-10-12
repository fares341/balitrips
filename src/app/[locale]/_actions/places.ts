'use server'

/**
 * حفظ مكان في المفضلة وإضافته إلى "رحلتي" — من الخريطة ومن نتائج البحث.
 *
 * كل إجراء يتحقق على الخادم من:
 *  - مستخدم مسجّل بجلسة حيّة وجهاز فعّال وغير محظور (`checkSecureAccess`)
 *  - المكان منشور وغير مخفي، والمستخدم يستطيع رؤيته (مكان مقفل لا يُحفظ —
 *    وإلا لظهر اسمه في المفضلة)
 *  - المكان يسمح بالإجراء (`can_favorite` / `can_add_to_trip`)
 *  - الباقة تسمح بالإجراء (`canSaveFavorites` / `canUseTrip`)
 *
 * يعيد نتيجة بدل إعادة التوجيه، لأن الزر يعيش داخل لوحة الخريطة.
 */

import { and, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import { favorites, mapPlaces, tripItems } from '@/db/schema'
import { canSeePlace } from '@/lib/entitlements'
import { loadPermissions } from '@/lib/entitlements/plans'
import { logActivity } from '@/lib/security/activity'
import { checkSecureAccess } from '@/lib/security/guard'

export type PlaceActionResult =
  | { ok: true; state: 'saved' | 'removed' | 'added' | 'already' }
  | { ok: false; reason: 'signed_out' | 'not_allowed' | 'upgrade' | 'not_found' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TRIP_ITEMS = 200

type Prepared =
  | { error: 'signed_out' | 'not_found' }
  | {
      error: null
      access: Extract<Awaited<ReturnType<typeof checkSecureAccess>>, { ok: true }>
      place: typeof mapPlaces.$inferSelect
      permissions: Awaited<ReturnType<typeof loadPermissions>>
    }

async function prepare(placeId: string, resource: string): Promise<Prepared> {
  if (!UUID.test(placeId)) return { error: 'not_found' as const }
  const access = await checkSecureAccess(resource)
  if (!access.ok) return { error: 'signed_out' as const }

  const [[place], permissions] = await Promise.all([
    db
      .select()
      .from(mapPlaces)
      .where(
        and(
          eq(mapPlaces.id, placeId),
          eq(mapPlaces.status, 'published'),
          isNull(mapPlaces.deletedAt),
          eq(mapPlaces.isHidden, false),
        ),
      )
      .limit(1),
    loadPermissions(access.user.id),
  ])
  if (!place || !canSeePlace(place, permissions.entitlements))
    return { error: 'not_found' as const }
  return { error: null, access, place, permissions }
}

export async function toggleFavoritePlace(placeId: string): Promise<PlaceActionResult> {
  const ready = await prepare(placeId, `favorite:${placeId}`)
  if (ready.error !== null) return { ok: false, reason: ready.error }
  const { access, place, permissions } = ready

  if (!place.canFavorite) return { ok: false, reason: 'not_allowed' }
  if (!permissions.canSaveFavorites) return { ok: false, reason: 'upgrade' }

  const removed = await db
    .delete(favorites)
    .where(
      and(
        eq(favorites.userId, access.user.id),
        eq(favorites.kind, 'place'),
        eq(favorites.refId, place.id),
      ),
    )
    .returning({ refId: favorites.refId })

  if (removed.length === 0) {
    await db
      .insert(favorites)
      .values({ userId: access.user.id, kind: 'place', refId: place.id })
      .onConflictDoNothing()
    await logActivity({
      action: 'save_place',
      userId: access.user.id,
      ip: access.ip,
      deviceId: access.deviceId,
      details: { placeId: place.id, slug: place.slug },
    })
  }

  revalidatePath('/[locale]/account/favorites', 'page')
  return { ok: true, state: removed.length === 0 ? 'saved' : 'removed' }
}

export async function addPlaceToTrip(placeId: string): Promise<PlaceActionResult> {
  const ready = await prepare(placeId, `trip:${placeId}`)
  if (ready.error !== null) return { ok: false, reason: ready.error }
  const { access, place, permissions } = ready

  if (!place.canAddToTrip) return { ok: false, reason: 'not_allowed' }
  if (!permissions.canUseTrip) return { ok: false, reason: 'upgrade' }

  const [{ count = 0, max = -1 } = {}] = await db
    .select({
      count: sql<number>`count(*)::int`,
      max: sql<number>`coalesce(max(${tripItems.position}), -1)::int`,
    })
    .from(tripItems)
    .where(eq(tripItems.userId, access.user.id))
  if (count >= MAX_TRIP_ITEMS) return { ok: false, reason: 'not_allowed' }

  const inserted = await db
    .insert(tripItems)
    .values({ userId: access.user.id, placeId: place.id, position: max + 1 })
    .onConflictDoNothing()
    .returning({ id: tripItems.id })

  if (inserted.length > 0) {
    await logActivity({
      action: 'add_to_trip',
      userId: access.user.id,
      ip: access.ip,
      deviceId: access.deviceId,
      details: { placeId: place.id, slug: place.slug },
    })
  }
  revalidatePath('/[locale]/account/trip', 'page')
  return { ok: true, state: inserted.length > 0 ? 'added' : 'already' }
}

/**
 * حالة المكان للمستخدم الحالي — كي يعرض زر "احفظ" حالته الحقيقية.
 * بدونه كان الزر يقول "احفظ" دائماً، والضغط على مكان محفوظ يحذفه بصمت.
 */
export async function placeUserState(
  placeId: string,
): Promise<{ saved: boolean; inTrip: boolean } | null> {
  if (!UUID.test(placeId)) return null
  // يُستدعى عند فتح لوحة المكان، فهو أيضاً موضع تسجيل "مشاهدة مكان" (الوثيقة 15.1).
  const ready = await prepare(placeId, `place:${placeId}`)
  if (ready.error !== null) return null
  const { access } = ready
  const user = access.user
  await logActivity({
    action: 'view_place',
    userId: user.id,
    ip: access.ip,
    deviceId: access.deviceId,
    details: { placeId, slug: ready.place.slug },
  })
  const [saved, trip] = await Promise.all([
    db
      .select({ refId: favorites.refId })
      .from(favorites)
      .where(
        and(
          eq(favorites.userId, user.id),
          eq(favorites.kind, 'place'),
          eq(favorites.refId, placeId),
        ),
      )
      .limit(1),
    db
      .select({ id: tripItems.id })
      .from(tripItems)
      .where(and(eq(tripItems.userId, user.id), eq(tripItems.placeId, placeId)))
      .limit(1),
  ])
  return { saved: saved.length > 0, inTrip: trip.length > 0 }
}
