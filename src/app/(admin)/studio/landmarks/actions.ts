'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { landmarks } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fint,
  flocalizedOrNull,
  flocalizedRequired,
  freq,
  fstr,
  fuuidOrNull,
} from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { assertSlug } from '../../_lib/slug'

const LIST = adminHref('/landmarks')

type Outcome = { ok: string } | { err: string }

export async function saveLandmark(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')

  let target = id === 'new' ? LIST : adminHref(`/landmarks/${id}`)
  let outcome: Outcome

  try {
    const status = form.get('status') === 'published' ? 'published' : 'draft'
    if (status === 'published') await requireCapability('content.publish')

    const values = {
      slug: assertSlug(freq(form, 'slug', 'Slug')),
      legacyId: fstr(form, 'legacyId'),
      name: flocalizedRequired(form, 'name', 'Name'),
      type: flocalizedOrNull(form, 'type'),
      blurb: flocalizedOrNull(form, 'blurb'),
      regionId: fuuidOrNull(form, 'regionId', 'Region'),
      activityId: fuuidOrNull(form, 'activityId', 'Activity'),
      heroImageId: fuuidOrNull(form, 'heroImageId', 'Hero image'),
      sortOrder: fint(form, 'sortOrder', 0, 'Sort order'),
      status,
    }

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(landmarks).where(eq(landmarks.id, id)).limit(1))[0] ?? null)

      if (id !== 'new' && !before) throw new Error('That landmark no longer exists')

      const [row] =
        id === 'new'
          ? await tx
              .insert(landmarks)
              .values({ ...values, publishedAt: status === 'published' ? new Date() : null })
              .returning()
          : await tx
              .update(landmarks)
              .set({
                ...values,
                publishedAt:
                  status === 'published'
                    ? (before?.publishedAt ?? new Date())
                    : (before?.publishedAt ?? null),
              })
              .where(eq(landmarks.id, id))
              .returning()

      if (!row) throw new Error('Save failed')

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'landmark.create' : 'landmark.update',
          entityType: 'landmark',
          entityId: row.id,
          before,
          after: row,
        },
        tx,
      )

      return row.id
    })

    target = adminHref(`/landmarks/${savedId}`)
    outcome = { ok: 'Landmark saved.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(target, outcome))
}

export async function deleteLandmark(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(landmarks).where(eq(landmarks.id, id)).limit(1)
      if (!before) throw new Error('That landmark no longer exists')

      await tx
        .update(landmarks)
        .set({ deletedAt: new Date(), status: 'draft' })
        .where(eq(landmarks.id, id))

      await writeAudit(
        {
          actor: session,
          action: 'landmark.delete',
          entityType: 'landmark',
          entityId: id,
          before,
          after: { deletedAt: new Date().toISOString(), status: 'draft' },
        },
        tx,
      )
    })

    outcome = { ok: 'Landmark archived.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}
