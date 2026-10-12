import { and, asc, count, ilike, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { translations } from '@/db/schema'
import { localeConfig, locales } from '@/i18n/config'

import { adminHref } from '../../_lib/admin-path'
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
        title="Translations"
        description="UI strings, editable without a deploy. Content copy is translated in each entity's own editor; the report below shows how far behind it is."
        actions={
          <form className="a-inline-form" action={importBundledKeys}>
            <button className="a-btn ghost" type="submit">
              Import bundled keys
            </button>
          </form>
        }
      />
      <Flash searchParams={params} />

      <div className="a-grid">
        <div className="a-stat">
          <span>Keys in database</span>
          <b>{allKeys}</b>
        </div>
        <div className="a-stat">
          <span>Incomplete keys</span>
          <b>{incompleteKeys}</b>
        </div>
        <div className="a-stat">
          <span>Matching filter</span>
          <b>{total}</b>
        </div>
      </div>

      {allKeys === 0 ? (
        <div className="a-flash warn">
          No keys in the database yet. &ldquo;Import bundled keys&rdquo; copies every string from
          messages/en.json, messages/ar.json and messages/id.json. It never overwrites a row that
          already exists.
        </div>
      ) : null}

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">Search</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Key or English text"
          />
        </div>
        <div className="a-field">
          <label htmlFor="only">Show</label>
          <select className="a-select" id="only" name="only" defaultValue={only ?? ''}>
            <option value="">Everything</option>
            <option value="any">Missing any locale</option>
            <option value="ar">Missing Arabic</option>
            <option value="id">Missing Indonesian</option>
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            Filter
          </button>
          <Link className="a-btn ghost" href={LIST}>
            Reset
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>No keys match those filters.</Empty>
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
                        missing {locale}
                      </Pill>
                    ))}
                  <button className="a-btn ghost small" type="submit">
                    Save
                  </button>
                </div>
              </div>
              <div className="a-l10n">
                {locales.map((locale) => (
                  <div className="a-field" key={locale}>
                    <label htmlFor={`t-${row.id}-${locale}`}>{localeConfig[locale].label}</label>
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
        <h2>Add a key</h2>
        <div className="a-row">
          <div className="a-field">
            <label htmlFor="new-key">Key</label>
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
              <label htmlFor={`new-t-${locale}`}>{localeConfig[locale].label}</label>
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
            Add key
          </button>
        </div>
      </form>

      <div className="a-card">
        <h2>Missing translations across content</h2>
        <p className="a-hint">
          English is the authoring locale, so a fresh record is legitimately English-only. A blank
          locale falls back to English at render time rather than showing an empty field, so this is
          a completeness queue, not a list of bugs.
        </p>
        <Table>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Field</th>
              <th className="num">Rows</th>
              <th className="num">Missing Arabic</th>
              <th className="num">Missing Indonesian</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((gap) => (
              <tr key={`${gap.entity}-${gap.field}`}>
                <td>{gap.entity}</td>
                <td>{gap.field}</td>
                <td className="num">{gap.total}</td>
                <td className="num">
                  {gap.missingAr > 0 ? <Pill tone="warn">{gap.missingAr}</Pill> : gap.missingAr}
                </td>
                <td className="num">
                  {gap.missingId > 0 ? <Pill tone="warn">{gap.missingId}</Pill> : gap.missingId}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  )
}
