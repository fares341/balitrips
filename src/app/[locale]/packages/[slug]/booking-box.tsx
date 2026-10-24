'use client'

import { LocalPrice } from '@/components/currency/currency-context'

/**
 * Package request sidebar (client, Oct 2026).
 *
 * Packages are not bought instantly for now. The customer picks the start
 * date, the travellers and the vehicle (every package includes a driver), sees
 * the estimated total — the activities' real prices per traveller plus one
 * driver day per day, priced for the vehicle by the zone of each day — and
 * sends a REQUEST. Staff confirm it with the suppliers and send a payment
 * link. The estimate here is display only; the server recomputes it.
 */

import { useEffect, useMemo, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { Button, Stepper } from '@/components/shared'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { BALI_TIME_ZONE, todayInBali } from '@/lib/booking-rules'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'
import { Calendar } from '@/components/booking/calendar'
import { estimatePackage, type EstimateDay } from '@/lib/packages/estimate'
import { isLuxury, type Vehicle } from '@/lib/packages/vehicles'

import { requestPackageAction } from './actions'

export type PackageBookingBoxProps = {
  slug: string
  days: number
  maxGuests: number
  dayPlan: EstimateDay[]
  vehicles: Vehicle[]
  sarPerUsd: number
}

const DEFAULT_GUESTS = 2

export function PackageBookingBox({
  slug,
  days,
  maxGuests,
  dayPlan,
  vehicles,
  sarPerUsd,
}: PackageBookingBoxProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const format = useFormatter()

  const upperGuests = Math.max(1, maxGuests)
  const [guests, setGuests] = useState(Math.min(DEFAULT_GUESTS, upperGuests))
  const [date, setDate] = useState('')
  const firstFit = (n: number) => vehicles.find((v) => v.capacity >= n)?.key ?? ''
  const [vehicleKey, setVehicleKey] = useState(() =>
    firstFit(Math.min(DEFAULT_GUESTS, upperGuests)),
  )
  const [contact, setContact] = useState({ name: '', email: '', phone: '', notes: '' })
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle')

  // "today" is not derivable at build time (the page is prerendered).
  const [minDate, setMinDate] = useState('')
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinDate(todayInBali())
  }, [])

  const vehicle = vehicles.find((v) => v.key === vehicleKey) ?? null
  const fits = vehicle !== null && vehicle.capacity >= guests

  const estimate = useMemo(
    () =>
      vehicle === null
        ? null
        : estimatePackage({ days: dayPlan, travellers: guests, vehicle, sarPerUsd }),
    [vehicle, dayPlan, guests, sarPerUsd],
  )
  const money = (minor: number) => formatMoney(minor, estimate?.currency ?? 'USD', locale)

  const dateLabel =
    date === ''
      ? '—'
      : format.dateTime(new Date(`${date}T00:00:00Z`), {
          dateStyle: 'medium',
          timeZone: BALI_TIME_ZONE,
        })

  const ready =
    date !== '' &&
    fits &&
    contact.name.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(contact.email) &&
    contact.phone.trim().length >= 7

  if (state === 'sent') {
    return (
      <aside className="bt-booking" aria-live="polite">
        <h2 className="h3" style={{ marginTop: 0 }}>
          <Icon name="check" size={20} /> {t('pk_req_sent_t')}
        </h2>
        <p>{t('pk_req_sent_b')}</p>
      </aside>
    )
  }

  const field = (key: keyof typeof contact, label: string, type = 'text', auto?: string) => (
    <label className="bt-field" style={{ display: 'block' }}>
      <span className="bt-flabel">{label}</span>
      {key === 'notes' ? (
        <textarea
          className="bt-input"
          rows={2}
          maxLength={1000}
          value={contact.notes}
          onChange={(event) => setContact((c) => ({ ...c, notes: event.target.value }))}
        />
      ) : (
        <input
          className="bt-input"
          type={type}
          autoComplete={auto}
          value={contact[key]}
          dir={type === 'tel' || type === 'email' ? 'ltr' : undefined}
          onChange={(event) => setContact((c) => ({ ...c, [key]: event.target.value }))}
        />
      )}
    </label>
  )

  return (
    <aside className="bt-booking" aria-label={t('pk_req_submit')}>
      <p className="tag tag-palm" style={{ alignSelf: 'flex-start' }}>
        <Icon name="car" size={13} /> {t('pk_driver_all')}
      </p>

      <div className="bt-field">
        <span className="bt-flabel">{t('c_date')}</span>
        {minDate === '' ? (
          <div style={{ minHeight: 290 }} aria-hidden="true" />
        ) : (
          <Calendar
            mode="single"
            value={date === '' ? null : date}
            onChange={setDate}
            today={minDate}
            label={t('c_date')}
          />
        )}
      </div>

      <div className="bt-field">
        <div className="bt-flabel">
          {t('ad_guests')} ({t('ph_maxg')} {format.number(upperGuests)})
        </div>
        <Stepper
          value={guests}
          onChange={(n) => {
            setGuests(n)
            if (vehicle === null || vehicle.capacity < n) setVehicleKey(firstFit(n))
          }}
          min={1}
          max={upperGuests}
          label={t('c_guests')}
        />
      </div>

      <fieldset className="bt-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="bt-flabel">{t('pk_req_vehicle')}</legend>
        <div className="stack" style={{ gap: 8 }}>
          {vehicles.map((option) => {
            const small = option.capacity < guests
            return (
              <label
                key={option.key}
                className="check"
                style={{
                  alignItems: 'flex-start',
                  opacity: small ? 0.55 : 1,
                  border: '1px solid var(--line, #e3ddd2)',
                  borderRadius: 12,
                  padding: '8px 10px',
                }}
              >
                <input
                  type="radio"
                  name="vehicle"
                  value={option.key}
                  checked={vehicleKey === option.key}
                  disabled={small}
                  onChange={() => setVehicleKey(option.key)}
                />
                <span>
                  <b>{pick(option.name, locale, option.key)}</b>{' '}
                  {isLuxury(option) && (
                    // Client: luxury cars have their own mark.
                    <span className="tag tag-sun" style={{ fontSize: 11 }}>
                      <Icon name="star" size={12} /> {t('pk_req_luxury')}
                    </span>
                  )}
                  <small className="muted" style={{ display: 'block' }}>
                    {small ? t('pk_req_too_small') : t('pk_req_seats', { n: option.capacity })}
                  </small>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {estimate !== null && (
        <div className="bt-summary">
          <div className="bt-summary-row">
            <span>{t('c_date')}</span>
            <span>{dateLabel}</span>
          </div>
          <div className="bt-summary-row">
            <span>{t('pk_req_acts', { n: guests })}</span>
            <span>{money(estimate.activitiesMinor)}</span>
          </div>
          <div className="bt-summary-row">
            <span>{t('pk_req_driver', { n: days })}</span>
            <span>{money(estimate.driverMinor)}</span>
          </div>
          <div className="bt-summary-total">
            <span>{t('pk_req_total')}</span>
            <span>{money(estimate.totalMinor)}</span>
          </div>
          <LocalPrice minor={estimate.totalMinor} currency={estimate.currency} />
          {estimate.incomplete && (
            <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
              {t('pk_req_incomplete')}
            </p>
          )}
        </div>
      )}

      {field('name', t('pk_req_name'), 'text', 'name')}
      {field('email', t('pk_req_email'), 'email', 'email')}
      {field('phone', t('pk_req_phone'), 'tel', 'tel')}
      {field('notes', t('pk_req_notes'))}

      <p className="muted" style={{ fontSize: 12.5 }}>
        <Icon name="info" size={14} /> {t('pk_req_note')}
      </p>
      {state === 'error' && (
        <p className="err" role="alert">
          {t('pk_req_err')}
        </p>
      )}
      <Button
        variant="orange"
        block
        disabled={!ready || state === 'busy'}
        onClick={() => {
          void (async () => {
            setState('busy')
            try {
              const result = await requestPackageAction({
                slug,
                startDate: date,
                travellers: guests,
                vehicleKey,
                ...contact,
                locale,
              })
              setState(result.ok ? 'sent' : 'error')
            } catch {
              setState('error')
            }
          })()
        }}
      >
        <Icon name="arrow" size={17} color="#fff" className="flip" /> {t('pk_req_submit')}
      </Button>
    </aside>
  )
}
