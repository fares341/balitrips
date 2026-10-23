'use client'

/**
 * Reordering in the Studio, without a library.
 *
 *  - `useDragSort`: drag a row by its handle (pointer events: mouse, touch and
 *    pen alike), or press ↑/↓ on the focused handle. Rows move live while
 *    dragging; `onCommit` runs once on release.
 *  - `SortableList`: rows rendered by the server (`content`), each with a
 *    handle and up/down buttons. With `onSave` (a server action) the new order
 *    is saved automatically; with `name` it is posted with the surrounding
 *    form as hidden inputs, in order.
 *  - `GalleryEditor`: the activity's extra photos — reorder, remove, and add
 *    from the media library — posted as `name` (ordered ids).
 *  - `LocalizedRepeater`: a list of short texts in ar / en / id with add,
 *    remove and reorder, posted as JSON in `<name>__json`.
 */

import {
  useCallback,
  useId,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

import { localeConfig, type Locale } from '@/i18n/config'

import { useAdminT } from './i18n-provider'

// ---------------------------------------------------------------------------
// Drag logic
// ---------------------------------------------------------------------------

function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (item === undefined) return [...list]
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item)
  return next
}

export function useDragSort<T extends { id: string }>(
  items: readonly T[],
  setItems: (next: T[]) => void,
  onCommit?: (next: T[]) => void,
) {
  const rows = useRef(new Map<string, HTMLElement>())
  const drag = useRef<{ id: string; pointer: number } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  const rowRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(id, el)
    else rows.current.delete(id)
  }

  const move = (id: string, delta: number) => {
    const from = items.findIndex((item) => item.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= items.length) return
    const next = moveItem(items, from, to)
    setItems(next)
    onCommit?.(next)
  }

  const handleProps = (id: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { id, pointer: event.pointerId }
      setDragging(id)
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current
      if (!current || current.pointer !== event.pointerId) return
      const from = items.findIndex((item) => item.id === current.id)
      if (from < 0) return
      let to = from
      items.forEach((item, index) => {
        const el = rows.current.get(item.id)
        if (!el || index === from) return
        const box = el.getBoundingClientRect()
        const middle = box.top + box.height / 2
        if (index < from && event.clientY < middle) to = Math.min(to, index)
        if (index > from && event.clientY > middle) to = Math.max(to, index)
      })
      if (to !== from) setItems(moveItem(items, from, to))
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      if (!drag.current || drag.current.pointer !== event.pointerId) return
      drag.current = null
      setDragging(null)
      onCommit?.([...items])
    },
    onPointerCancel: () => {
      drag.current = null
      setDragging(null)
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === 'ArrowUp') move(id, -1)
      else if (event.key === 'ArrowDown') move(id, 1)
      else return
      event.preventDefault()
    },
  })

  return { rowRef, handleProps, move, dragging }
}

export function Grip() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <circle cx="5" cy="3" r="1.4" />
      <circle cx="11" cy="3" r="1.4" />
      <circle cx="5" cy="8" r="1.4" />
      <circle cx="11" cy="8" r="1.4" />
      <circle cx="5" cy="13" r="1.4" />
      <circle cx="11" cy="13" r="1.4" />
    </svg>
  )
}

