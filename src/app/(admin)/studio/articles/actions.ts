'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { articles } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fenum,
  flocalized,
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

const LIST = adminHref('/articles')

type Outcome = { ok: string } | { err: string }

/**
 * Where the in-article CTA points. Not exported — a `'use server'` module
 * may only export async functions.
 */
const BRIDGES = ['', 'map', 'activities', 'driver'] as const

/** "Who can read" (spec 2.3/2.4). '' = everyone, stored as NULL. */
const READERS = ['', 'map_access', 'vip'] as const

export async function saveArticle(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()

  let target = id === 'new' ? LIST : adminHref(`/articles/${id}`)
  let outcome: Outcome

  try {
    const status = form.get('status') === 'published' ? 'published' : 'draft'
    if (status === 'published') await requireCapability('content.publish')

    const body = flocalized(form, 'body')
    if (status === 'published' && body.en.trim() === '') {
      // The prototype's blog was a shell: `bodyParas()` returned the same
      // three lorem paragraphs for every article and the data carried no
      // body at all. Publishing an empty one would recreate that.
      throw new Error(t('articles.err_body_required'))
    }

    const values = {
      slug: assertSlug(freq(form, 'slug', t('articles.f_slug'))),
      legacyId: fstr(form, 'legacyId'),
      title: flocalizedRequired(form, 'title', t('articles.f_title')),
      excerpt: flocalizedOrNull(form, 'excerpt'),
      body,
      categoryId: fuuidOrNull(form, 'categoryId', t('articles.category')),
      heroImageId: fuuidOrNull(form, 'heroImageId', t('articles.hero_image')),
      bridge: fenum(form, 'bridge', BRIDGES, '') || null,
      requiredEntitlement: fenum(form, 'requiredEntitlement', READERS, '') || null,
      status,
    }

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(articles).where(eq(articles.id, id)).limit(1))[0] ?? null)

      if (id !== 'new' && !before) throw new Error(t('articles.err_gone'))

      const [row] =
        id === 'new'
          ? await tx
              .insert(articles)
              .values({ ...values, publishedAt: status === 'published' ? new Date() : null })
              .returning()
          : await tx
              .update(articles)
              .set({
                ...values,
                publishedAt:
                  status === 'published'
                    ? (before?.publishedAt ?? new Date())
                    : (before?.publishedAt ?? null),
              })
              .where(eq(articles.id, id))
              .returning()

      if (!row) throw new Error(t('articles.err_save_failed'))

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'article.create' : 'article.update',
          entityType: 'article',
          entityId: row.id,
          before,
          after: row,
        },
        tx,
      )

      return row.id
    })

    target = adminHref(`/articles/${savedId}`)
    outcome = { ok: t('articles.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(target, outcome))
}

export async function setArticleStatus(id: string, status: string): Promise<void> {
  const session = await requireCapability('content.publish')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    const next = status === 'published' ? 'published' : 'draft'

    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(articles).where(eq(articles.id, id)).limit(1)
      if (!before) throw new Error(t('articles.err_gone'))

      if (next === 'published' && (before.body?.en ?? '').trim() === '') {
        throw new Error(t('articles.err_body_required'))
      }

      const [after] = await tx
        .update(articles)
        .set({
          status: next,
          publishedAt:
            next === 'published' ? (before.publishedAt ?? new Date()) : before.publishedAt,
        })
        .where(eq(articles.id, id))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: next === 'published' ? 'article.publish' : 'article.unpublish',
          entityType: 'article',
          entityId: id,
          before,
          after: after ?? null,
        },
        tx,
      )
    })

    outcome = {
      ok: next === 'published' ? t('articles.ok_published') : t('articles.ok_drafted'),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

export async function deleteArticle(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(articles).where(eq(articles.id, id)).limit(1)
      if (!before) throw new Error(t('articles.err_gone'))

      await tx
        .update(articles)
        .set({ deletedAt: new Date(), status: 'draft' })
        .where(eq(articles.id, id))

      await writeAudit(
        {
          actor: session,
          action: 'article.delete',
          entityType: 'article',
          entityId: id,
          before,
          after: { deletedAt: new Date().toISOString(), status: 'draft' },
        },
        tx,
      )
    })

    outcome = { ok: t('articles.ok_archived') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}
