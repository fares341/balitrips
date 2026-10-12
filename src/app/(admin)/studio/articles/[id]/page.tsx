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
        title={article ? pick(article.title, 'en', article.slug) : 'New article'}
        description="The body is plain text with blank lines between paragraphs. It is stored per locale, so the Arabic article is a real translation rather than the English one with a different heading."
        actions={
          <Link className="a-btn ghost" href={adminHref('/articles')}>
            Back to list
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveArticle.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>Identity</h2>
          <div className="a-row">
            <Field label="Slug *" htmlFor="slug">
              <TextInput
                id="slug"
                name="slug"
                defaultValue={article?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Field label="Legacy id" htmlFor="legacyId">
              <TextInput id="legacyId" name="legacyId" defaultValue={article?.legacyId ?? ''} />
            </Field>
            <StatusField value={article?.status} />
            <Field
              label="In-article CTA"
              htmlFor="bridge"
              hint="Where the mid-article call to action sends the reader."
            >
              <Select id="bridge" name="bridge" defaultValue={article?.bridge ?? ''}>
                <option value="">— none —</option>
                <option value="map">Map</option>
                <option value="activities">Activities</option>
                <option value="driver">Driver</option>
              </Select>
            </Field>
            <Field
              label="Who can read"
              htmlFor="requiredEntitlement"
              hint="Title, excerpt and hero are always public. The body is sent only to readers with this plan; others see a paywall."
            >
              <Select
                id="requiredEntitlement"
                name="requiredEntitlement"
                defaultValue={article?.requiredEntitlement ?? ''}
              >
                <option value="">Everyone</option>
                <option value="map_access">Map plan holders</option>
                <option value="vip">VIP</option>
              </Select>
            </Field>
          </div>
          <div className="a-row">
            <OptionField
              name="categoryId"
              label="Category"
              options={categories}
              value={article?.categoryId}
            />
            <OptionField
              name="heroImageId"
              label="Hero image"
              options={mediaList}
              value={article?.heroImageId}
            />
          </div>
        </div>

        <div className="a-card">
          <h2>Copy</h2>
          <LocalizedField name="title" label="Title" value={article?.title} required />
          <LocalizedField name="excerpt" label="Excerpt" value={article?.excerpt} rows={3} />
        </div>

        <div className="a-card">
          <h2>Body</h2>
          <LocalizedField
            name="body"
            label="Article body"
            value={article?.body}
            rows={18}
            hint="Separate paragraphs with a blank line. Required in English before publishing."
          />
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            Save article
          </button>
        </div>
      </form>

      {article ? (
        <form className="a-card" action={deleteArticle.bind(null, article.id)}>
          <h2>Archive</h2>
          <p className="a-hint">Soft delete. The URL stops resolving; the row stays for audit.</p>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              Archive article
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
