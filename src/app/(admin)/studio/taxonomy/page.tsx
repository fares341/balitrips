import { asc } from 'drizzle-orm'

import { db } from '@/db'
import { articleCategories, categories, regions, tags } from '@/db/schema'
import type { Localized } from '@/db/schema'
import { localeConfig, locales } from '@/i18n/config'

import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import type { Translate } from '../../_i18n'
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
  description?: Localized | null
  status?: string
  parentId?: string | null
  centerLat?: number | null
  centerLon?: number | null
  radiusKm?: number | null
}

/** حقول إضافية: الوصف والحالة (تصنيف ومنطقة)، والأب والمركز ونصف القطر (منطقة). */
type Extra = { kind: 'category' } | { kind: 'region'; parents: { id: string; label: string }[] }

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const params = await searchParams

  const [categoryRows, regionRows, articleCategoryRows, tagRows] = await Promise.all([
    db
      .select({
        id: categories.id,
        key: categories.key,
        label: categories.label,
        icon: categories.icon,
        sortOrder: categories.sortOrder,
        description: categories.description,
        status: categories.status,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.key)),
    db
      .select({
        id: regions.id,
        key: regions.key,
        label: regions.label,
        sortOrder: regions.sortOrder,
        description: regions.description,
        status: regions.status,
        parentId: regions.parentId,
        centerLat: regions.centerLat,
        centerLon: regions.centerLon,
        radiusKm: regions.radiusKm,
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
      <PageHead title={t('taxonomy.title')} description={t('taxonomy.description')} />
      <Flash searchParams={params} />

      <TaxonomySection
        t={t}
        title={t('taxonomy.sec_categories')}
        rows={categoryRows}
        withIcon
        save={saveCategory}
        remove={deleteCategory}
        extra={{ kind: 'category' }}
      />
      <TaxonomySection
        t={t}
        title={t('taxonomy.sec_areas')}
        rows={regionRows}
        save={saveRegion}
        remove={deleteRegion}
        extra={{
          kind: 'region',
          parents: regionRows
            .filter((row) => row.parentId === null)
            .map((row) => ({ id: row.id, label: row.label.en || row.key })),
        }}
      />
      <TaxonomySection
        t={t}
        title={t('taxonomy.sec_tags')}
        rows={tagRows}
        save={saveTag}
        remove={deleteTag}
      />
      <TaxonomySection
        t={t}
        title={t('taxonomy.sec_article_categories')}
        rows={articleCategoryRows}
        save={saveArticleCategory}
        remove={deleteArticleCategory}
      />
    </>
  )
}

function ExtraFields({
  t,
  extra,
  row,
  idPrefix,
}: {
  t: Translate
  extra: Extra
  row?: TaxonomyRow
  idPrefix: string
}) {
  return (
    <>
      <div className="a-row">
        <div className="a-field">
          <label htmlFor={`${idPrefix}-status`}>{t('common.status')}</label>
          <select
            className="a-input"
            id={`${idPrefix}-status`}
            name="status"
            defaultValue={row?.status ?? 'active'}
          >
            <option value="active">{t('common.active')}</option>
            <option value="inactive">{t('common.inactive')}</option>
          </select>
        </div>
        {extra.kind === 'region' ? (
          <>
            <div className="a-field">
              <label htmlFor={`${idPrefix}-parent`}>{t('taxonomy.parent')}</label>
              <select
                className="a-input"
                id={`${idPrefix}-parent`}
                name="parentId"
                defaultValue={row?.parentId ?? ''}
              >
                <option value="">{t('taxonomy.top_level')}</option>
                {extra.parents
                  .filter((parent) => parent.id !== row?.id)
                  .map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="a-field">
              <label htmlFor={`${idPrefix}-lat`}>{t('taxonomy.center_lat')}</label>
              <input
                className="a-input"
                id={`${idPrefix}-lat`}
                name="centerLat"
                inputMode="decimal"
                defaultValue={row?.centerLat ?? ''}
                placeholder="-8.7180"
              />
            </div>
            <div className="a-field">
              <label htmlFor={`${idPrefix}-lon`}>{t('taxonomy.center_lon')}</label>
              <input
                className="a-input"
                id={`${idPrefix}-lon`}
                name="centerLon"
                inputMode="decimal"
                defaultValue={row?.centerLon ?? ''}
                placeholder="115.1686"
              />
            </div>
            <div className="a-field">
              <label htmlFor={`${idPrefix}-radius`}>{t('taxonomy.radius_km')}</label>
              <input
                className="a-input"
                id={`${idPrefix}-radius`}
                name="radiusKm"
                inputMode="decimal"
                defaultValue={row?.radiusKm ?? ''}
              />
            </div>
          </>
        ) : null}
      </div>
      <div className="a-l10n">
        {locales.map((locale) => (
          <div className="a-field" key={locale}>
            <label htmlFor={`${idPrefix}-desc-${locale}`}>
              {t('taxonomy.description_locale', { language: localeConfig[locale].label })}
            </label>
            <textarea
              className="a-input"
              id={`${idPrefix}-desc-${locale}`}
              name={`description_${locale}`}
              rows={2}
              defaultValue={row?.description?.[locale] ?? ''}
              lang={locale}
              dir={localeConfig[locale].dir}
            />
          </div>
        ))}
      </div>
    </>
  )
}

function TaxonomySection({
  t,
  title,
  rows,
  withIcon,
  save,
  remove,
  extra,
}: {
  t: Translate
  title: string
  rows: readonly TaxonomyRow[]
  withIcon?: boolean
  save: SaveAction
  remove: DeleteAction
  extra?: Extra
}) {
  return (
    <div className="a-card">
      <h2>{title}</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {rows.map((row) => (
          <form className="a-day" key={row.id} action={save.bind(null, row.id)}>
            <div className="a-row">
              <div className="a-field">
                <label htmlFor={`key-${row.id}`}>{t('taxonomy.key')}</label>
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
                  <label htmlFor={`icon-${row.id}`}>{t('taxonomy.icon')}</label>
                  <input
                    className="a-input"
                    id={`icon-${row.id}`}
                    name="icon"
                    defaultValue={row.icon ?? ''}
                  />
                </div>
              ) : null}
              <div className="a-field">
                <label htmlFor={`sort-${row.id}`}>{t('taxonomy.sort_order')}</label>
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

            {extra ? <ExtraFields t={t} extra={extra} row={row} idPrefix={`x-${row.id}`} /> : null}

            <div className="a-actions">
              <button className="a-btn ghost small" type="submit">
                {t('common.save')}
              </button>
              <button
                className="a-btn danger small"
                type="submit"
                formAction={remove.bind(null, row.id)}
              >
                {t('common.delete')}
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
        <div className="a-day-no">{t('taxonomy.add_new')}</div>
        <div className="a-row">
          <div className="a-field">
            <label htmlFor={`new-key-${title}`}>{t('taxonomy.key')}</label>
            <input
              className="a-input"
              id={`new-key-${title}`}
              name="key"
              required
              placeholder={t('taxonomy.key_placeholder')}
            />
          </div>
          {withIcon ? (
            <div className="a-field">
              <label htmlFor={`new-icon-${title}`}>{t('taxonomy.icon')}</label>
              <input className="a-input" id={`new-icon-${title}`} name="icon" />
            </div>
          ) : null}
          <div className="a-field">
            <label htmlFor={`new-sort-${title}`}>{t('taxonomy.sort_order')}</label>
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
        {extra ? <ExtraFields t={t} extra={extra} idPrefix={`x-new-${title}`} /> : null}
        <div className="a-actions">
          <button className="a-btn accent small" type="submit">
            {t('common.create')}
          </button>
        </div>
      </form>
    </div>
  )
}
