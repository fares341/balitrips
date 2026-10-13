'use client'

/**
 * Driver booking column.
 *
 * Ported from the `<aside className="bt-booking">` half of `DriverPage` in
 * design/handoff/sections-bt/page-driver.jsx: start date, end date, a passenger
 * stepper, the auto-assigned vehicle strip, a live summary and the two CTAs.
 *
 * Three corrections, all of which changed what the customer is quoted:
 *
 *  1. **The rate table is gone.** `veh === "van" ? 95 : veh === "suv" ? 70 : 45`
 *     lived in this component, in the activity booking engine and in the
 *     homepage form. Rates come from `driver_vehicles` as minor units plus a
 *     currency code; nothing here knows what a sedan costs.
 *  2. **The 1-4 / 5-7 / 8+ rule is gone too.** `vehicleForPassengers` is the
 *     same function the quote engine calls, so the class shown beside the price
 *     and the class priced at checkout cannot drift.
 *  3. **Bad ranges are rejected, not clamped.** The handoff's `daysBetween`
 *     returned 1 for a missing date, 1 for a reversed range and 1 for a range
 *     entirely in the past — so "12 Aug → 3 Aug" quoted a one-day hire and the
 *     traveller had no idea anything was wrong. Each of those is a field error
 *     here, and the estimate stays blank until the range is real.
 *
 * The estimate is a *display* number. `@/lib/pricing/quote` recomputes every
 * line from catalogue data at checkout; nothing typed into this column is
 * trusted there.
 */

