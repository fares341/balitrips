'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { reviews } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fbool, fint, flocalizedOrNull, freq, fuuidOrNull } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

const LIST = adminHref('/reviews')

type Outcome = { ok: string } | { err: string }

export async function saveReview(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()

  let target = id === 'new' ? LIST : adminHref(`/reviews/${id}`)
  let outcome: Outcome

  try {
    const stars = fint(form, 'stars', 5, t('reviews.stars'))
    if (stars < 1 || stars > 5) throw new Error(t('reviews.err_stars_range'))

    const values = {
      authorName: freq(form, 'authorName', t('reviews.author_name')),
      authorCountry: flocalizedOrNull(form, 'authorCountry'),
      stars,
      body: flocalizedOrNull(form, 'body'),
      /**
       * A review belongs to something. The prototype filtered one shared
       * pool by tag overlap and fell back to slice(0, 3) on no match, so
       * unrelated reviews rendered as though they were for the activity
       * being viewed.
       */
      activityId: fuuidOrNull(form, 'activityId', t('reviews.activity')),
      orderId: fuuidOrNull(form, 'orderId', t('reviews.order')),
      isPublished: fbool(form, 'isPublished'),
    }

    if (values.isPublished) await requireCapability('content.publish')

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(reviews).where(eq(reviews.id, id)).limit(1))[0] ?? null)

      if (id !== 'new' && !before) throw new Error(t('reviews.err_gone'))

      const [row] =
        id === 'new'
          ? await tx.insert(reviews).values(values).returning()
          : await tx.update(reviews).set(values).where(eq(reviews.id, id)).returning()

      if (!row) throw new Error(t('reviews.err_save_failed'))

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'review.create' : 'review.update',
          entityType: 'review',
          entityId: row.id,
          before,
          after: row,
        },
        tx,
      )

      return row.id
    })

    target = adminHref(`/reviews/${savedId}`)
    outcome = { ok: t('reviews.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(target, outcome))
}

export async function setReviewPublished(id: string, isPublished: boolean): Promise<void> {
  const session = await requireCapability('content.publish')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(reviews).where(eq(reviews.id, id)).limit(1)
      if (!before) throw new Error(t('reviews.err_gone'))

      const [after] = await tx
        .update(reviews)
        .set({ isPublished })
        .where(eq(reviews.id, id))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: isPublished ? 'review.publish' : 'review.unpublish',
          entityType: 'review',
          entityId: id,
          before,
          after: after ?? null,
        },
        tx,
      )
    })

    outcome = { ok: isPublished ? t('reviews.ok_published') : t('reviews.ok_hidden') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

export async function deleteReview(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(reviews).where(eq(reviews.id, id)).limit(1)
      if (!before) throw new Error(t('reviews.err_gone'))

      await tx
        .update(reviews)
        .set({ deletedAt: new Date(), isPublished: false })
        .where(eq(reviews.id, id))

      await writeAudit(
        {
          actor: session,
          action: 'review.delete',
          entityType: 'review',
          entityId: id,
          before,
          after: { deletedAt: new Date().toISOString(), isPublished: false },
        },
        tx,
      )
    })

    outcome = { ok: t('reviews.ok_archived') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}
