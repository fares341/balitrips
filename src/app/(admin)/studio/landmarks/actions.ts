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
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { assertSlug } from '../../_lib/slug'

const LIST = adminHref('/landmarks')

type Outcome = { ok: string } | { err: string }

export async function saveLandmark(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()

  let target = id === 'new' ? LIST : adminHref(`/landmarks/${id}`)
  let outcome: Outcome

  try {
    const status = form.get('status') === 'published' ? 'published' : 'draft'
    if (status === 'published') await requireCapability('content.publish')

    const values = {
      slug: assertSlug(freq(form, 'slug', t('common.slug'))),
      legacyId: fstr(form, 'legacyId'),
      name: flocalizedRequired(form, 'name', t('common.name')),
      type: flocalizedOrNull(form, 'type'),
      blurb: flocalizedOrNull(form, 'blurb'),
      regionId: fuuidOrNull(form, 'regionId', t('landmarks.region')),
      activityId: fuuidOrNull(form, 'activityId', t('landmarks.activity')),
      heroImageId: fuuidOrNull(form, 'heroImageId', t('landmarks.hero_image')),
      sortOrder: fint(form, 'sortOrder', 0, t('landmarks.sort_order')),
      status,
    }

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(landmarks).where(eq(landmarks.id, id)).limit(1))[0] ?? null)

      if (id !== 'new' && !before) throw new Error(t('landmarks.err_gone'))

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

      if (!row) throw new Error(t('landmarks.err_save_failed'))

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
    outcome = { ok: t('landmarks.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(target, outcome))
}

export async function deleteLandmark(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(landmarks).where(eq(landmarks.id, id)).limit(1)
      if (!before) throw new Error(t('landmarks.err_gone'))

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

    outcome = { ok: t('landmarks.ok_archived') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}
