import { and, asc, count, ilike, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { translations } from '@/db/schema'
import { localeConfig, locales } from '@/i18n/config'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, Table } from '../../_ui/table'
import { createTranslation, importBundledKeys, saveTranslation } from './actions'
import { contentTranslationGaps } from './missing'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 40
const LIST = adminHref('/translations')

export default async function TranslationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('translations.write')
  const { t, intl } = await getAdminI18n()
  const num = new Intl.NumberFormat(intl)
  const label = (prefix: string, value: string) => {
    const key = `${prefix}${value.toLowerCase().replace(/\s+/g, '_')}`
    const text = t(key)
    return text === key ? value : text
  }
  const params = await searchParams

  const q = param(params, 'q')
  const only = param(params, 'only')
  const page = pageParam(params)

  const filters: SQL[] = []
  if (q) {
    const like = `%${q}%`
    const match = or(
      ilike(translations.key, like),
      sql`${translations.values} ->> 'en' ilike ${like}`,
    )
    if (match) filters.push(match)
  }
  if (only === 'ar' || only === 'id') {
    filters.push(sql`coalesce(${translations.values} ->> ${only}, '') = ''`)
  }
  if (only === 'any') {
    filters.push(
      sql`coalesce(${translations.values} ->> 'ar', '') = '' or coalesce(${translations.values} ->> 'id', '') = ''`,
    )
  }

  const where = filters.length > 0 ? and(...filters) : undefined

  const [rows, [totalRow], [allRow], [gapRow], gaps] = await Promise.all([
    db
      .select()
      .from(translations)
      .where(where)
      .orderBy(asc(translations.key))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(translations).where(where),
    db.select({ value: count() }).from(translations),
    db
      .select({ value: count() })
      .from(translations)
      .where(
        sql`coalesce(${translations.values} ->> 'ar', '') = '' or coalesce(${translations.values} ->> 'id', '') = ''`,
      ),
    contentTranslationGaps(),
  ])

  const total = totalRow?.value ?? 0
  const allKeys = allRow?.value ?? 0
  const incompleteKeys = gapRow?.value ?? 0

  return (
    <>
      <PageHead
        title={t('translations.title')}
        description={t('translations.description')}
        actions={
          <form className="a-inline-form" action={importBundledKeys}>
            <button className="a-btn ghost" type="submit">
              {t('translations.import_btn')}
            </button>
          </form>
        }
      />
      <Flash searchParams={params} />

      <div className="a-grid">
        <div className="a-stat">
          <span>{t('translations.stat_keys')}</span>
          <b>{num.format(allKeys)}</b>
        </div>
        <div className="a-stat">
          <span>{t('translations.stat_incomplete')}</span>
          <b>{num.format(incompleteKeys)}</b>
        </div>
        <div className="a-stat">
          <span>{t('translations.stat_matching')}</span>
          <b>{num.format(total)}</b>
        </div>
      </div>

      {allKeys === 0 ? <div className="a-flash warn">{t('translations.empty_db')}</div> : null}

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">{t('translations.search')}</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('translations.search_placeholder')}
          />
        </div>
        <div className="a-field">
          <label htmlFor="only">{t('translations.show')}</label>
          <select className="a-select" id="only" name="only" defaultValue={only ?? ''}>
            <option value="">{t('translations.show_all')}</option>
            <option value="any">{t('translations.show_any')}</option>
            <option value="ar">{t('translations.show_ar')}</option>
            <option value="id">{t('translations.show_id')}</option>
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('translations.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('translations.reset')}
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('translations.empty')}</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {rows.map((row) => (
            <form className="a-day" key={row.id} action={saveTranslation.bind(null, row.id)}>
              <div className="a-day-head">
                <div className="a-day-no a-mono">{row.key}</div>
                <div className="a-actions">
                  {locales
                    .filter((locale) => (row.values?.[locale] ?? '') === '')
                    .map((locale) => (
                      <Pill tone="warn" key={locale}>
                        {t('translations.missing_locale', {
                          locale: t(`translations.lang_${locale}`),
                        })}
                      </Pill>
                    ))}
                  <button className="a-btn ghost small" type="submit">
                    {t('translations.save')}
                  </button>
                </div>
              </div>
              <div className="a-l10n">
                {locales.map((locale) => (
                  <div className="a-field" key={locale}>
                    <label htmlFor={`t-${row.id}-${locale}`}>
                      {t(`translations.lang_${locale}`)}
                    </label>
                    <textarea
                      className="a-textarea"
                      id={`t-${row.id}-${locale}`}
                      name={`values_${locale}`}
                      rows={2}
                      defaultValue={row.values?.[locale] ?? ''}
                      lang={locale}
                      dir={localeConfig[locale].dir}
                    />
                  </div>
                ))}
              </div>
            </form>
          ))}
        </div>
      )}

      <Pager basePath={LIST} searchParams={params} page={page} pageSize={PAGE_SIZE} total={total} />

      <form className="a-card" action={createTranslation}>
        <h2>{t('translations.add_title')}</h2>
        <div className="a-row">
          <div className="a-field">
            <label htmlFor="new-key">{t('translations.key')}</label>
            <input
              className="a-input"
              id="new-key"
              name="key"
              required
              placeholder="nav_something"
            />
          </div>
        </div>
        <div className="a-l10n">
          {locales.map((locale) => (
            <div className="a-field" key={locale}>
              <label htmlFor={`new-t-${locale}`}>{t(`translations.lang_${locale}`)}</label>
              <textarea
                className="a-textarea"
                id={`new-t-${locale}`}
                name={`values_${locale}`}
                rows={2}
                lang={locale}
                dir={localeConfig[locale].dir}
                required={locale === 'en'}
              />
            </div>
          ))}
        </div>
        <div className="a-actions" style={{ marginBlockStart: 12 }}>
          <button className="a-btn accent" type="submit">
            {t('translations.add_btn')}
          </button>
        </div>
      </form>

      <div className="a-card">
        <h2>{t('translations.gaps_title')}</h2>
        <p className="a-hint">{t('translations.gaps_hint')}</p>
        <Table>
          <thead>
            <tr>
              <th>{t('translations.col_entity')}</th>
              <th>{t('translations.col_field')}</th>
              <th className="num">{t('translations.col_rows')}</th>
              <th className="num">{t('translations.col_missing_ar')}</th>
              <th className="num">{t('translations.col_missing_id')}</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((gap) => (
              <tr key={`${gap.entity}-${gap.field}`}>
                <td>{label('translations.entity_', gap.entity)}</td>
                <td>{label('translations.field_', gap.field)}</td>
                <td className="num">{num.format(gap.total)}</td>
                <td className="num">
                  {gap.missingAr > 0 ? (
                    <Pill tone="warn">{num.format(gap.missingAr)}</Pill>
                  ) : (
                    num.format(gap.missingAr)
                  )}
                </td>
                <td className="num">
                  {gap.missingId > 0 ? (
                    <Pill tone="warn">{num.format(gap.missingId)}</Pill>
                  ) : (
                    num.format(gap.missingId)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  )
}
