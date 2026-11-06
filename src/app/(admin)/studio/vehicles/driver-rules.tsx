import { asc } from 'drizzle-orm'

import { db } from '@/db'
import { driverVehicles } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { addDays, dayState, driverWindow, weekday } from '@/lib/itineraries/driver-calendar'
import { readDriverSettings } from '@/lib/itineraries/sales-settings-store'

import { getAdminI18n } from '../../_lib/i18n'
import { param } from '../../_lib/result'
import { Checkbox, Field, LocalizedField, TextArea, TextInput } from '../../_ui/field'
import { Pill } from '../../_ui/table'
import { saveDriverSettings } from '../itineraries/phase1-actions'

const WEEKS = 6

/**
 * «السيارات والسائق» sections 2 (booking rules) and the window preview.
 * Was Studio → Itineraries → Driver (spec §4). Per-class notice and hours
 * are edited with the fleet (section 1), not here. Needs `capacity.write`.
 */
export async function DriverRulesSection({
  params,
}: {
  params: Record<string, string | string[] | undefined>
}) {
  const { t, intl, locale } = await getAdminI18n()
  const [settings, vehicles] = await Promise.all([
    readDriverSettings(),
    db.select().from(driverVehicles).orderBy(asc(driverVehicles.sortOrder)),
  ])

  const previewVehicle = vehicles.find((v) => v.id === param(params, 'vehicle')) ?? null
  const win = driverWindow(settings, new Date(), previewVehicle?.noticeDaysOverride ?? null)

  // Calendar preview: whole weeks (Sunday first) from this week on.
  const start = addDays(win.today, -weekday(win.today))
  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i))
  const dayName = (iso: string, style: 'long' | 'short') =>
    new Intl.DateTimeFormat(intl, { weekday: style, timeZone: 'UTC' }).format(
      new Date(`${iso}T12:00:00Z`),
    )
  const dateLabel = (iso: string) =>
    new Intl.DateTimeFormat(intl, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${iso}T12:00:00Z`))

  return (
    <>
      <h2 className="a-vd-h" id="rules">
        {t('vd.sec_rules')}
      </h2>
      <p className="a-hint">
        {t('ip1.driver_buyer_page')}:{' '}
        <Pill tone={settings.showOnBuyerPage ? 'good' : 'neutral'}>
          {settings.showOnBuyerPage ? t('ip1.on') : t('ip1.off')}
        </Pill>
      </p>
      <form className="a-form" action={saveDriverSettings}>
        <div className="a-card">
          <h2>{t('ip1.driver_rules_t')}</h2>
          <Checkbox
            name="showOnBuyerPage"
            label={t('ip1.show_on_buyer_page')}
            hint={t('ip1.show_on_buyer_page_hint')}
            defaultChecked={settings.showOnBuyerPage}
          />
          <div className="a-row">
            <Field
              label={t('ip1.notice_days')}
              htmlFor="noticeDays"
              hint={t('ip1.notice_days_hint')}
            >
              <TextInput
                id="noticeDays"
                name="noticeDays"
                inputMode="numeric"
                dir="ltr"
                defaultValue={String(settings.noticeDays)}
              />
            </Field>
            <Field
              label={t('ip1.cutoff_time')}
              htmlFor="cutoffTime"
              hint={t('ip1.cutoff_time_hint')}
            >
              <TextInput
                id="cutoffTime"
                name="cutoffTime"
                type="time"
                dir="ltr"
                defaultValue={settings.cutoffTime}
              />
            </Field>
            <Field label={t('ip1.max_advance_days')} htmlFor="maxAdvanceDays">
              <TextInput
                id="maxAdvanceDays"
                name="maxAdvanceDays"
                inputMode="numeric"
                dir="ltr"
                defaultValue={String(settings.maxAdvanceDays)}
              />
            </Field>
            <Field label={t('ip1.timezone')} htmlFor="timezone">
              <TextInput id="timezone" name="timezone" dir="ltr" defaultValue={settings.timezone} />
            </Field>
          </div>
          <div className="a-row">
            <Field label={t('ip1.min_days')} htmlFor="minDays">
              <TextInput
                id="minDays"
                name="minDays"
                inputMode="numeric"
                dir="ltr"
                defaultValue={String(settings.minDays)}
              />
            </Field>
            <Field label={t('ip1.max_days')} htmlFor="maxDays" hint={t('ip1.max_days_hint')}>
              <TextInput
                id="maxDays"
                name="maxDays"
                inputMode="numeric"
                dir="ltr"
                defaultValue={settings.maxDays === null ? '' : String(settings.maxDays)}
              />
            </Field>
            <Field label={t('ip1.max_pax')} htmlFor="maxPax">
              <TextInput
                id="maxPax"
                name="maxPax"
                inputMode="numeric"
                dir="ltr"
                defaultValue={String(settings.maxPax)}
              />
            </Field>
            <Checkbox
              name="includeInFullTripDiscount"
              label={t('ip1.include_in_discount')}
              defaultChecked={settings.includeInFullTripDiscount}
            />
          </div>
          <Field
            label={t('ip1.blocked_dates')}
            htmlFor="blockedDates"
            hint={t('ip1.blocked_dates_hint')}
          >
            <TextArea
              id="blockedDates"
              name="blockedDates"
              dir="ltr"
              rows={3}
              defaultValue={settings.blockedDates.join('\n')}
            />
          </Field>
          <LocalizedField
            name="cancellationPolicy"
            label={t('ip1.cancellation_policy')}
            value={settings.cancellationPolicy}
            rows={3}
          />
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('ip1.save_settings')}
          </button>
        </div>
      </form>

      <div className="a-card" style={{ marginBlockStart: 16 }}>
        <h2>{t('ip1.calendar_t')}</h2>
        <form method="get" className="a-row">
          <Field label={t('ip1.preview_vehicle')} htmlFor="vehicle">
            <select
              className="a-select"
              id="vehicle"
              name="vehicle"
              defaultValue={previewVehicle?.id ?? ''}
            >
              <option value="">{t('ip1.preview_default')}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {pick(v.label, locale, v.vehicleClass)}
                </option>
              ))}
            </select>
          </Field>
          <div className="a-actions">
            <button className="a-btn ghost" type="submit">
              {t('ip1.preview_show')}
            </button>
          </div>
        </form>
        <p>
          {t('ip1.live_example', {
            today: dateLabel(win.today),
            days: win.noticeDays,
            first: dateLabel(win.minStart),
          })}
          {win.afterCutoff ? ` ${t('ip1.after_cutoff', { time: settings.cutoffTime })}` : ''}
        </p>
        <div className="ip1-cal" role="grid" aria-label={t('ip1.calendar_t')}>
          {cells.slice(0, 7).map((iso) => (
            <div key={`h${iso}`} className="ip1-cal-head" role="columnheader">
              {dayName(iso, 'short')}
            </div>
          ))}
          {cells.map((iso) => {
            const state = dayState(iso, win, settings.blockedDates)
            return (
              <div
                key={iso}
                role="gridcell"
                className={`ip1-cal-day is-${state}${iso === win.today ? ' is-today' : ''}`}
                title={t(`ip1.state_${state}`)}
              >
                {Number(iso.slice(8, 10))}
              </div>
            )
          })}
        </div>
        <ul className="ip1-cal-legend a-hint">
          {(['open', 'too_soon', 'blocked', 'past'] as const).map((state) => (
            <li key={state}>
              <span className={`ip1-cal-day is-${state}`} aria-hidden="true" />{' '}
              {t(`ip1.state_${state}`)}
            </li>
          ))}
          <li>
            <span className="ip1-cal-day is-open is-today" aria-hidden="true" />{' '}
            {t('ip1.state_today')}
          </li>
        </ul>
        <style>{CALENDAR_CSS}</style>
      </div>
    </>
  )
}

/** Scoped to this screen; uses the Studio tokens. */
const CALENDAR_CSS = `
.ip1-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; max-inline-size: 520px; }
.ip1-cal-head { font-size: 12px; color: var(--a-muted); text-align: center; padding-block: 4px; }
.ip1-cal-day { display: inline-flex; align-items: center; justify-content: center; min-block-size: 38px; min-inline-size: 18px; border-radius: 8px; font-variant-numeric: tabular-nums; border: 1px solid var(--a-line); background: var(--a-surface); }
.ip1-cal-day.is-open { background: color-mix(in srgb, var(--a-good, #1a7f4b) 14%, var(--a-surface)); }
.ip1-cal-day.is-too_soon, .ip1-cal-day.is-past { color: var(--a-muted); text-decoration: line-through; }
.ip1-cal-day.is-blocked { color: var(--a-muted); background: var(--a-line); }
.ip1-cal-day.is-too_far { color: var(--a-muted); opacity: .5; }
.ip1-cal-day.is-today { outline: 2px solid #f08a24; outline-offset: -2px; }
.ip1-cal-legend { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 12px; margin-block-start: 12px; }
.ip1-cal-legend .ip1-cal-day { min-block-size: 16px; min-inline-size: 16px; vertical-align: middle; }
`
