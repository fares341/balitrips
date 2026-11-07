'use client'

/**
 * Links editor for the header / footer («محتوى الموقع»): each link has an
 * address and a label in ar / en / id; add, remove, drag (or ↑/↓) to
 * reorder. Posted as JSON in `<name>__json`; `<name>__custom` = "1" once the
 * list is being edited (an untouched list keeps the shipped one).
 */

import { useId, useState } from 'react'

import { localeConfig, type Locale } from '@/i18n/config'

import { useAdminT } from './i18n-provider'
import { Arrow, Grip, useDragSort } from './sortable'

export interface LinkRow {
  href: string
  label: Partial<Record<Locale, string>>
  key?: string
}

type Row = { id: string; href: string; label: Record<Locale, string>; key?: string }

const ORDER: readonly Locale[] = ['ar', 'en', 'id']

export function LinkRepeater({
  name,
  legend,
  hint,
  links,
  custom,
}: {
  name: string
  legend: string
  hint?: string
  /** The current links (the shipped ones, with their labels, when not custom). */
  links: readonly LinkRow[]
  /** Whether a custom list is saved now. */
  custom: boolean
}) {
  const { t } = useAdminT()
  const uid = useId()
  const [rows, setRows] = useState<Row[]>(() =>
    links.map((link, index) => ({
      id: `l${index}`,
      href: link.href,
      label: { ar: link.label.ar ?? '', en: link.label.en ?? '', id: link.label.id ?? '' },
      ...(link.key ? { key: link.key } : {}),
    })),
  )
  const [touched, setTouched] = useState(custom)
  const [added, setAdded] = useState(0)
  const update = (next: Row[]) => {
    setRows(next)
    setTouched(true)
  }
  const { rowRef, handleProps, move, dragging } = useDragSort(rows, update)
  const setRow = (id: string, patch: Partial<Row>) =>
    update(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  const payload = JSON.stringify(
    rows.map((row) => ({ href: row.href, label: row.label, ...(row.key ? { key: row.key } : {}) })),
  )

  return (
    <fieldset className="a-fieldset">
      <legend>{legend}</legend>
      {hint ? <span className="a-hint">{hint}</span> : null}
      <ol className="a-rep">
        {rows.map((row, index) => (
          <li
            key={row.id}
            ref={rowRef(row.id)}
            className={`a-rep-row${dragging === row.id ? ' is-dragging' : ''}`}
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
              <label className="a-rep-field" htmlFor={`${uid}-${row.id}-href`}>
                <span>{t('sc.link_href')}</span>
                <input
                  className="a-input"
                  id={`${uid}-${row.id}-href`}
                  dir="ltr"
                  value={row.href}
                  placeholder="/activities"
                  onChange={(event) => setRow(row.id, { href: event.target.value })}
                />
              </label>
              {ORDER.map((locale) => (
                <label key={locale} className="a-rep-field" htmlFor={`${uid}-${row.id}-${locale}`}>
                  <span>
                    {t('sc.link_label')} · {localeConfig[locale].label}
                  </span>
                  <input
                    className="a-input"
                    id={`${uid}-${row.id}-${locale}`}
                    lang={locale}
                    dir={localeConfig[locale].dir}
                    value={row.label[locale]}
                    onChange={(event) =>
                      setRow(row.id, { label: { ...row.label, [locale]: event.target.value } })
                    }
                  />
                </label>
              ))}
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
                onClick={() => update(rows.filter((one) => one.id !== row.id))}
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
          setAdded(added + 1)
          update([...rows, { id: `n${added}`, href: '/', label: { ar: '', en: '', id: '' } }])
        }}
      >
        + {t('sc.link_add')}
      </button>
      <input type="hidden" name={`${name}__json`} value={payload} />
      <input type="hidden" name={`${name}__custom`} value={touched ? '1' : ''} />
    </fieldset>
  )
}
