'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { mapPlaces, placePhotoCandidates } from '@/db/schema'
import {
  applyCandidate,
  ApplyRefused,
  cancelFreePhotoJob,
  clearSharedPhotos,
  freePhotoProgress,
  startFreePhotoJob,
  type FreePhotoProgress,
} from '@/lib/free-photos/job'
import { MAP_PLACES_TAG } from '@/lib/map/cached'

import { adminHref } from '../../../_lib/admin-path'
import { writeAudit } from '../../../_lib/audit'
import { getAdminI18n } from '../../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'

const PAGE = adminHref('/places/free-photos')

function refreshPublic(): void {
  revalidateTag(MAP_PLACES_TAG, { expire: 0 })
  revalidatePath('/[locale]/map', 'page')
  revalidatePath('/[locale]/places/[slug]', 'page')
}

export async function startFind(recheck: boolean): Promise<FreePhotoProgress> {
  await requireCapability('content.write')
  return startFreePhotoJob({ recheck })
}

export async function findStatus(): Promise<FreePhotoProgress> {
  await requireCapability('content.write')
  const progress = freePhotoProgress()
  // Auto-applied photos change public pages: refresh once the job ends.
  if (!progress.running && progress.autoApplied > 0) refreshPublic()
  return progress
}

export async function stopFind(): Promise<FreePhotoProgress> {
  await requireCapability('content.write')
  cancelFreePhotoJob()
  return freePhotoProgress()
}

type Decision = 'main' | 'gallery' | 'reject' | 'remove'

export async function decideCandidate(
  candidateId: string,
  decision: Decision,
  back: string,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const target = back.startsWith(PAGE) ? back : PAGE
  let outcome: { ok: string } | { err: string }
  try {
    const [c] = await db
      .select()
      .from(placePhotoCandidates)
      .where(eq(placePhotoCandidates.id, candidateId))
    if (!c) throw new Error(t('fp.err_gone'))
    if (decision === 'reject') {
      await db
        .update(placePhotoCandidates)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(eq(placePhotoCandidates.id, candidateId))
      outcome = { ok: t('fp.ok_rejected') }
    } else if (decision === 'remove') {
      const [place] = await db.select().from(mapPlaces).where(eq(mapPlaces.id, c.placeId))
      if (place && c.mediaId) {
        const gallery = (place.galleryImageIds ?? []).filter((id) => id !== c.mediaId)
        const heroId = place.heroImageId === c.mediaId ? (gallery[0] ?? null) : place.heroImageId
        await db
          .update(mapPlaces)
          .set({
            heroImageId: heroId,
            galleryImageIds: gallery.filter((id) => id !== heroId),
            updatedAt: new Date(),
          })
          .where(eq(mapPlaces.id, c.placeId))
        await writeAudit({
          actor: session,
          action: 'map_place.free_photo_remove',
          entityType: 'map_place',
          entityId: c.placeId,
          before: { heroImageId: place.heroImageId, galleryImageIds: place.galleryImageIds },
          after: { heroImageId: heroId, galleryImageIds: gallery },
        })
      }
      await db
        .update(placePhotoCandidates)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(eq(placePhotoCandidates.id, candidateId))
      refreshPublic()
      outcome = { ok: t('fp.ok_removed') }
    } else {
      let result
      try {
        result = await applyCandidate(candidateId, decision)
      } catch (error) {
        if (error instanceof ApplyRefused) {
          throw new Error(
            t(
              error.message === 'duplicate'
                ? 'fp.err_duplicate'
                : error.message === 'unsplash_off'
                  ? 'fp.err_unsplash_off'
                  : 'fp.err_gone',
            ),
          )
        }
        throw new Error(t('fp.err_download', { error: errorMessage(error) }))
      }
      await writeAudit({
        actor: session,
        action: `map_place.free_photo_${decision}`,
        entityType: 'map_place',
        entityId: result.placeId,
        before: { heroImageId: result.before.heroId, galleryImageIds: result.before.galleryIds },
        after: {
          mediaId: result.mediaId,
          source: c.source,
          sourceUrl: c.sourceUrl,
          license: c.license,
        },
      })
      refreshPublic()
      outcome = { ok: t('fp.ok_applied') }
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}

export async function replaceSharedPhotos(): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    const changes = await clearSharedPhotos()
    for (const change of changes) {
      await writeAudit({
        actor: session,
        action: 'map_place.clear_shared_photos',
        entityType: 'map_place',
        entityId: change.placeId,
        before: { heroImageId: change.before.heroId, galleryImageIds: change.before.galleryIds },
        after: { heroImageId: change.after.heroId, galleryImageIds: change.after.galleryIds },
      })
    }
    refreshPublic()
    outcome = { ok: t('fp.ok_cleared', { n: changes.length }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(PAGE, outcome))
}
