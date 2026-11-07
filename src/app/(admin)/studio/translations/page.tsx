import Link from 'next/link'

import { localeConfig } from '@/i18n/config'
import { BUNDLED_MESSAGES } from '@/lib/content/home-content-bundled'
import { MESSAGE_LOCALES, wordDiff, type MessageLocale } from '@/lib/content/message-overrides'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { loadSiteTexts } from '../../_lib/site-texts'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, Table } from '../../_ui/table'
import { resetSiteTextAction, saveSiteText } from './actions'
import { contentTranslationGaps } from './missing'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30
const LIST = adminHref('/translations')

const BUNDLED = BUNDLED_MESSAGES as Record<MessageLocale, Record<string, unknown>>
const ALL_KEYS: readonly string[] = [
  ...new Set(MESSAGE_LOCALES.flatMap((locale) => Object.keys(BUNDLED[locale] ?? {}))),
].sort()

function bundled(key: string, locale: MessageLocale): string {
  const value = BUNDLED[locale]?.[key]
  return typeof value === 'string' ? value : ''
}

/** Lower-case, no Arabic diacritics/tatweel: search matches what people type. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640\u0300-\u036f]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
}

/**
 * «الترجمات» — every text of the public site (the bundled message
 * catalogues), editable per language. A save is live on the site within
 * seconds; «إرجاع للأصل» drops the change. Untouched keys follow the shipped
 * copy, so the site looks identical until something is edited here.
 */
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

  const q = (param(params, 'q') ?? '').trim()
  const only = param(params, 'only') ?? ''
  const page = pageParam(params)

  const [overrides, gaps] = await Promise.all([loadSiteTexts(), contentTranslationGaps()])
  const current = (key: string, locale: MessageLocale) =>
    overrides[key]?.[locale] ?? bundled(key, locale)

  const needle = fold(q)
  const matches = ALL_KEYS.filter((key) => {
    if (only === 'edited' && !overrides[key]) return false
    if (only === 'missing' && MESSAGE_LOCALES.every((locale) => current(key, locale) !== '')) {
      return false
    }
    if (needle === '') return true
    if (key.toLowerCase().includes(needle)) return true
    return MESSAGE_LOCALES.some(
      (locale) =>
        fold(bundled(key, locale)).includes(needle) ||
        fold(overrides[key]?.[locale] ?? '').includes(needle),
    )
  })
  const rows = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const editedCount = Object.keys(overrides).length

  const query = new URLSearchParams()
  if (q) query.set('q', q)
  if (only) query.set('only', only)
  if (page > 1) query.set('page', String(page))
  const back = query.size > 0 ? `${LIST}?${query}` : LIST

  return (
    <>
      <PageHead
        title={t('translations.title')}
        description={t('tr2.description')}
        actions={
          <a className="a-btn ghost" href="/" target="_blank" rel="noreferrer">
            {t('hc.view_site')}
          </a>
        }
      />
      <Flash searchParams={params} />

      <div className="a-grid">
        <div className="a-stat">
          <span>{t('translations.stat_keys')}</span>
          <b>{num.format(ALL_KEYS.length)}</b>
        </div>
        <div className="a-stat">
          <span>{t('tr2.stat_edited')}</span>
          <b>{num.format(editedCount)}</b>
        </div>
        <div className="a-stat">
          <span>{t('translations.stat_matching')}</span>
          <b>{num.format(matches.length)}</b>
        </div>
      </div>

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">{t('translations.search')}</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q}
            placeholder={t('tr2.search_placeholder')}
          />
        </div>
        <div className="a-field">
          <label htmlFor="only">{t('translations.show')}</label>
          <select className="a-select" id="only" name="only" defaultValue={only}>
            <option value="">{t('translations.show_all')}</option>
            <option value="edited">{t('tr2.show_edited')}</option>
            <option value="missing">{t('translations.show_any')}</option>
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
        <div className="tr2-list">
          {rows.map((key) => {
            const edited = overrides[key]
            return (
              <div className="a-day" key={key}>
                <form action={saveSiteText.bind(null, key)}>
                  <input type="hidden" name="back" value={back} />
                  <div className="a-day-head">
                    <div className="a-day-no">
                      <span dir="auto">{headingOf(current(key, 'ar') || current(key, 'en'))}</span>
                      <span className="a-hint a-mono" dir="ltr" style={{ marginInlineStart: 8 }}>
                        {key}
                      </span>
                    </div>
                    <div className="a-actions">
                      {edited ? <Pill tone="info">{t('tr2.edited_pill')}</Pill> : null}
                      {MESSAGE_LOCALES.filter((locale) => current(key, locale) === '').map(
                        (locale) => (
                          <Pill tone="warn" key={locale}>
                            {t('translations.missing_locale', {
                              locale: t(`translations.lang_${locale}`),
                            })}
                          </Pill>
                        ),
                      )}
                      <button className="a-btn primary small" type="submit">
                        {t('translations.save')}
                      </button>
                    </div>
                  </div>
                  <div className="a-l10n">
                    {MESSAGE_LOCALES.map((locale) => (
                      <div className="a-field" key={locale}>
                        <label htmlFor={`t-${key}-${locale}`}>
                          {t(`translations.lang_${locale}`)}
                          {edited?.[locale] !== undefined ? ' ●' : ''}
                        </label>
                        <textarea
                          className="a-textarea"
                          id={`t-${key}-${locale}`}
                          name={`t__${key}__${locale}`}
                          rows={current(key, locale).length > 90 ? 4 : 2}
                          defaultValue={current(key, locale)}
                          lang={locale}
                          dir={localeConfig[locale].dir}
                          maxLength={4000}
                        />
                      </div>
                    ))}
                  </div>
                </form>
                {edited ? (
                  <details className="tr2-diff">
                    <summary>{t('tr2.diff')}</summary>
                    {MESSAGE_LOCALES.filter((locale) => edited[locale] !== undefined).map(
                      (locale) => (
                        <p key={locale} dir={localeConfig[locale].dir} lang={locale}>
                          <b>{t(`translations.lang_${locale}`)}: </b>
                          {wordDiff(bundled(key, locale), edited[locale] ?? '').map(
                            (part, index) =>
                              part.op === 'eq' ? (
                                <span key={index}>{part.text}</span>
                              ) : part.op === 'del' ? (
                                <del key={index}>{part.text}</del>
                              ) : (
                                <ins key={index}>{part.text}</ins>
                              ),
                          )}
                        </p>
                      ),
                    )}
                    <form action={resetSiteTextAction.bind(null, key)}>
                      <input type="hidden" name="back" value={back} />
                      <button className="a-btn ghost small" type="submit">
                        {t('tr2.reset_key')}
                      </button>
                    </form>
                  </details>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      <Pager
        basePath={LIST}
        searchParams={params}
        page={page}
        pageSize={PAGE_SIZE}
        total={matches.length}
      />

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

/** The text itself, shortened for a heading. */
function headingOf(text: string): string {
  const clean = text.trim()
  return clean.length > 90 ? `${clean.slice(0, 90)}…` : clean
}
