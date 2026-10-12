'use client'

/**
 * Homepage driver booking card.
 *
 * Ported from the right-hand column of `HomeDriver` in
 * design/handoff/sections-bt/page-home.jsx (lines 90-111): start and end dates,
 * a passenger stepper, a pickup-area select, and a vehicle strip that switches
 * with the passenger count.
 *
 * What the handoff did with all of it: nothing. `onClick={() => navigate("driver")}`
 * threw the four values away and dropped the visitor on an empty driver form,
 * which is the single most expensive interaction on the page to ask for twice.
 * The CTA carries the state across as query parameters instead, so the driver
 * page can rehydrate the request.
 *
 * The vehicle is derived, never chosen: `vehicleForPassengers` is the same
 * function the quote engine uses, so the class shown here and the class priced
 * at checkout cannot drift.
 *
 * 'use client' is required — four controlled inputs and a derived readout.
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button, Stepper } from '@/components/shared'
import { Icon, type IconName } from '@/components/ui'
import { useRouter } from '@/i18n/routing'
import { todayInBali, vehicleForPassengers, type VehicleClass } from '@/lib/booking-rules'

/** Message key and glyph per vehicle class, as in the handoff. */
const VEHICLE_LABEL: Record<VehicleClass, string> = {
  sedan: 'dp_veh_sedan',
  suv: 'dp_veh_suv',
  van: 'dp_veh_van',
}

const VEHICLE_ICON: Record<VehicleClass, IconName> = {
  sedan: 'car',
  suv: 'suv',
  van: 'van',
}

/** Matches `driver_vehicles.max_passengers` for the largest class. */
const MAX_PASSENGERS = 20

export type PickupArea = {
  /** `regions.key` — what the driver page will filter on. */
  key: string
  /** Already resolved for the active locale by the server. */
  label: string
}

export type DriverBookingCardProps = {
  areas: readonly PickupArea[]
  /** Where the CTA goes. Locale-agnostic; the router adds the prefix. */
  href: string
}

export function DriverBookingCard({ areas, href }: DriverBookingCardProps) {
  const t = useTranslations()
  const router = useRouter()

  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [passengers, setPassengers] = useState(2)
  const [area, setArea] = useState(areas[0]?.key ?? '')

  /**
   * Earliest selectable day, in Bali.
   *
   * Resolved after mount rather than during render: this page is prerendered,
   * so a build-time "today" would be baked into the HTML and go stale the
   * moment the deploy is a day old. Empty on the server and on the first
   * client render keeps hydration identical.
   */
  const [earliest, setEarliest] = useState('')
  useEffect(() => {
    // "today" is not derivable at build time; resolving it after mount is
    // the point. Validation enforces the constraint regardless.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEarliest(todayInBali())
  }, [])

  const vehicle = useMemo(() => vehicleForPassengers(passengers), [passengers])

  /** An end date before the start date is not a range; clear it instead. */
  const onStartChange = (next: string) => {
    setStart(next)
    if (end !== '' && next !== '' && end < next) setEnd('')
  }

  const submit = () => {
    const query = new URLSearchParams()
    if (start !== '') query.set('start', start)
    if (end !== '') query.set('end', end)
    query.set('pax', String(passengers))
    if (area !== '') query.set('area', area)

    router.push(`${href}?${query.toString()}`)
  }

  return (
    <div className="bt-hdriver-form">
      <div className="bt-daterange">
        <label className="bt-field" style={{ flex: 1, marginBottom: 0 }}>
          <span className="bt-flabel">{t('dp_start')}</span>
          <input
            type="date"
            className="bt-input"
            value={start}
            min={earliest === '' ? undefined : earliest}
            onChange={(event) => onStartChange(event.target.value)}
          />
        </label>

        <label className="bt-field" style={{ flex: 1, marginBottom: 0 }}>
          <span className="bt-flabel">{t('dp_end')}</span>
          <input
            type="date"
            className="bt-input"
            value={end}
            min={start !== '' ? start : earliest === '' ? undefined : earliest}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
      </div>

      <div className="bt-daterange" style={{ marginTop: 14 }}>
        <div className="bt-field" style={{ flex: 1, marginBottom: 0 }}>
          <span className="bt-flabel">{t('dp_pax')}</span>
          <Stepper
            value={passengers}
            onChange={setPassengers}
            min={1}
            max={MAX_PASSENGERS}
            label={t('dp_pax')}
          />
        </div>

        <label className="bt-field" style={{ flex: 1, marginBottom: 0 }}>
          <span className="bt-flabel">{t('hd_pickup')}</span>
          <select
            className="bt-input"
            value={area}
            onChange={(event) => setArea(event.target.value)}
          >
            {areas.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="bt-vehicle" style={{ marginTop: 16, marginBottom: 0 }}>
        <span className="bt-vehicle-ic">
          <Icon name={VEHICLE_ICON[vehicle]} size={26} color="var(--forest)" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="muted"
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            {t('hd_vehtype')}
          </div>
          {/* aria-live: the class changes as a side effect of the stepper, and
              a screen-reader user has no other way to notice. */}
          <div style={{ fontWeight: 800, fontSize: 15.5 }} aria-live="polite">
            {t(VEHICLE_LABEL[vehicle])}
          </div>
        </div>
      </div>

      <Button variant="orange" block style={{ marginTop: 16 }} onClick={submit}>
        <Icon name="car" size={18} color="#fff" /> {t('hd_cta')}
      </Button>
    </div>
  )
}
