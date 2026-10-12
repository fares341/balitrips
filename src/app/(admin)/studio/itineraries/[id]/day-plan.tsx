import type { Localized } from '@/db/schema'
import { localeConfig, locales } from '@/i18n/config'

import type { Option } from '../../../_lib/lookups'
import { TextArea, TextInput } from '../../../_ui/field'
import { Pill } from '../../../_ui/table'
import { addItineraryDay, moveItineraryDay, removeItineraryDay, saveItineraryDay } from '../actions'

export interface DayRow {
  id: string
  dayNumber: number
  activityId: string | null
  isFreeDay: boolean
  title: Localized | null
  description: Localized | null
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
export function DayPlan({
  itineraryId,
  days,
  activities,
}: {
  itineraryId: string
  days: readonly DayRow[]
  activities: readonly Option[]
}) {
  return (
    <div className="a-card">
      <h2>Day plan</h2>
      <p className="a-hint">
        {days.length === 0
          ? 'No days yet. An itinerary cannot be published until every day is either an activity or an explicit free day.'
          : `${days.length} day${days.length === 1 ? '' : 's'}. Reordering renumbers the whole plan automatically.`}
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
          <form
            className="a-day"
            key={day.id}
            action={saveItineraryDay.bind(null, itineraryId, day.id)}
          >
            <div className="a-day-head">
              <div className="a-day-no">
                Day {day.dayNumber} {day.isFreeDay ? <Pill tone="info">free day</Pill> : null}
                {!day.isFreeDay && !day.activityId ? <Pill tone="bad">unresolved</Pill> : null}
              </div>
              <div className="a-actions">
                <button className="a-btn ghost small" type="submit">
                  Save day
                </button>
                <button
                  className="a-btn ghost small"
                  type="submit"
                  formAction={moveItineraryDay.bind(null, itineraryId, day.id, 'up')}
                  disabled={index === 0}
                >
                  Move up
                </button>
                <button
                  className="a-btn ghost small"
                  type="submit"
                  formAction={moveItineraryDay.bind(null, itineraryId, day.id, 'down')}
                  disabled={index === days.length - 1}
                >
                  Move down
                </button>
                <button
                  className="a-btn danger small"
                  type="submit"
                  formAction={removeItineraryDay.bind(null, itineraryId, day.id)}
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="a-row">
              <div className="a-field">
                <label htmlFor={`activityId_${day.id}`}>Activity</label>
                <select
                  className="a-select"
                  id={`activityId_${day.id}`}
                  name={`activityId_${day.id}`}
                  defaultValue={day.activityId ?? ''}
                >
                  <option value="">— none —</option>
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
                  Free day
                </label>
                <span className="a-hint">
                  An editorial choice, not a gap. Tick this instead of leaving the day empty.
                </span>
              </div>
            </div>

            <fieldset className="a-fieldset">
              <legend>Day title</legend>
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
              <legend>Day description</legend>
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
        ))}
      </div>

      <form
        className="a-row"
        action={addItineraryDay.bind(null, itineraryId)}
        style={{ marginBlockStart: 'var(--space-5)' }}
      >
        <div className="a-field">
          <label htmlFor="newDayActivity">Add day — activity</label>
          <select className="a-select" id="newDayActivity" name="activityId" defaultValue="">
            <option value="">— none —</option>
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
            Free day
          </label>
        </div>
        <div className="a-actions">
          <button className="a-btn accent" type="submit">
            Add day {days.length + 1}
          </button>
        </div>
      </form>
    </div>
  )
}
