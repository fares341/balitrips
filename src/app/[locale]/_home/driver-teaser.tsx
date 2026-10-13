'use client'

/**
 * Home driver teaser — the package's mini booking card (home.html
 * `#mini-drv`): two dates, a travellers stepper, the vehicle chosen
 * automatically for that party, "N days × $rate" and the total, and
 * "Continue booking".
 *
 * Rates and vehicles are the real `driver_vehicles` rows passed in from the
 * server; the class comes from `vehicleForPassengers`, the same rule the quote
 * engine uses. The figures are a display estimate — checkout re-prices.
 *
 * "Continue booking" is a plain GET form to /driver with `start`, `end` and
 * `pax`, which DriverBooking reads to prefill itself; it works without
 * JavaScript too (the dates are then whatever the visitor typed).
 */

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { formatPrice } from '@/components/bt/card'
import { Stepper } from '@/components/shared/stepper'
import { Icon } from '@/components/ui'
import {
  daysBetweenInclusive,
  isValidDateRange,
  todayInBali,
  vehicleForPassengers,
  type VehicleClass,
} from '@/lib/booking-rules'

export type TeaserVehicle = {
  vehicleClass: VehicleClass
  label: string
  description: string | null
  dayRateMinor: number
  currency: string
  maxPassengers: number
}

export type DriverTeaserProps = {
  vehicles: readonly TeaserVehicle[]
  /** Localised /driver path — the form's action. */
  action: string
}

/** The package pre-fills a trip two weeks out, three days long. */
const LEAD_DAYS = 14
const DEFAULT_LENGTH_DAYS = 3
const FALLBACK_MAX = 14

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10)
}

export function DriverTeaser({ vehicles, action }: DriverTeaserProps) {
  const t = useTranslations()
  const locale = useLocale()

  const [range, setRange] = useState({ start: '', end: '', earliest: '' })
  const [passengers, setPassengers] = useState(2)
  const { start, end, earliest } = range

  // "Today" is not known at build time (this page is prerendered), so the
  // default range is filled in after mount; the server HTML has empty dates.
  useEffect(() => {
    const today = todayInBali()
    const from = addDays(today, LEAD_DAYS)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRange((current) => ({
      earliest: today,
      start: current.start === '' ? from : current.start,
      end: current.end === '' ? addDays(from, DEFAULT_LENGTH_DAYS - 1) : current.end,
    }))
  }, [])

  const maxPassengers = vehicles.reduce(
    (highest, vehicle) => Math.max(highest, vehicle.maxPassengers),
    vehicles.length === 0 ? FALLBACK_MAX : 1,
  )

  const vehicleClass = vehicleForPassengers(passengers)
  const vehicle = vehicles.find((one) => one.vehicleClass === vehicleClass) ?? null

  const days = isValidDateRange(start, end) ? daysBetweenInclusive(start, end) : null
  const rate = vehicle === null ? null : formatPrice(vehicle.dayRateMinor, vehicle.currency, locale)
  const total =
    vehicle === null || days === null
      ? null
      : formatPrice(vehicle.dayRateMinor * days, vehicle.currency, locale)

  const onStart = (value: string) => {
    setRange((current) => ({
      ...current,
      start: value,
      end: value !== '' && current.end !== '' && current.end < value ? value : current.end,
    }))
  }

  return (
    <form className="panel mini-book" action={action} method="get">
      <div className="field">
        <label htmlFor="md-from">{t('hv3_dr_from')}</label>
        <input
          className="input"
          type="date"
          id="md-from"
          name="start"
          value={start}
          min={earliest === '' ? undefined : earliest}
          onChange={(event) => onStart(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="md-to">{t('hv3_dr_to')}</label>
        <input
          className="input"
          type="date"
          id="md-to"
          name="end"
          value={end}
          min={start !== '' ? start : earliest === '' ? undefined : earliest}
          onChange={(event) => {
            const value = event.target.value
            setRange((current) => ({ ...current, end: value }))
          }}
        />
      </div>

      <div className="field full">
        <span className="label" id="md-pl">
          {t('hv3_dr_travelers')}
        </span>
        <div className="row between">
          <Stepper
            value={passengers}
            onChange={setPassengers}
            min={1}
            max={maxPassengers}
            label={t('hv3_dr_travelers')}
          />
          <input type="hidden" name="pax" value={passengers} />
          <div className="from md-sum" aria-live="polite">
            <small>
              {days !== null && rate !== null ? (
                <bdi>{t('hv3_dr_days', { n: days, price: rate })}</bdi>
              ) : (
                t('hv3_dr_pick_dates')
              )}
            </small>
            <b>
              <bdi className="price" dir="ltr">
                {total ?? '—'}
              </bdi>
            </b>
          </div>
        </div>
      </div>

      <div className="auto-car full" aria-live="polite">
        <Icon
          name={vehicleClass === 'van' ? 'van' : vehicleClass === 'suv' ? 'suv' : 'car'}
          size={22}
        />
        {vehicle === null ? (
          <span>{t('dp_veh_none')}</span>
        ) : (
          <span>
            <b>{vehicle.label}</b>
            {vehicle.description !== null && <> — {vehicle.description}</>}
            <small className="muted">{t('hv3_dr_auto', { n: passengers })}</small>
          </span>
        )}
      </div>

      <button className="btn btn-primary btn-block full" type="submit" disabled={vehicle === null}>
        {t('hv3_dr_continue')}
      </button>
    </form>
  )
}
