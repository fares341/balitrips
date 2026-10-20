'use server'

/**
 * Toggle a favorite from any catalogue card's heart button.
 *
 * Places keep their own, stricter path (`toggleFavoritePlace`: plan
 * permissions, locked-place checks, activity log), so a `place` toggle is
 * delegated to it. Activities, itineraries and packages only need the row to
 * exist and be published.
 *
 * Returns a result instead of redirecting: the button lives inside a card on
 * a cached page and shows a toast either way.
 */

import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import { activities, favorites, itineraries, packages } from '@/db/schema'
import { getUser } from '@/lib/auth/session'
import { PAGE_STATUSES } from '@/lib/content/activity-status'

import { toggleFavoritePlace } from './places'

export type FavoriteKind = 'activity' | 'itinerary' | 'package' | 'place'

export type ToggleFavoriteResult =
  | { ok: true; saved: boolean }
  | { ok: false; reason: 'signed_out' | 'not_found' | 'not_allowed' | 'upgrade' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KINDS: readonly FavoriteKind[] = ['activity', 'itinerary', 'package', 'place']

async function isPublished(kind: Exclude<FavoriteKind, 'place'>, id: string): Promise<boolean> {
  // One query per table rather than a union-typed `table`, which Drizzle's
  // query builder does not accept.
  if (kind === 'activity') {
    const [row] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.id, id), inArray(activities.status, [...PAGE_STATUSES])))
      .limit(1)
    return row !== undefined
  }
  if (kind === 'itinerary') {
    const [row] = await db
      .select({ id: itineraries.id })
      .from(itineraries)
      .where(and(eq(itineraries.id, id), eq(itineraries.status, 'published')))
      .limit(1)
    return row !== undefined
  }
  const [row] = await db
    .select({ id: packages.id })
    .from(packages)
    .where(and(eq(packages.id, id), eq(packages.status, 'published')))
    .limit(1)
  return row !== undefined
}

export async function toggleFavorite(kind: string, refId: string): Promise<ToggleFavoriteResult> {
  if (!(KINDS as readonly string[]).includes(kind) || !UUID.test(refId)) {
    return { ok: false, reason: 'not_found' }
  }
  const typedKind = kind as FavoriteKind

  if (typedKind === 'place') {
    const result = await toggleFavoritePlace(refId)
    if (!result.ok) return { ok: false, reason: result.reason }
    return { ok: true, saved: result.state === 'saved' }
  }

  const user = await getUser()
  if (user === null) return { ok: false, reason: 'signed_out' }
  if (!(await isPublished(typedKind, refId))) return { ok: false, reason: 'not_found' }

  const removed = await db
    .delete(favorites)
    .where(
      and(eq(favorites.userId, user.id), eq(favorites.kind, typedKind), eq(favorites.refId, refId)),
    )
    .returning({ refId: favorites.refId })

  if (removed.length === 0) {
    await db
      .insert(favorites)
      .values({ userId: user.id, kind: typedKind, refId })
      .onConflictDoNothing()
  }

  revalidatePath('/[locale]/account/favorites', 'page')
  return { ok: true, saved: removed.length === 0 }
}
