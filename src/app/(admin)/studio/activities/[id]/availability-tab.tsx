import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { activities, activityAvailability, activitySupplierOffers, suppliers } from '@/db/schema'
import { todayInBali } from '@/lib/booking-rules'
import {
  checkAvailability,
  effectiveCapacity,
  isDayClosed,
  weekdayList,
  type AvailabilityRules,
} from '@/lib/availability/rules'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { Field, Select, TextInput } from '../../../_ui/field'
import { Empty, Pill } from '../../../_ui/table'
import {
  saveAvailabilitySettings,
  setAvailabilityRange,
  toggleAvailabilityDay,
} from '../availability-actions'

type ActivityRow = typeof activities.$inferSelect

/** Sunday-first weekday names in the Studio language (2024-01-07 was a Sunday). */
function weekdayNames(intl: string, style: 'short' | 'long'): string[] {
  const format = new Intl.DateTimeFormat(intl, { weekday: style, timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(Date.UTC(2024, 0, 7 + index))),
  )
}

function shiftMonth(year: number, monthIndex: number, delta: number): string {
  const shifted = new Date(Date.UTC(year, monthIndex + delta, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * التوفر والأماكن — places per departure, closed weekdays, closed dates and a
 * month calendar of what is booked. Nothing set = unlimited, always open.
 */
export async function AvailabilityTab({
  activity,
  monthParam,
}: {
  activity: ActivityRow
  monthParam: string | null
}) {
  const { t, intl } = await getAdminI18n()
  const today = todayInBali()
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : today.slice(0, 7)
  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)
  const monthIndex = Number(monthText) - 1
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const first = `${month}-01`
  const last = `${month}-${String(daysInMonth).padStart(2, '0')}`
  const slots = (activity.timeSlots ?? []).filter((slot) => /^\d{2}:\d{2}$/.test(slot))
  const closedWeekdays = weekdayList(activity.closedWeekdays)

  const [rows, offers] = await Promise.all([
    db
      .select()
      .from(activityAvailability)
      .where(
        and(
          eq(activityAvailability.activityId, activity.id),
          gte(activityAvailability.day, first),
          lte(activityAvailability.day, last),
        ),
      ),
    db
      .select({
        offer: activitySupplierOffers,
        supplierName: suppliers.name,
        status: suppliers.status,
      })
      .from(activitySupplierOffers)
      .innerJoin(suppliers, eq(suppliers.id, activitySupplierOffers.supplierId))
      .where(and(eq(activitySupplierOffers.activityId, activity.id), isNull(suppliers.deletedAt)))
      .orderBy(asc(suppliers.name)),
  ])

  const rules: AvailabilityRules = {
    capacityPerSlot: activity.capacityPerSlot,
    closedWeekdays,
    hasSlots: slots.length > 0,
    rows: rows.map((row) => ({
      day: row.day,
      slot: row.slot,
      capacity: row.capacity,
      booked: row.booked,
      isClosed: row.isClosed,
    })),
  }
  const shortDays = weekdayNames(intl, 'short')
  const longDays = weekdayNames(intl, 'long')
  const leadingBlanks = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
  const base = adminHref(`/activities/${activity.id}?tab=availability`)

  return (
    <>
      <form className="a-form" action={saveAvailabilitySettings.bind(null, activity.id)}>
        <input type="hidden" name="month" value={month} />
        <div className="a-card">
          <h2>{t('av.settings_title')}</h2>
          <p className="a-hint">{t('av.settings_hint')}</p>
          <div className="a-row">
            <Field
              label={slots.length > 0 ? t('av.capacity_per_departure') : t('av.capacity_per_day')}
              htmlFor="capacityPerSlot"
              hint={t('av.capacity_hint')}
            >
              <TextInput
                id="capacityPerSlot"
                name="capacityPerSlot"
                type="number"
                min={0}
                dir="ltr"
                defaultValue={activity.capacityPerSlot ?? ''}
                placeholder={t('av.unlimited')}
              />
            </Field>
          </div>
          <fieldset className="a-field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>{t('av.closed_weekdays')}</legend>
            <div className="a-row" style={{ gap: 12 }}>
              {longDays.map((name, index) => (
                <label key={name} className="a-check">
                  <input
                    type="checkbox"
                    name="closedWeekdays"
                    value={String(index)}
                    defaultChecked={closedWeekdays.includes(index)}
                  />
                  {name}
                </label>
              ))}
            </div>
            <span className="a-hint">{t('av.closed_weekdays_hint')}</span>
          </fieldset>
          <div className="a-actions">
            <button className="a-btn" type="submit">
              {t('av.save_settings')}
            </button>
          </div>
        </div>
      </form>

      <form className="a-form" action={setAvailabilityRange.bind(null, activity.id)}>
        <input type="hidden" name="month" value={month} />
        <div className="a-card">
          <h2>{t('av.range_title')}</h2>
          <p className="a-hint">{t('av.range_hint')}</p>
          <div className="a-row">
            <Field label={t('av.from')} htmlFor="av-from">
              <TextInput id="av-from" name="from" type="date" dir="ltr" required min={today} />
            </Field>
            <Field label={t('av.to')} htmlFor="av-to" hint={t('av.to_hint')}>
              <TextInput id="av-to" name="to" type="date" dir="ltr" min={today} />
            </Field>
            {slots.length > 0 ? (
              <Field label={t('av.departure')} htmlFor="av-slot">
                <Select id="av-slot" name="slot" defaultValue="">
                  <option value="">{t('av.all_departures')}</option>
                  {slots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
          <div className="a-row">
            <Field label={t('av.what')} htmlFor="av-mode">
              <Select id="av-mode" name="mode" defaultValue="close">
                <option value="close">{t('av.mode_close')}</option>
                <option value="open">{t('av.mode_open')}</option>
                <option value="capacity">{t('av.mode_capacity')}</option>
              </Select>
            </Field>
            <Field
              label={t('av.capacity')}
              htmlFor="av-capacity"
              hint={t('av.range_capacity_hint')}
            >
              <TextInput id="av-capacity" name="capacity" type="number" min={0} dir="ltr" />
            </Field>
            <Field label={t('av.note')} htmlFor="av-note" hint={t('av.note_hint')}>
              <TextInput id="av-note" name="note" maxLength={500} />
            </Field>
          </div>
          <div className="a-actions">
            <button className="a-btn" type="submit">
              {t('av.apply')}
            </button>
          </div>
        </div>
      </form>

      <div className="a-card">
        <h2>{t('av.calendar_title')}</h2>
        <div className="a-actions" style={{ marginBlockEnd: 12 }}>
          <Link
            className="a-btn ghost small"
            href={`${base}&month=${shiftMonth(year, monthIndex, -1)}`}
          >
            {t('common.previous')}
          </Link>
          <b className="a-mono" style={{ alignSelf: 'center' }}>
            {month}
          </b>
          <Link
            className="a-btn ghost small"
            href={`${base}&month=${shiftMonth(year, monthIndex, 1)}`}
          >
            {t('common.next')}
          </Link>
        </div>
        <p className="a-hint" style={{ marginBlockEnd: 8 }}>
          {activity.capacityPerSlot === null ? t('av.calendar_unlimited') : t('av.calendar_hint')}
        </p>
        <div className="a-cal">
          {shortDays.map((name) => (
            <div className="a-cal-head" key={name}>
              {name}
            </div>
          ))}
          {Array.from({ length: leadingBlanks }, (_, index) => (
            <div className="a-cal-cell pad" key={`pad-${index}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const day = `${month}-${String(index + 1).padStart(2, '0')}`
            const closed = isDayClosed(rules, day)
            const weekdayClosed = closedWeekdays.includes(new Date(`${day}T00:00:00Z`).getUTCDay())
            const dayRows = rules.rows.filter((row) => row.day === day)
            const booked = dayRows.reduce((sum, row) => sum + row.booked, 0)
            const departures = slots.length > 0 ? slots : [null]
            const full =
              !closed &&
              departures.every((slot) => {
                const verdict = checkAvailability(rules, day, slot, 1)
                return !verdict.ok && verdict.reason === 'full'
              })
            const capacity = effectiveCapacity(rules, day, slots[0] ?? null)
            const note = dayRows.find((row) => row.slot === '')?.note ?? null
            const closedSlots = dayRows.filter((row) => row.slot !== '' && row.isClosed)
            const past = day < today
            return (
              <div
                className={`a-cal-cell ${closed ? 'blocked' : full ? 'full' : ''}`.trim()}
                key={day}
                style={past ? { opacity: 0.55 } : undefined}
              >
                <span className="a-cal-day">{index + 1}</span>
                {closed ? (
                  <Pill tone="bad">{weekdayClosed ? t('av.closed_weekday') : t('av.closed')}</Pill>
                ) : null}
                <span className="a-muted">
                  {capacity === null
                    ? t('av.booked_unlimited', { booked })
                    : t('av.booked_of', { booked, capacity })}
                </span>
                {closedSlots.length > 0 ? (
                  <span className="a-muted" dir="ltr">
                    {t('av.slots_closed', { slots: closedSlots.map((row) => row.slot).join(' ') })}
                  </span>
                ) : null}
                {note ? <span className="a-muted">{note}</span> : null}
                {!past && !weekdayClosed ? (
                  <form
                    className="a-inline-form"
                    action={toggleAvailabilityDay.bind(null, activity.id, day, !closed, month)}
                  >
                    <button className="a-btn ghost small" type="submit">
                      {closed ? t('av.reopen') : t('av.close_day')}
                    </button>
                  </form>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <div className="a-card">
        <h2>{t('av.suppliers_title')}</h2>
        <p className="a-hint">{t('av.suppliers_hint')}</p>
        {offers.length === 0 ? (
          <Empty>{t('av.suppliers_empty')}</Empty>
        ) : (
          <ul>
            {offers.map(({ offer, supplierName, status }) => (
              <li key={offer.id}>
                <Link href={adminHref(`/suppliers/${offer.supplierId}`)}>{supplierName}</Link>
                {' · '}
                {offer.confirmationMode === 'instant'
                  ? t('sup.mode_instant')
                  : t('sup.mode_needs_hours', { hours: offer.confirmWithinHours })}
                {!offer.active || status !== 'active' ? ` · ${t('sup.offer_off')}` : ''}
              </li>
            ))}
          </ul>
        )}
        <div className="a-actions" style={{ marginBlockStart: 8 }}>
          <Link className="a-btn ghost small" href={adminHref('/suppliers')}>
            {t('nav.suppliers')}
          </Link>
        </div>
      </div>
    </>
  )
}
