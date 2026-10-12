'use server'

import { eq, inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { mapPlaces, placeTags, tags } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fbool,
  fenum,
  ffloat,
  fint,
  fintOrNull,
  flines,
  flocalizedOrNull,
  flocalizedRequired,
  fmulti,
  freq,
  fstr,
  fuuidOrNull,
  isUuid,
} from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { assertSlug } from '../../_lib/slug'

const LIST = adminHref('/places')

/** Which entitlement unlocks a locked place. */
const ENTITLEMENTS = ['map_access', 'vip'] as const

type Outcome = { ok: string } | { err: string }

export async function savePlace(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')

  let target = id === 'new' ? LIST : adminHref(`/places/${id}`)
  let outcome: Outcome

  try {
    const status = form.get('status') === 'published' ? 'published' : 'draft'
    if (status === 'published') await requireCapability('content.publish')

    const lat = ffloat(form, 'lat', 'Latitude')
    const lon = ffloat(form, 'lon', 'Longitude')
    if (lat < -90 || lat > 90) throw new Error('Latitude must be between -90 and 90')
    if (lon < -180 || lon > 180) throw new Error('Longitude must be between -180 and 180')

    const ratingTenths = fintOrNull(form, 'ratingTenths', 'Rating')
    if (ratingTenths !== null && (ratingTenths < 0 || ratingTenths > 50)) {
      throw new Error('Rating must be between 0 and 50 tenths (0.0–5.0)')
    }

    const values = {
      slug: assertSlug(freq(form, 'slug', 'Slug')),
      legacyId: fstr(form, 'legacyId'),
      name: flocalizedRequired(form, 'name', 'Name'),
      category: flocalizedOrNull(form, 'category'),
      description: flocalizedOrNull(form, 'description'),
      lat,
      lon,
      regionId: fuuidOrNull(form, 'regionId', 'Region'),
      activityId: fuuidOrNull(form, 'activityId', 'Activity'),
      /**
       * The freemium gate. A locked place is REDACTED server-side — an
       * unentitled client receives a count and a marker, never the name,
       * coordinates, rating or image. The prototype shipped all of it and
       * merely blurred it in CSS, which any reader of the DOM could undo.
       */
      isFree: fbool(form, 'isFree'),
      requiredEntitlement: fenum(form, 'requiredEntitlement', ENTITLEMENTS, 'map_access'),
      isHiddenGem: fbool(form, 'isHiddenGem'),
      isHidden: fbool(form, 'isHidden'),
      canFavorite: fbool(form, 'canFavorite'),
      canAddToTrip: fbool(form, 'canAddToTrip'),
      priority: fint(form, 'priority', 0, 'Search priority'),
      sortOrder: fint(form, 'sortOrder', 0, 'Sort order'),
      categoryId: fuuidOrNull(form, 'categoryId', 'Category'),
      detailedDescription: flocalizedOrNull(form, 'detailedDescription'),
      videos: flines(form, 'videos')
        .filter((url) => /^https?:\/\//.test(url))
        .slice(0, 10),
      internalNotes: fstr(form, 'internalNotes'),
      openingHours: fstr(form, 'openingHours'),
      rating: ratingTenths === null ? null : ratingTenths / 10,
      heroImageId: fuuidOrNull(form, 'heroImageId', 'Hero image'),
      status,
    }

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(mapPlaces).where(eq(mapPlaces.id, id)).limit(1))[0] ?? null)

      if (id !== 'new' && !before) throw new Error('That place no longer exists')

      const [row] =
        id === 'new'
          ? await tx
              .insert(mapPlaces)
              .values({ ...values, publishedAt: status === 'published' ? new Date() : null })
              .returning()
          : await tx
              .update(mapPlaces)
              .set({
                ...values,
                publishedAt:
                  status === 'published'
                    ? (before?.publishedAt ?? new Date())
                    : (before?.publishedAt ?? null),
              })
              .where(eq(mapPlaces.id, id))
              .returning()

      if (!row) throw new Error('Save failed')

      // Tags: the place_tags rows are the source of truth; the legacy jsonb
      // column is rewritten from them (English labels) so pin colours and
      // anything still reading it stay in step.
      const tagIds = fmulti(form, 'tagIds').filter((value) => isUuid(value))
      await tx.delete(placeTags).where(eq(placeTags.placeId, row.id))
      if (tagIds.length > 0) {
        await tx
          .insert(placeTags)
          .values(tagIds.map((tagId) => ({ placeId: row.id, tagId })))
          .onConflictDoNothing()
        const labels = await tx
          .select({ label: tags.label, key: tags.key })
          .from(tags)
          .where(inArray(tags.id, tagIds))
        await tx
          .update(mapPlaces)
          .set({ tags: labels.map((tag) => tag.label.en || tag.key) })
          .where(eq(mapPlaces.id, row.id))
      } else {
        await tx.update(mapPlaces).set({ tags: [] }).where(eq(mapPlaces.id, row.id))
      }

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'map_place.create' : 'map_place.update',
          entityType: 'map_place',
          entityId: row.id,
          before,
          after: row,
        },
        tx,
      )

      return row.id
    })

    target = adminHref(`/places/${savedId}`)
    outcome = { ok: 'Place saved.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(target, outcome))
}

/**
 * Flip the freemium gate from the list.
 *
 * Audited like everything else: "who made the whole map free last Tuesday"
 * is a question that has to have an answer.
 */
export async function setPlaceFree(id: string, isFree: boolean): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(mapPlaces).where(eq(mapPlaces.id, id)).limit(1)
      if (!before) throw new Error('That place no longer exists')

      const [after] = await tx
        .update(mapPlaces)
        .set({ isFree })
        .where(eq(mapPlaces.id, id))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: isFree ? 'map_place.unlock' : 'map_place.lock',
          entityType: 'map_place',
          entityId: id,
          before,
          after: after ?? null,
        },
        tx,
      )
    })

    outcome = { ok: isFree ? 'Place is now free to view.' : 'Place now requires an entitlement.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

export async function deletePlace(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(mapPlaces).where(eq(mapPlaces.id, id)).limit(1)
      if (!before) throw new Error('That place no longer exists')

      await tx
        .update(mapPlaces)
        .set({ deletedAt: new Date(), status: 'draft' })
        .where(eq(mapPlaces.id, id))

      await writeAudit(
        {
          actor: session,
          action: 'map_place.delete',
          entityType: 'map_place',
          entityId: id,
          before,
          after: { deletedAt: new Date().toISOString(), status: 'draft' },
        },
        tx,
      )
    })

    outcome = { ok: 'Place archived.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}
