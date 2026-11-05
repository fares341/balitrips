'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { mapPlaces } from '@/db/schema'
import { isPlaceId } from '@/lib/google-places/client'
import { googlePhotosEnabled } from '@/lib/google-places/config'
import {
  cancelMatchJob,
  matchProgress,
  startMatchJob,
  type MatchProgress,
} from '@/lib/google-places/match-job'
import { MAP_PLACES_TAG } from '@/lib/map/cached'

import { adminHref } from '../../../_lib/admin-path'
import { writeAudit } from '../../../_lib/audit'
import { getAdminI18n } from '../../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'

const PAGE = adminHref('/places/google')

function refreshPublic(): void {
  revalidateTag(MAP_PLACES_TAG, { expire: 0 })
  revalidatePath('/[locale]/map', 'page')
  revalidatePath('/[locale]/places/[slug]', 'page')
}

/** Background job: start / poll / stop. The page polls `matchStatus`. */
export async function startMatch(recheck: boolean): Promise<MatchProgress> {
  await requireCapability('content.write')
  if (!googlePhotosEnabled()) return matchProgress()
  return startMatchJob({ recheck })
}

export async function matchStatus(): Promise<MatchProgress> {
  await requireCapability('content.write')
  return matchProgress()
}

export async function stopMatch(): Promise<MatchProgress> {
  await requireCapability('content.write')
  cancelMatchJob()
  return matchProgress()
}

type Decision = 'accept' | 'reject' | 'unlink' | 'use'

/**
 * A person's decision on one place. `use` links a candidate picked from
 * «Search again» (confirmed at once). Only the Google place ID is stored.
 */
export async function decideMatch(
  placeId: string,
  decision: Decision,
  back: string,
  googleId?: string,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const target = back.startsWith(PAGE) ? back : PAGE
  let outcome: { ok: string } | { err: string }
  try {
    const [before] = await db.select().from(mapPlaces).where(eq(mapPlaces.id, placeId)).limit(1)
    if (!before) throw new Error(t('gp.err_gone'))
    let set: Partial<typeof mapPlaces.$inferInsert>
    if (decision === 'accept') {
      if (!before.googlePlaceId) throw new Error(t('gp.err_id'))
      set = { googleMatchStatus: 'confirmed' }
    } else if (decision === 'reject') {
      set = { googleMatchStatus: 'rejected' }
    } else if (decision === 'unlink') {
      set = { googlePlaceId: null, googleMatchStatus: 'rejected', googleMatchScore: null }
    } else {
      if (!googleId || !isPlaceId(googleId)) throw new Error(t('gp.err_id'))
      set = { googlePlaceId: googleId, googleMatchStatus: 'confirmed', googleMatchScore: null }
    }
    const [after] = await db
      .update(mapPlaces)
      .set({ ...set, googleCheckedAt: new Date() })
      .where(eq(mapPlaces.id, placeId))
      .returning()
    await writeAudit({
      actor: session,
      action: `map_place.google_${decision}`,
      entityType: 'map_place',
      entityId: placeId,
      before: {
        googlePlaceId: before.googlePlaceId,
        googleMatchStatus: before.googleMatchStatus,
      },
      after: after
        ? { googlePlaceId: after.googlePlaceId, googleMatchStatus: after.googleMatchStatus }
        : null,
    })
    refreshPublic()
    outcome = {
      ok: t(
        decision === 'reject'
          ? 'gp.ok_rejected'
          : decision === 'unlink'
            ? 'gp.ok_unlinked'
            : 'gp.ok_accepted',
      ),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}
