'use client'

/**
 * FAQ editor (v2, client spec «Dynamic FAQ Management»): any number of
 * questions — «+ add a question», remove, drag (or ↑/↓) to reorder, show /
 * hide without deleting, and optionally tie a question to one package. Each
 * question and answer has its own Arabic, English and Indonesian text.
 * Posted as JSON in `<name>__json` (read by `ffaqRows`).
 */

import { useId, useState } from 'react'

import { localeConfig, type Locale } from '@/i18n/config'

import { useAdminT } from './i18n-provider'
import { Arrow, Grip, useDragSort, type ScopeOption } from './sortable'

type Text = Record<Locale, string>
type Row = { id: string; q: Text; a: Text; hidden: boolean; pkg: string }

export interface FaqRepeaterEntry {
  q: Partial<Record<Locale, string>>
  a: Partial<Record<Locale, string>>
  hidden?: boolean
  pkg?: string | null
}

const ORDER: readonly Locale[] = ['ar', 'en', 'id']
const blank = (): Text => ({ ar: '', en: '', id: '' })
const text = (value: Partial<Record<Locale, string>> | undefined): Text => ({
  ar: value?.ar ?? '',
  en: value?.en ?? '',
  id: value?.id ?? '',
})

export function FaqRepeater({
  name = 'faq',
  entries,
  scopes = [],
}: {
  name?: string
  entries: readonly FaqRepeaterEntry[] | null | undefined
  scopes?: readonly ScopeOption[]
}) {
  const { t } = useAdminT()
  const uid = useId()
  const [rows, setRows] = useState<Row[]>(() =>
    (entries ?? []).map((entry, index) => ({
      id: `f${index}`,
      q: text(entry.q),
      a: text(entry.a),
      hidden: entry.hidden === true,
      pkg: entry.pkg ?? '',
    })),
  )
  const [added, setAdded] = useState(0)
  const { rowRef, handleProps, move, dragging } = useDragSort(rows, setRows)
  const setRow = (rowId: string, patch: Partial<Row>) =>
    setRows(rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))

  const payload = JSON.stringify(
    rows.map((row) => ({
      q: row.q,
      a: row.a,
      ...(row.hidden ? { hidden: true } : {}),
      ...(row.pkg ? { pkg: row.pkg } : {}),
    })),
  )

  return (
    <fieldset className="a-fieldset">
      <legend>{t('av2.faq_title')}</legend>
      <span className="a-hint">{t('av2.faq_hint')}</span>
      {rows.length === 0 ? <p className="a-hint">{t('av2.faq_empty')}</p> : null}
      <ol className="a-rep">
        {rows.map((row, index) => (
          <li
            key={row.id}
            ref={rowRef(row.id)}
            className={`a-rep-row a-faq-row${dragging === row.id ? ' is-dragging' : ''}${row.hidden ? ' is-hidden' : ''}`}
          >
            <button
              type="button"
              className="a-sort-handle"
              aria-label={t('ae.order_handle', { name: `${index + 1}` })}
              title={t('ae.rep_drag')}
              {...handleProps(row.id)}
            >
              <Grip />
            </button>
            <div className="a-rep-fields">
              {ORDER.map((locale) => (
                <label
                  key={`q-${locale}`}
                  className="a-rep-field"
                  htmlFor={`${uid}-${row.id}-q-${locale}`}
                >
                  <span>
                    {t('av2.faq_q')} · {localeConfig[locale].label}
                  </span>
                  <input
                    className="a-input"
                    id={`${uid}-${row.id}-q-${locale}`}
                    lang={locale}
                    dir={localeConfig[locale].dir}
                    value={row.q[locale]}
                    onChange={(event) =>
                      setRow(row.id, { q: { ...row.q, [locale]: event.target.value } })
                    }
                  />
                </label>
              ))}
              {ORDER.map((locale) => (
                <label
                  key={`a-${locale}`}
                  className="a-rep-field"
                  htmlFor={`${uid}-${row.id}-a-${locale}`}
                >
                  <span>
                    {t('av2.faq_a')} · {localeConfig[locale].label}
                  </span>
                  <textarea
                    className="a-input"
                    id={`${uid}-${row.id}-a-${locale}`}
                    lang={locale}
                    dir={localeConfig[locale].dir}
                    rows={3}
                    value={row.a[locale]}
                    onChange={(event) =>
                      setRow(row.id, { a: { ...row.a, [locale]: event.target.value } })
                    }
                  />
                </label>
              ))}
              <span className="a-rep-opts">
                {scopes.length > 0 ? (
                  <label className="a-rep-field" htmlFor={`${uid}-${row.id}-pkg`}>
                    <span>{t('av2.rep_scope')}</span>
                    <select
                      className="a-select"
                      id={`${uid}-${row.id}-pkg`}
                      value={row.pkg}
                      onChange={(event) => setRow(row.id, { pkg: event.target.value })}
                    >
                      <option value="">{t('av2.rep_scope_all')}</option>
                      {scopes.map((scope) => (
                        <option key={scope.value} value={scope.value}>
                          {scope.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="a-check">
                  <input
                    type="checkbox"
                    checked={!row.hidden}
                    onChange={(event) => setRow(row.id, { hidden: !event.target.checked })}
                  />{' '}
                  {t('av2.rep_visible')}
                </label>
              </span>
            </div>
            <span className="a-sort-arrows">
              <button
                type="button"
                className="a-icon-btn"
                aria-label={t('ae.rep_up', { n: index + 1 })}
                disabled={index === 0}
                onClick={() => move(row.id, -1)}
              >
                <Arrow up />
              </button>
              <button
                type="button"
                className="a-icon-btn"
                aria-label={t('ae.rep_down', { n: index + 1 })}
                disabled={index === rows.length - 1}
                onClick={() => move(row.id, 1)}
              >
                <Arrow up={false} />
              </button>
              <button
                type="button"
                className="a-icon-btn danger"
                aria-label={t('ae.rep_remove', { n: index + 1 })}
                onClick={() => setRows(rows.filter((other) => other.id !== row.id))}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="a-btn ghost small"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          setRows([...rows, { id: `n${added}`, q: blank(), a: blank(), hidden: false, pkg: '' }])
          setAdded(added + 1)
        }}
      >
        + {t('av2.faq_add')}
      </button>
      <input type="hidden" name={`${name}__json`} value={payload} />
    </fieldset>
  )
}
