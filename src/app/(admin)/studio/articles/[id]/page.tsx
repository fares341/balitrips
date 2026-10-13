import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { articles } from '@/db/schema'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../../_lib/admin-path'
import { articleCategoryOptions, mediaOptions } from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
import { Field, LocalizedField, Select, StatusField, TextInput } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { OptionField } from '../../../_ui/select-field'
import { PageHead } from '../../../_ui/shell'
import { getAdminI18n } from '../../../_lib/i18n'
import { deleteArticle, saveArticle } from '../actions'

export const dynamic = 'force-dynamic'

export default async function ArticleEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('content.write')
  const { t, locale } = await getAdminI18n()
  const { id } = await params
  const query = await searchParams

  const isNew = id === 'new'

  const article = isNew
    ? null
    : ((
        await db
          .select()
          .from(articles)
          .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
          .limit(1)
      )[0] ?? null)

  if (!isNew && !article) notFound()

  const [categories, mediaList] = await Promise.all([articleCategoryOptions(), mediaOptions()])

  return (
    <>
      <PageHead
        title={article ? pick(article.title, locale, article.slug) : t('articles.new')}
        description={t('articles.edit_description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/articles')}>
            {t('articles.back_to_list')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveArticle.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>{t('articles.section_identity')}</h2>
          <div className="a-row">
            <Field label={t('articles.slug_required')} htmlFor="slug">
              <TextInput
                id="slug"
                name="slug"
                defaultValue={article?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Field label={t('articles.legacy_id')} htmlFor="legacyId">
              <TextInput id="legacyId" name="legacyId" defaultValue={article?.legacyId ?? ''} />
            </Field>
            <StatusField value={article?.status} />
            <Field
              label={t('articles.f_bridge')}
              htmlFor="bridge"
              hint={t('articles.f_bridge_hint')}
            >
              <Select id="bridge" name="bridge" defaultValue={article?.bridge ?? ''}>
                <option value="">— {t('common.none')} —</option>
                <option value="map">{t('articles.bridge_map')}</option>
                <option value="activities">{t('articles.bridge_activities')}</option>
                <option value="driver">{t('articles.bridge_driver')}</option>
              </Select>
            </Field>
            <Field
              label={t('articles.f_readers')}
              htmlFor="requiredEntitlement"
              hint={t('articles.f_readers_hint')}
            >
              <Select
                id="requiredEntitlement"
                name="requiredEntitlement"
                defaultValue={article?.requiredEntitlement ?? ''}
              >
                <option value="">{t('articles.readers_everyone')}</option>
                <option value="map_access">{t('articles.readers_map')}</option>
                <option value="vip">{t('articles.gate_vip')}</option>
              </Select>
            </Field>
          </div>
          <div className="a-row">
            <OptionField
              name="categoryId"
              label={t('articles.category')}
              options={categories}
              value={article?.categoryId}
            />
            <OptionField
              name="heroImageId"
              label={t('articles.hero_image')}
              options={mediaList}
              value={article?.heroImageId}
            />
          </div>
        </div>

        <div className="a-card">
          <h2>{t('articles.section_copy')}</h2>
          <LocalizedField
            name="title"
            label={t('articles.f_title')}
            value={article?.title}
            required
          />
          <LocalizedField
            name="excerpt"
            label={t('articles.f_excerpt')}
            value={article?.excerpt}
            rows={3}
          />
        </div>

        <div className="a-card">
          <h2>{t('articles.section_body')}</h2>
          <LocalizedField
            name="body"
            label={t('articles.f_body')}
            value={article?.body}
            rows={18}
            hint={t('articles.f_body_hint')}
          />
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('articles.save')}
          </button>
        </div>
      </form>

      {article ? (
        <form className="a-card" action={deleteArticle.bind(null, article.id)}>
          <h2>{t('articles.section_archive')}</h2>
          <p className="a-hint">{t('articles.archive_hint')}</p>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              {t('articles.archive')}
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
