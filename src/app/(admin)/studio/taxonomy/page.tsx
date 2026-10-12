import { asc } from 'drizzle-orm'

import { db } from '@/db'
import { articleCategories, categories, regions, tags } from '@/db/schema'
import type { Localized } from '@/db/schema'
import { localeConfig, locales } from '@/i18n/config'

import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import {
  deleteArticleCategory,
  deleteCategory,
  deleteRegion,
  saveArticleCategory,
  saveCategory,
  saveRegion,
  saveTag,
  deleteTag,
} from './actions'

export const dynamic = 'force-dynamic'

type SaveAction = (id: string, form: FormData) => Promise<void>
type DeleteAction = (id: string) => Promise<void>

interface TaxonomyRow {
  id: string
  key: string
  label: Localized
  sortOrder: number
  icon?: string | null
}

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('content.write')
  const params = await searchParams

  const [categoryRows, regionRows, articleCategoryRows, tagRows] = await Promise.all([
    db
      .select({
        id: categories.id,
        key: categories.key,
        label: categories.label,
        icon: categories.icon,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.key)),
    db
      .select({
        id: regions.id,
        key: regions.key,
        label: regions.label,
        sortOrder: regions.sortOrder,
      })
      .from(regions)
      .orderBy(asc(regions.sortOrder), asc(regions.key)),
    db
      .select({
        id: articleCategories.id,
        key: articleCategories.key,
        label: articleCategories.label,
        sortOrder: articleCategories.sortOrder,
      })
      .from(articleCategories)
      .orderBy(asc(articleCategories.sortOrder), asc(articleCategories.key)),
    db
      .select({ id: tags.id, key: tags.key, label: tags.label, sortOrder: tags.sortOrder })
      .from(tags)
      .orderBy(asc(tags.sortOrder), asc(tags.key)),
  ])

  return (
    <>
      <PageHead
        title="Categories & regions"
        description="Keys are stable identifiers used in URLs and filters; labels are translated. Nothing here soft-deletes, so a row still in use cannot be removed."
      />
      <Flash searchParams={params} />

      <TaxonomySection
        title="Activity categories"
        rows={categoryRows}
        withIcon
        save={saveCategory}
        remove={deleteCategory}
      />
      <TaxonomySection title="Regions" rows={regionRows} save={saveRegion} remove={deleteRegion} />
      <TaxonomySection title="Map place tags" rows={tagRows} save={saveTag} remove={deleteTag} />
      <TaxonomySection
        title="Article categories"
        rows={articleCategoryRows}
        save={saveArticleCategory}
        remove={deleteArticleCategory}
      />
    </>
  )
}

function TaxonomySection({
  title,
  rows,
  withIcon,
  save,
  remove,
}: {
  title: string
  rows: readonly TaxonomyRow[]
  withIcon?: boolean
  save: SaveAction
  remove: DeleteAction
}) {
  return (
    <div className="a-card">
      <h2>{title}</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {rows.map((row) => (
          <form className="a-day" key={row.id} action={save.bind(null, row.id)}>
            <div className="a-row">
              <div className="a-field">
                <label htmlFor={`key-${row.id}`}>Key</label>
                <input
                  className="a-input"
                  id={`key-${row.id}`}
                  name="key"
                  defaultValue={row.key}
                  required
                />
              </div>
              {withIcon ? (
                <div className="a-field">
                  <label htmlFor={`icon-${row.id}`}>Icon</label>
                  <input
                    className="a-input"
                    id={`icon-${row.id}`}
                    name="icon"
                    defaultValue={row.icon ?? ''}
                  />
                </div>
              ) : null}
              <div className="a-field">
                <label htmlFor={`sort-${row.id}`}>Sort order</label>
                <input
                  className="a-input"
                  id={`sort-${row.id}`}
                  name="sortOrder"
                  inputMode="numeric"
                  defaultValue={String(row.sortOrder)}
                />
              </div>
            </div>

            <div className="a-l10n">
              {locales.map((locale) => (
                <div className="a-field" key={locale}>
                  <label htmlFor={`label-${row.id}-${locale}`}>{localeConfig[locale].label}</label>
                  <input
                    className="a-input"
                    id={`label-${row.id}-${locale}`}
                    name={`label_${locale}`}
                    defaultValue={row.label?.[locale] ?? ''}
                    lang={locale}
                    dir={localeConfig[locale].dir}
                    required={locale === 'en'}
                  />
                </div>
              ))}
            </div>

            <div className="a-actions">
              <button className="a-btn ghost small" type="submit">
                Save
              </button>
              <button
                className="a-btn danger small"
                type="submit"
                formAction={remove.bind(null, row.id)}
              >
                Delete
              </button>
            </div>
          </form>
        ))}
      </div>

      <form
        className="a-day"
        action={save.bind(null, 'new')}
        style={{ marginBlockStart: 'var(--space-4)' }}
      >
        <div className="a-day-no">Add new</div>
        <div className="a-row">
          <div className="a-field">
            <label htmlFor={`new-key-${title}`}>Key</label>
            <input
              className="a-input"
              id={`new-key-${title}`}
              name="key"
              required
              placeholder="lowercase-with-hyphens"
            />
          </div>
          {withIcon ? (
            <div className="a-field">
              <label htmlFor={`new-icon-${title}`}>Icon</label>
              <input className="a-input" id={`new-icon-${title}`} name="icon" />
            </div>
          ) : null}
          <div className="a-field">
            <label htmlFor={`new-sort-${title}`}>Sort order</label>
            <input
              className="a-input"
              id={`new-sort-${title}`}
              name="sortOrder"
              inputMode="numeric"
              defaultValue="0"
            />
          </div>
        </div>
        <div className="a-l10n">
          {locales.map((locale) => (
            <div className="a-field" key={locale}>
              <label htmlFor={`new-label-${title}-${locale}`}>{localeConfig[locale].label}</label>
              <input
                className="a-input"
                id={`new-label-${title}-${locale}`}
                name={`label_${locale}`}
                lang={locale}
                dir={localeConfig[locale].dir}
                required={locale === 'en'}
              />
            </div>
          ))}
        </div>
        <div className="a-actions">
          <button className="a-btn accent small" type="submit">
            Create
          </button>
        </div>
      </form>
    </div>
  )
}