export function Arrow({ up }: { up: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {up ? <path d="m6 15 6-6 6 6" /> : <path d="m6 9 6 6 6-6" />}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Sortable list (server-rendered rows)
// ---------------------------------------------------------------------------

export interface SortRow {
  id: string
  /** Accessible name of the row ("Mount Batur Sunrise Hike"). */
  label: string
  content: ReactNode
}

export function SortableList({
  rows: initial,
  onSave,
  name,
  hint,
}: {
  rows: SortRow[]
  /** Saves the new order (ids, top first). Returns false on failure. */
  onSave?: (ids: string[]) => Promise<boolean>
  /** Posts the order with the surrounding form instead. */
  name?: string
  hint?: string
}) {
  const { t } = useAdminT()
  const [rows, setRows] = useState(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [, startTransition] = useTransition()

  const commit = useCallback(
    (next: SortRow[]) => {
      if (!onSave) return
      setStatus('saving')
      startTransition(async () => {
        const ok = await onSave(next.map((row) => row.id)).catch(() => false)
        setStatus(ok ? 'saved' : 'failed')
      })
    },
    [onSave],
  )
  const { rowRef, handleProps, move, dragging } = useDragSort(rows, setRows, commit)

  return (
    <div className="a-sort">
      {hint ? <p className="a-hint">{hint}</p> : null}
      <ol className="a-sort-list">
        {rows.map((row, index) => (
          <li
            key={row.id}
            ref={rowRef(row.id)}
            className={dragging === row.id ? 'a-sort-row is-dragging' : 'a-sort-row'}
          >
            <button
              type="button"
              className="a-sort-handle"
              aria-label={t('ae.order_handle', { name: row.label })}
              title={t('ae.rep_drag')}
              {...handleProps(row.id)}
            >
              <Grip />
            </button>
            <div className="a-sort-content">{row.content}</div>
            <span className="a-sort-arrows">
              <button
                type="button"
                className="a-icon-btn"
                aria-label={`${t('ae.order_up')}: ${row.label}`}
                disabled={index === 0}
                onClick={() => move(row.id, -1)}
              >
                <Arrow up />
              </button>
              <button
                type="button"
                className="a-icon-btn"
                aria-label={`${t('ae.order_down')}: ${row.label}`}
                disabled={index === rows.length - 1}
                onClick={() => move(row.id, 1)}
              >
                <Arrow up={false} />
              </button>
            </span>
            {name ? <input type="hidden" name={name} value={row.id} /> : null}
          </li>
        ))}
      </ol>
      {onSave ? (
        <p className="a-hint a-sort-status" role="status" aria-live="polite">
          {status === 'saving'
            ? t('ae.order_saving')
            : status === 'saved'
              ? t('ae.order_saved')
              : status === 'failed'
                ? t('ae.order_failed')
                : ''}
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gallery editor
// ---------------------------------------------------------------------------

export interface GalleryPick {
  id: string
  url: string
  label: string
}

export function GalleryEditor({
  name,
  initial,
  library,
  label,
  hint,
}: {
  name: string
  initial: GalleryPick[]
  library: GalleryPick[]
  label: string
  hint?: string
}) {
  const { t } = useAdminT()
  const [items, setItems] = useState(initial)
  const [picking, setPicking] = useState(false)
  const { rowRef, handleProps, move, dragging } = useDragSort(items, setItems)
  const chosen = new Set(items.map((item) => item.id))

  return (
    <fieldset className="a-fieldset">
      <legend>{label}</legend>
      {hint ? <span className="a-hint">{hint}</span> : null}
      {items.length === 0 ? (
        <p className="a-hint">{t('ae.gallery_empty')}</p>
      ) : (
        <ol className="a-gal">
          {items.map((item, index) => (
            <li
              key={item.id}
              ref={rowRef(item.id)}
              className={dragging === item.id ? 'a-gal-item is-dragging' : 'a-gal-item'}
            >
              <button
                type="button"
                className="a-sort-handle"
                aria-label={t('ae.order_handle', { name: `${index + 1}` })}
                title={t('ae.rep_drag')}
                {...handleProps(item.id)}
              >
                <Grip />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
              <img src={item.url} alt="" loading="lazy" />
              <span className="a-gal-label" title={item.label}>
                {index + 1}. {item.label}
              </span>
              <span className="a-sort-arrows">
                <button
                  type="button"
                  className="a-icon-btn"
                  aria-label={t('ae.gallery_up', { n: index + 1 })}
                  disabled={index === 0}
                  onClick={() => move(item.id, -1)}
                >
                  <Arrow up />
                </button>
                <button
                  type="button"
                  className="a-icon-btn"
                  aria-label={t('ae.gallery_down', { n: index + 1 })}
                  disabled={index === items.length - 1}
                  onClick={() => move(item.id, 1)}
                >
                  <Arrow up={false} />
                </button>
                <button
                  type="button"
                  className="a-icon-btn danger"
                  aria-label={t('ae.gallery_remove', { n: index + 1 })}
                  onClick={() => setItems(items.filter((other) => other.id !== item.id))}
                >
                  ×
                </button>
              </span>
              <input type="hidden" name={name} value={item.id} />
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        className="a-btn ghost small"
        aria-expanded={picking}
        onClick={() => setPicking((open) => !open)}
        style={{ alignSelf: 'flex-start' }}
      >
        {picking ? t('ae.gallery_close') : t('ae.gallery_add')}
      </button>
      {picking ? (
        library.length === 0 ? (
          <p className="a-hint">{t('ae.gallery_library_empty')}</p>
        ) : (
          <div className="a-gal-pick">
            {library.map((item) => {
              const added = chosen.has(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={added}
                  disabled={added}
                  aria-label={`${t('ae.gallery_pick')}: ${item.label}`}
                  onClick={() => setItems([...items, item])}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                  <img src={item.url} alt="" loading="lazy" />
                  <span>{added ? t('ae.gallery_in') : item.label}</span>
                </button>
              )
            })}
          </div>
        )
      ) : null}
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// Localized repeater
// ---------------------------------------------------------------------------

type Row = { id: string; text: Record<Locale, string>; hidden?: boolean; pkg?: string }

/** A package a line can be tied to (v2). */
export type ScopeOption = { value: string; label: string }

/** Arabic first: the owner writes in Arabic; the others are optional. */
const ORDER: readonly Locale[] = ['ar', 'en', 'id']

export function LocalizedRepeater({
  name,
  label,
  values,
  hint,
  toggles = false,
  scopes,
}: {
  name: string
  label: string
  values: readonly Record<Locale, string>[] | null | undefined
  hint?: string
  /** v2: a show / hide switch per line (hidden lines stay saved, off the site). */
  toggles?: boolean
  /** v2: each line applies to every package, or to the one picked here. */
  scopes?: readonly ScopeOption[]
}) {
  const { t } = useAdminT()
  const uid = useId()
  const [rows, setRows] = useState<Row[]>(() =>
    (values ?? []).map((value, index) => {
      const extra = value as { hidden?: unknown; pkg?: unknown }
      return {
        id: `r${index}`,
        text: { ar: value.ar ?? '', en: value.en ?? '', id: value.id ?? '' },
        hidden: extra.hidden === true,
        pkg: typeof extra.pkg === 'string' ? extra.pkg : '',
      }
    }),
  )
  const [added, setAdded] = useState(0)
  const { rowRef, handleProps, move, dragging } = useDragSort(rows, setRows)

  const update = (rowId: string, locale: Locale, value: string) =>
    setRows(
      rows.map((row) =>
        row.id === rowId ? { ...row, text: { ...row.text, [locale]: value } } : row,
      ),
    )

  const payload = JSON.stringify(
    rows.map((row) => ({
      ...row.text,
      ...(toggles && row.hidden ? { hidden: true } : {}),
      ...(scopes && row.pkg ? { pkg: row.pkg } : {}),
    })),
  )
  const setRow = (rowId: string, patch: Partial<Row>) =>
    setRows(rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))

  return (
    <fieldset className="a-fieldset">
      <legend>{label}</legend>
      <span className="a-hint">
        {hint ? `${hint} ` : ''}
        {t('ae.rep_hint')}
      </span>
      {rows.length === 0 ? <p className="a-hint">{t('ae.rep_empty')}</p> : null}
      <ol className="a-rep">
        {rows.map((row, index) => (
          <li
            key={row.id}
            ref={rowRef(row.id)}
            className={`a-rep-row${dragging === row.id ? ' is-dragging' : ''}${row.hidden ? ' is-hidden' : ''}`}
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
                <label key={locale} className="a-rep-field" htmlFor={`${uid}-${row.id}-${locale}`}>
                  <span>{localeConfig[locale].label}</span>
                  <input
                    className="a-input"
                    id={`${uid}-${row.id}-${locale}`}
                    lang={locale}
                    dir={localeConfig[locale].dir}
                    value={row.text[locale]}
                    onChange={(event) => update(row.id, locale, event.target.value)}
                  />
                </label>
              ))}
              {toggles || scopes ? (
                <span className="a-rep-opts">
                  {scopes && scopes.length > 0 ? (
                    <label className="a-rep-field" htmlFor={`${uid}-${row.id}-pkg`}>
                      <span>{t('av2.rep_scope')}</span>
                      <select
                        className="a-select"
                        id={`${uid}-${row.id}-pkg`}
                        value={row.pkg ?? ''}
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
                  {toggles ? (
                    <label className="a-check">
                      <input
                        type="checkbox"
                        checked={!row.hidden}
                        onChange={(event) => setRow(row.id, { hidden: !event.target.checked })}
                      />{' '}
                      {t('av2.rep_visible')}
                    </label>
                  ) : null}
                </span>
              ) : null}
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
          setRows([...rows, { id: `n${added}`, text: { ar: '', en: '', id: '' } }])
          setAdded(added + 1)
        }}
      >
        + {t('ae.rep_add')}
      </button>
      <input type="hidden" name={`${name}__json`} value={payload} />
    </fieldset>
  )
}
