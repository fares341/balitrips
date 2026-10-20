import type { Localized } from '@/db/schema'
import { localeConfig, locales } from '@/i18n/config'

import { getAdminI18n } from '../../../_lib/i18n'
import type { Option } from '../../../_lib/lookups'
import { TextArea, TextInput } from '../../../_ui/field'
import { Pill } from '../../../_ui/table'
import { addItineraryDay, moveItineraryDay, removeItineraryDay, saveItineraryDay } from '../actions'
import { DayPlacesEditor, type DayStopDraft, type PlaceChoice } from './day-places-editor'

export interface DayRow {
  id: string
  dayNumber: number
  activityId: string | null
  isFreeDay: boolean
  title: Localized | null
  description: Localized | null
  /** Sale mode B: the day's activity can be booked from the itinerary page. */
  bookable: boolean
}

/**
 * The day-plan builder.
 *
 * This is the table the prototype never had. It assigned `acts[i]` to day `i`
 * at render time, so an 8-day itinerary with 5 linked activities silently
 * produced three hard-coded, untranslated, uneditable "Free day to explore &
 * relax" cards. Here a free day is an explicit tick with its own localized
 * copy, and the plan's length is the number of rows that exist.
 *
 * Each day is its own form — HTML forbids nesting them — and every button in
 * that form saves the day's fields first, so reordering never discards an
 * edit the operator has already typed.
 */
export async function DayPlan({
  itineraryId,
  days,
  activities,
  stopsByDay,
  placeChoices,
}: {
  itineraryId: string
  days: readonly DayRow[]
  activities: readonly Option[]
  /** Phase 3: each day's places, in order. */
  stopsByDay: ReadonlyMap<string, DayStopDraft[]>
  placeChoices: PlaceChoice[]
}) {
  const { t } = await getAdminI18n()
  return (
    <div className="a-card">
      <h2>{t('itineraries.day_plan')}</h2>
      <p className="a-hint">
        {days.length === 0
          ? t('itineraries.day_plan_empty')
          : t('itineraries.day_plan_count', { count: days.length })}
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          marginBlockStart: 'var(--space-4)',
        }}
      >
        {days.map((day, index) => (
          <div className="a-day-wrap" key={day.id}>
            <form className="a-day" action={saveItineraryDay.bind(null, itineraryId, day.id)}>
              <div className="a-day-head">
                <div className="a-day-no">
                  {t('itineraries.day_number', { number: day.dayNumber })}{' '}
                  {day.isFreeDay ? <Pill tone="info">{t('itineraries.free_day_pill')}</Pill> : null}
                  {!day.isFreeDay && !day.activityId ? (
                    <Pill tone="bad">{t('itineraries.unresolved')}</Pill>
                  ) : null}
                </div>
                <div className="a-actions">
                  <button className="a-btn ghost small" type="submit">
                    {t('itineraries.day_save')}
                  </button>
                  <button
                    className="a-btn ghost small"
                    type="submit"
                    formAction={moveItineraryDay.bind(null, itineraryId, day.id, 'up')}
                    disabled={index === 0}
                  >
                    {t('itineraries.day_move_up')}
                  </button>
                  <button
                    className="a-btn ghost small"
                    type="submit"
                    formAction={moveItineraryDay.bind(null, itineraryId, day.id, 'down')}
                    disabled={index === days.length - 1}
                  >
                    {t('itineraries.day_move_down')}
                  </button>
                  <button
                    className="a-btn danger small"
                    type="submit"
                    formAction={removeItineraryDay.bind(null, itineraryId, day.id)}
                  >
                    {t('common.remove')}
                  </button>
                </div>
              </div>

              <div className="a-row">
                <div className="a-field">
                  <label htmlFor={`activityId_${day.id}`}>{t('itineraries.day_activity')}</label>
                  <select
                    className="a-select"
                    id={`activityId_${day.id}`}
                    name={`activityId_${day.id}`}
                    defaultValue={day.activityId ?? ''}
                  >
                    <option value="">— {t('common.none')} —</option>
                    {activities.map((activity) => (
                      <option key={activity.value} value={activity.value}>
                        {activity.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="a-field">
                  <label className="a-check">
                    <input
                      type="checkbox"
                      name={`isFreeDay_${day.id}`}
                      defaultChecked={day.isFreeDay}
                    />
                    {t('itineraries.free_day')}
                  </label>
                  <span className="a-hint">{t('itineraries.free_day_hint')}</span>
                </div>
                <div className="a-field">
                  <label className="a-check">
                    <input
                      type="checkbox"
                      name={`bookable_${day.id}`}
                      defaultChecked={day.bookable}
                      disabled={day.isFreeDay}
                    />
                    {t('p3.day_bookable')}
                  </label>
                  <span className="a-hint">{t('p3.day_bookable_hint')}</span>
                </div>
              </div>

              <fieldset className="a-fieldset">
                <legend>{t('itineraries.day_title')}</legend>
                <div className="a-l10n">
                  {locales.map((locale) => (
                    <div className="a-field" key={locale}>
                      <label htmlFor={`title_${day.id}_${locale}`}>
                        {localeConfig[locale].label}
                      </label>
                      <TextInput
                        id={`title_${day.id}_${locale}`}
                        name={`title_${day.id}_${locale}`}
                        defaultValue={day.title?.[locale] ?? ''}
                        lang={locale}
                        dir={localeConfig[locale].dir}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>

              <fieldset className="a-fieldset">
                <legend>{t('itineraries.day_description')}</legend>
                <div className="a-l10n">
                  {locales.map((locale) => (
                    <div className="a-field" key={locale}>
                      <label htmlFor={`description_${day.id}_${locale}`}>
                        {localeConfig[locale].label}
                      </label>
                      <TextArea
                        id={`description_${day.id}_${locale}`}
                        name={`description_${day.id}_${locale}`}
                        rows={3}
                        defaultValue={day.description?.[locale] ?? ''}
                        lang={locale}
                        dir={localeConfig[locale].dir}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
            </form>
            <DayPlacesEditor
              itineraryId={itineraryId}
              dayId={day.id}
              dayNumber={day.dayNumber}
              initial={stopsByDay.get(day.id) ?? []}
              choices={placeChoices}
            />
          </div>
        ))}
      </div>

      <form
        className="a-row"
        action={addItineraryDay.bind(null, itineraryId)}
        style={{ marginBlockStart: 'var(--space-5)' }}
      >
        <div className="a-field">
          <label htmlFor="newDayActivity">{t('itineraries.add_day_activity')}</label>
          <select className="a-select" id="newDayActivity" name="activityId" defaultValue="">
            <option value="">— {t('common.none')} —</option>
            {activities.map((activity) => (
              <option key={activity.value} value={activity.value}>
                {activity.label}
              </option>
            ))}
          </select>
        </div>
        <div className="a-field">
          <label className="a-check">
            <input type="checkbox" name="isFreeDay" />
            {t('itineraries.free_day')}
          </label>
        </div>
        <div className="a-actions">
          <button className="a-btn accent" type="submit">
            {t('itineraries.add_day', { number: days.length + 1 })}
          </button>
        </div>
      </form>
    </div>
  )
}