import { useEffect, useId, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'

import { CART_CHANGED_EVENT, CART_HREF } from '@/components/layout/routes'
import { Button, Stepper, useToast } from '@/components/shared'
import { Icon, type IconName } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { useRouter } from '@/i18n/routing'
import {
  daysBetweenInclusive,
  isPastInBali,
  isValidDateRange,
  todayInBali,
  vehicleForPassengers,
  type VehicleClass,
} from '@/lib/booking-rules'
import { pick, pickOptional } from '@/lib/content/localize'
import type { DriverVehicleDto } from '@/lib/content/types'
import { formatMoney } from '@/lib/money'

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Placeholder for a value the traveller has not supplied yet. */
const EMPTY = '—'

/** Message key per vehicle class — the fallback when the row has no label. */
const VEHICLE_LABEL: Record<VehicleClass, string> = {
  sedan: 'dp_veh_sedan',
  suv: 'dp_veh_suv',
  van: 'dp_veh_van',
}

const VEHICLE_BLURB: Record<VehicleClass, string> = {
  sedan: 'dp_veh_sedan_b',
  suv: 'dp_veh_suv_b',
  van: 'dp_veh_van_b',
}

const VEHICLE_ICON: Record<VehicleClass, IconName> = {
  sedan: 'car',
  suv: 'suv',
  van: 'van',
}

/** Used only when the fleet table is empty, so the stepper still has a bound. */
const FALLBACK_MAX_PASSENGERS = 20

export type DriverBookingProps = {
  /** The whole fleet. The column picks the class its passenger count implies. */
  vehicles: DriverVehicleDto[]
}

type FieldErrors = {
  start?: string
  end?: string
}

export function DriverBooking({ vehicles }: DriverBookingProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const format = useFormatter()
  const router = useRouter()
  const { toast } = useToast()
  const params = useSearchParams()

  const baseId = useId()
  const headingId = `${baseId}-heading`
  const startId = `${baseId}-start`
  const endId = `${baseId}-end`
  const startErrorId = `${baseId}-start-error`
  const endErrorId = `${baseId}-end-error`

  /**
   * Prefill from the homepage quick-book card.
   *
   * It pushes `?start=&end=&pax=`; the handoff threw the same three answers
   * away and dropped the visitor on an empty form. Values are re-validated
   * below exactly as typed ones are — a query string is user input.
   */
  const [start, setStart] = useState(() => readDate(params.get('start')))
  const [end, setEnd] = useState(() => readDate(params.get('end')))
  const [passengers, setPassengers] = useState(() => readPassengers(params.get('pax')))
  const [errors, setErrors] = useState<FieldErrors>({})

  /**
   * Earliest selectable day, in Bali, resolved after mount.
   *
   * This page is prerendered, so a build-time "today" would be baked into the
   * HTML and go stale the first time the deploy is a day old. Empty on the
   * server and on the first client render keeps hydration identical;
   * `validate()` enforces the constraint regardless, so the picker gaining
   * `min` a tick late cannot let a past date through.
   */
  const [earliest, setEarliest] = useState('')
  useEffect(() => {
    // "today" is not derivable at build time; resolving it after mount is the
    // point, and validate() is what actually protects the booking.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEarliest(todayInBali())
  }, [])

  // ---------------------------------------------------------------------
  // Derived vehicle and pricing
  // ---------------------------------------------------------------------

  const vehicleClass = vehicleForPassengers(passengers)
  const vehicle = vehicles.find((one) => one.vehicleClass === vehicleClass) ?? null

  const maxPassengers = vehicles.reduce(
    (highest, one) => Math.max(highest, one.maxPassengers),
    vehicles.length === 0 ? FALLBACK_MAX_PASSENGERS : 1,
  )

  /**
   * Trip length, or null when the range is not yet a range.
   *
   * Null rather than 1: the summary renders a dash, and the CTAs refuse. The
   * handoff returned 1 here and quoted a full day's hire off it.
   */
  const days =
    PLAIN_DATE.test(start) && PLAIN_DATE.test(end) && isValidDateRange(start, end)
      ? daysBetweenInclusive(start, end)
      : null

  const rateMinor = vehicle?.dayRateMinor ?? null
  const currency = vehicle?.currency ?? null
  const totalMinor = rateMinor !== null && days !== null ? rateMinor * days : null

  const money = (minor: number) =>
    currency === null ? EMPTY : formatMoney(minor, currency, locale)

  const vehicleName =
    vehicle === null
      ? t('dp_veh_none')
      : pick(vehicle.label, locale, t(VEHICLE_LABEL[vehicleClass]))

  const vehicleBlurb =
    vehicle === null
      ? null
      : (pickOptional(vehicle.description, locale) ?? t(VEHICLE_BLURB[vehicleClass]))

  const bookable = vehicle !== null && rateMinor !== null

  // ---------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------

  function validate(): boolean {
    const next: FieldErrors = {}

    if (!PLAIN_DATE.test(start)) next.start = t('dp_err_start')
    else if (isPastInBali(start)) next.start = t('dp_err_past')

    if (!PLAIN_DATE.test(end)) next.end = t('dp_err_end')
    else if (isPastInBali(end)) next.end = t('dp_err_past')
    // Only meaningful once both endpoints are real dates, so it is reported
    // against the end field and only when the start field is clean.
    else if (next.start === undefined && !isValidDateRange(start, end)) next.end = t('dp_err_order')

    setErrors(next)
    return next.start === undefined && next.end === undefined
  }

  /**
   * Hand the selection to the cart.
   *
   * The cart mutation is a server action owned by the /cart route; until it
   * lands this reports the outcome and pokes the header badge, which re-reads
   * its cookie on this event.
   */
  function commit() {
    toast(t('c_added'))
    window.dispatchEvent(new Event(CART_CHANGED_EVENT))
  }

  function onAddToTrip() {
    if (!bookable || !validate()) return
    commit()
  }

  function onBookNow() {
    if (!bookable || !validate()) return
    commit()
    router.push(CART_HREF)
  }

  /** An end date before the start date is not a range; clear it instead. */
  function onStartChange(next: string) {
    setStart(next)
    setErrors((previous) => ({ ...previous, start: undefined }))
    if (end !== '' && next !== '' && end < next) setEnd('')
  }

  /**
   * A travel date is a calendar date on the island, not an instant. Pinned to
   * UTC for formatting so the rendered day cannot drift by one with the
   * reader's own zone.
   */
  const calendarDate = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' })

  const dateSummary = days === null ? EMPTY : `${calendarDate(start)} → ${calendarDate(end)}`

  const lengthSummary =
    days === null ? EMPTY : days === 1 ? t('dp_days_one') : t('c_days_n', { n: days })

  return (
    <aside className="bt-booking" aria-labelledby={headingId}>
      <h2 id={headingId} style={{ fontSize: 18, marginBottom: 16 }}>
        {t('dp_book')}
      </h2>

      {/* ---------------- start date ---------------- */}
      <div className="bt-field">
        <label className="bt-flabel" htmlFor={startId}>
          {t('dp_start')}
        </label>
        <input
          id={startId}
          type="date"
          className={errors.start === undefined ? 'bt-input' : 'bt-input bt-input-err'}
          value={start}
          min={earliest === '' ? undefined : earliest}
          aria-invalid={errors.start !== undefined}
          aria-describedby={errors.start === undefined ? undefined : startErrorId}
          onChange={(event) => onStartChange(event.target.value)}
        />
        {errors.start !== undefined && (
          <p className="bt-errmsg" id={startErrorId}>
            <Icon name="cross" size={12} color="var(--orange-deep)" />
            {errors.start}
          </p>
        )}
      </div>

      {/* ---------------- end date ---------------- */}
      <div className="bt-field">
        <label className="bt-flabel" htmlFor={endId}>
          {t('dp_end')}
        </label>
        <input
          id={endId}
          type="date"
          className={errors.end === undefined ? 'bt-input' : 'bt-input bt-input-err'}
          value={end}
          min={start !== '' ? start : earliest === '' ? undefined : earliest}
          aria-invalid={errors.end !== undefined}
          aria-describedby={errors.end === undefined ? undefined : endErrorId}
          onChange={(event) => {
            setEnd(event.target.value)
            setErrors((previous) => ({ ...previous, end: undefined }))
          }}
        />
        {errors.end !== undefined && (
          <p className="bt-errmsg" id={endErrorId}>
            <Icon name="cross" size={12} color="var(--orange-deep)" />
            {errors.end}
          </p>
        )}
      </div>

      {/* ---------------- passengers ---------------- */}
      <div className="bt-field">
        <div className="bt-flabel">{t('dp_pax')}</div>
        <Stepper
          value={passengers}
          onChange={setPassengers}
          min={1}
          max={maxPassengers}
          label={t('dp_pax')}
          decreaseLabel={t('c_qty_dec')}
          increaseLabel={t('c_qty_inc')}
        />
      </div>

      {/* ---------------- auto-assigned vehicle ---------------- */}
      <div className="bt-vehicle">
        <span className="bt-vehicle-ic" aria-hidden="true">
          <Icon name={VEHICLE_ICON[vehicleClass]} size={28} color="var(--forest)" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="muted"
            style={{
              fontSize: 11.5,
              fontWeight: 700,
            }}
          >
            {t('dp_vehicle')}
          </div>
          {/* aria-live: the class changes as a side effect of the stepper, and
              a screen-reader user has no other way to notice. */}
          <div style={{ fontWeight: 800, fontSize: 16 }} aria-live="polite">
            {vehicleName}
          </div>
          {vehicleBlurb !== null && (
            <div className="muted" style={{ fontSize: 12.5 }}>
              {vehicleBlurb}
            </div>
          )}
        </div>
        <span className="tag tag-palm" style={{ fontSize: 10.5 }}>
          {t('dp_auto')}
        </span>
      </div>

      {/* ---------------- live summary ---------------- */}
      <div className="bt-summary">
        <SummaryRow label={t('dp_dates')} value={dateSummary} />
        <SummaryRow label={t('c_days')} value={lengthSummary} />
        <SummaryRow label={t('dp_pax')} value={format.number(passengers)} />
        {rateMinor !== null && (
          <SummaryRow
            label={`${money(rateMinor)}${t('dp_perday')}${days === null ? '' : ` × ${format.number(days)}`}`}
            value={totalMinor === null ? EMPTY : money(totalMinor)}
          />
        )}
        <div className="bt-summary-total">
          <span>{t('dp_est')}</span>
          <span>{totalMinor === null ? EMPTY : money(totalMinor)}</span>
        </div>
      </div>

      <Button
        variant="orange"
        block
        style={{ marginTop: 14 }}
        disabled={!bookable}
        onClick={onAddToTrip}
      >
        <Icon name="plus" size={17} color="#fff" /> {t('dp_addtrip')}
      </Button>
      <Button
        variant="forest"
        block
        style={{ marginTop: 10 }}
        disabled={!bookable}
        onClick={onBookNow}
      >
        {t('c_book')}
      </Button>
    </aside>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bt-summary-row">
      <span className="muted">{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  )
}

/** A query-string date is user input: accept it only in the exact ISO shape. */
function readDate(value: string | null): string {
  return value !== null && PLAIN_DATE.test(value) ? value : ''
}

/** Likewise for the passenger count — a positive integer, or the design's 2. */
function readPassengers(value: string | null): number {
  if (value === null) return 2
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return 2
  return Math.min(parsed, FALLBACK_MAX_PASSENGERS)
}
