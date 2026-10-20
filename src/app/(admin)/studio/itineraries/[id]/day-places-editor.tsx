'use client'

/**
 * Places on one day of the plan (phase 3): search the map places, add them,
 * put them in visiting order (drag by the handle, or ↑/↓ on the focused
 * handle, or the arrow buttons), write a short tip and a suggested time, save.
 *
 * One save per day: the whole ordered list is sent and replaces the day's
 * places, so a half-finished drag can never leave two stops on the same
 * position.
 */

import { useId, useMemo, useState, useTransition } from 'react'

import { localeConfig, type Locale } from '@/i18n/config'

import { useAdminT } from '../../../_ui/i18n-provider'
import { Arrow, Grip, useDragSort } from '../../../_ui/sortable'
import { saveDayPlaces } from '../actions'

export interface PlaceChoice {
  value: string
  label: string
  /** `free` | `map_access` | `vip` — shown so the editor knows what customers will see. */
  access: string
}

export interface DayStopDraft {
  id: string
  placeId: string
  note: Record<Locale, string>
  visitTime: string
}

const ORDER: readonly Locale[] = ['ar', 'en', 'id']
const MAX_RESULTS = 8

export function DayPlacesEditor({
  itineraryId,
  dayId,
  dayNumber,
  initial,
  choices,
}: {
  itineraryId: string
  dayId: string
  dayNumber: number
  initial: DayStopDraft[]
  choices: PlaceChoice[]
}) {
  const { t } = useAdminT()
  const uid = useId()
  const [stops, setStops] = useState(initial)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed' | 'dirty'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [added, setAdded] = useState(0)

  const change = (next: DayStopDraft[]) => {
    setStops(next)
    setStatus('dirty')
  }
  const { rowRef, handleProps, move, dragging } = useDragSort(stops, change)

  const byId = useMemo(() => new Map(choices.map((choice) => [choice.value, choice])), [choices])
  const chosen = new Set(stops.map((stop) => stop.placeId))
  const needle = query.trim().toLowerCase()
  const results =
    needle.length === 0
      ? []
      : choices
          .filter((choice) => !chosen.has(choice.value))
          .filter((choice) => choice.label.toLowerCase().includes(needle))
          .slice(0, MAX_RESULTS)

  const accessLabel = (access: string) =>
    access === 'free'
      ? t('p3.access_free')
      : access === 'vip'
        ? t('p3.access_vip')
        : t('p3.access_map')

  const save = () => {
    setStatus('saving')
    setError(null)
    startTransition(async () => {
      const result = await saveDayPlaces(
        itineraryId,
        dayId,
        stops.map((stop) => ({
          placeId: stop.placeId,
          note: stop.note,
          visitTime: stop.visitTime,
        })),
      ).catch(() => ({ ok: false as const, error: t('p3.save_failed') }))
      if (result.ok) setStatus('saved')
      else {
        setStatus('failed')
        setError(result.error)
      }
    })
  }

  return (
    <section className="a-fieldset a-dayplaces" aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className="a-dayplaces-h">
        {t('p3.day_places_title', { number: dayNumber })}
      </h3>
      <p className="a-hint">{t('p3.day_places_hint')}</p>

      {stops.length === 0 ? (
        <p className="a-hint">{t('p3.day_places_empty')}</p>
      ) : (
        <ol className="a-sort-list">
          {stops.map((stop, index) => {
            const choice = byId.get(stop.placeId)
            const label = choice?.label ?? t('p3.place_gone')
            return (
              <li
                key={stop.id}
                ref={rowRef(stop.id)}
                className={dragging === stop.id ? 'a-sort-row is-dragging' : 'a-sort-row'}
              >
                <button
                  type="button"
                  className="a-sort-handle"
                  aria-label={t('ae.order_handle', { name: label })}
                  title={t('ae.rep_drag')}
                  {...handleProps(stop.id)}
                >
                  <Grip />
                </button>
                <div className="a-sort-content a-dayplace">
                  <div className="a-sort-line">
                    <span className="a-dayplace-no" aria-hidden="true">
                      {index + 1}
                    </span>
                    <b>{label}</b>
                    {choice ? (
                      <span className={`a-pill ${choice.access === 'free' ? 'good' : 'warn'}`}>
                        {accessLabel(choice.access)}
                      </span>
                    ) : null}
                    <label className="a-dayplace-time">
                      <span>{t('p3.visit_time')}</span>
                      <input
                        className="a-input"
                        type="time"
                        value={stop.visitTime}
                        onChange={(event) =>
                          change(
                            stops.map((other) =>
                              other.id === stop.id
                                ? { ...other, visitTime: event.target.value }
                                : other,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  <details className="a-dayplace-note">
                    <summary>
                      {stop.note.ar || stop.note.en || stop.note.id
                        ? t('p3.note_edit')
                        : t('p3.note_add')}
                    </summary>
                    <div className="a-rep-fields">
                      {ORDER.map((locale) => (
                        <label
                          key={locale}
                          className="a-rep-field"
                          htmlFor={`${uid}-${stop.id}-${locale}`}
                        >
                          <span>{localeConfig[locale].label}</span>
                          <input
                            className="a-input"
                            id={`${uid}-${stop.id}-${locale}`}
                            lang={locale}
                            dir={localeConfig[locale].dir}
                            maxLength={280}
                            value={stop.note[locale]}
                            onChange={(event) =>
                              change(
                                stops.map((other) =>
                                  other.id === stop.id
                                    ? {
                                        ...other,
                                        note: { ...other.note, [locale]: event.target.value },
                                      }
                                    : other,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </details>
                </div>
                <span className="a-sort-arrows">
                  <button
                    type="button"
                    className="a-icon-btn"
                    aria-label={`${t('ae.order_up')}: ${label}`}
                    disabled={index === 0}
                    onClick={() => move(stop.id, -1)}
                  >
                    <Arrow up />
                  </button>
                  <button
                    type="button"
                    className="a-icon-btn"
                    aria-label={`${t('ae.order_down')}: ${label}`}
                    disabled={index === stops.length - 1}
                    onClick={() => move(stop.id, 1)}
                  >
                    <Arrow up={false} />
                  </button>
                  <button
                    type="button"
                    className="a-icon-btn danger"
                    aria-label={`${t('common.remove')}: ${label}`}
                    onClick={() => change(stops.filter((other) => other.id !== stop.id))}
                  >
                    ×
                  </button>
                </span>
              </li>
            )
          })}
        </ol>
      )}

      <div className="a-field a-dayplaces-search">
        <label htmlFor={`${uid}-q`}>{t('p3.search_places')}</label>
        <input
          className="a-input"
          id={`${uid}-q`}
          type="search"
          value={query}
          autoComplete="off"
          placeholder={t('p3.search_places_ph')}
          onChange={(event) => setQuery(event.target.value)}
        />
        {needle.length > 0 ? (
          results.length === 0 ? (
            <p className="a-hint">{t('p3.search_none')}</p>
          ) : (
            <ul className="a-dayplaces-results">
              {results.map((choice) => (
                <li key={choice.value}>
                  <button
                    type="button"
                    className="a-btn ghost small"
                    onClick={() => {
                      change([
                        ...stops,
                        {
                          id: `new-${added}`,
                          placeId: choice.value,
                          note: { ar: '', en: '', id: '' },
                          visitTime: '',
                        },
                      ])
                      setAdded(added + 1)
                      setQuery('')
                    }}
                  >
                    + {choice.label} <span className="a-muted">({accessLabel(choice.access)})</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      <div className="a-actions">
        <button
          type="button"
          className="a-btn accent small"
          onClick={save}
          disabled={pending || status === 'saving'}
        >
          {t('p3.day_places_save')}
        </button>
        <span className="a-hint a-sort-status" role="status" aria-live="polite">
          {status === 'saving'
            ? t('ae.order_saving')
            : status === 'saved'
              ? t('p3.saved')
              : status === 'dirty'
                ? t('p3.unsaved')
                : status === 'failed'
                  ? (error ?? t('p3.save_failed'))
                  : ''}
        </span>
      </div>
    </section>
  )
}
