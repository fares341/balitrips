'use client'

/**
 * Activity booking engine.
 *
 * Ported from the `<aside className="bt-booking">` half of
 * `ActivityDetailPage` in design/handoff/sections-bt/page-activities.jsx.
 * Price header, native date field, time-slot grid, guest stepper, driver
 * cross-sell toggle, live order summary and the two CTAs, with the handoff's
 * error styling (`.bt-input-err` on the field, `.bt-errmsg` beneath it).
 *
 * Four things the prototype got wrong, all of them about money or dates:
 *
 *  1. **The driver rate was three literals.** `veh === "van" ? 95 : veh ===
 *     "suv" ? 70 : 45` appeared in this file, in page-driver.jsx and in the
 *     header's quick-book form. The rate comes from `driver_vehicles` now, and
 *     the class comes from `vehicleForPassengers` — the 1-4 / 5-7 / 8+ rule is
 *     not restated here.
 *  2. **Totals were bare integers with a `$` glued on.** Every amount is
 *     minor units plus a currency code, rendered through `formatMoney`.
 *  3. **The time slots were hard-coded** to 09:00 / 11:30 / 14:00 / 16:30 for
 *     every activity in the catalogue. They come from `activities.time_slots`;
 *     an activity with none gets a real time field instead of four wrong
 *     buttons.
 *  4. **Validation only checked for emptiness.** A date in the past and a slot
 *     that has already passed its lead time both sailed through, so the
 *     operator received bookings they could not fulfil. Both are checked here
 *     against Bali time — and re-checked server-side in `buildQuote`, which is
 *     the copy that decides.
 *
 * The summary is the *displayed* total only. Nothing here is trusted at
 * checkout: `@/lib/pricing/quote` recomputes every line from catalogue data.
 */

import { useEffect, useId, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { CART_CHANGED_EVENT, CART_HREF } from '@/components/layout/routes'
import { addToCartAction } from '../../cart/actions'
import { useTierSelection } from './tier-selection'
import { Button, Modal, Stepper, useToast } from '@/components/shared'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { useRouter } from '@/i18n/routing'
import {
  isPastInBali,
  isWithinLeadTime,
  todayInBali,
  vehicleForPassengers,
} from '@/lib/booking-rules'
import { pick } from '@/lib/content/localize'
import type { DriverVehicleDto } from '@/lib/content/types'
import { formatMoney, lineTotalMinor } from '@/lib/money'

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/
const PLAIN_TIME = /^\d{2}:\d{2}$/

/** Placeholder for a summary value the traveller has not chosen yet. */
const EMPTY = '—'

export type BookingEngineProps = {
  /** The activity being sold. Without it there is nothing to add to a cart. */
  activityId: string
  priceMinor: number
  currency: string
  /** `HH:mm` start times. Empty means the activity has no fixed departures. */
  timeSlots: string[]
  maxGuests: number
  leadTimeHours: number
  /** The whole fleet. The engine picks the class its guest count implies. */
  vehicles: DriverVehicleDto[]
}

type FieldErrors = {
  date?: string
  time?: string
}

export function BookingEngine({
  activityId,
  priceMinor,
  currency,
  timeSlots,
  maxGuests,
  leadTimeHours,
  vehicles,
}: BookingEngineProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const format = useFormatter()
  const router = useRouter()
  const { toast } = useToast()

  const baseId = useId()
  const headingId = `${baseId}-heading`
  const dateId = `${baseId}-date`
  const dateErrorId = `${baseId}-date-error`
  const timeErrorId = `${baseId}-time-error`
  const upsellTitleId = `${baseId}-upsell`

  /**
   * The service level chosen in the tier cards, if any.
   *
   * When one is selected this box sells THAT, not the activity's base price:
   * the line references the tier, the total uses the tier's price, and the
   * stepper honours the tier's tighter cap. Showing a base price next to a
   * selected Premium tier is the prototype's "collect guests, charge flat"
   * bug in a new costume -- the number on screen must be the number charged.
   */
  const { selected } = useTierSelection()
  const effectivePriceMinor = selected?.priceMinor ?? priceMinor
  // A tier may cap the party tighter than the activity, never looser.
  const effectiveMaxGuests = Math.min(selected?.maxGuests ?? maxGuests, maxGuests)

  const [guestsRaw, setGuests] = useState(() => Math.min(2, Math.max(1, maxGuests)))

  /**
   * Clamped, not stored.
   *
   * A visitor can pick five guests and then select a couples tier capped at
   * two. Leaving the state alone would show five against a cap of two and let
   * the server reject the booking; resetting the state would silently discard
   * a choice they may want back when they deselect the tier. Deriving it keeps
   * the original intact and the displayed total honest.
   */
  const guests = Math.min(guestsRaw, effectiveMaxGuests)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [wantsDriver, setWantsDriver] = useState(false)
  /** Guards the CTAs while the server action is in flight. */
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [upsellOpen, setUpsellOpen] = useState(false)

  /**
   * `min` is set after mount, not during render.
   *
   * "Today in Bali" is read from the clock, so a value baked into the server
   * render can disagree with the client's across a midnight boundary and trip
   * a hydration mismatch on the attribute. The picker gains the constraint a
   * tick later; `validate()` enforces it regardless, which is what actually
   * protects the booking.
   */
  const [minDate, setMinDate] = useState<string | undefined>(undefined)
  // "today" is not derivable at build time; resolving it after mount is
  // the point. validate() enforces the constraint regardless, so the picker
  // gaining `min` a tick late cannot let a past date through.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinDate(todayInBali())
  }, [])

  // ---------------------------------------------------------------------
  // Derived pricing
  // ---------------------------------------------------------------------

  const vehicleClass = vehicleForPassengers(guests)
  const vehicle = vehicles.find((one) => one.vehicleClass === vehicleClass) ?? null

  /**
   * The cross-sell is offered only when it can be priced into the same total.
   *
   * A fleet row in another currency cannot be added to this activity's
   * subtotal without an exchange rate this system does not have, so the toggle
   * is withheld rather than producing a number that is wrong in both
   * currencies.
   */
  const driverAvailable = vehicle !== null && vehicle.currency === currency
  const driverOn = wantsDriver && driverAvailable
  const driverRateMinor = vehicle?.dayRateMinor ?? 0

  const baseMinor = lineTotalMinor(effectivePriceMinor, guests)
  const totalMinor = baseMinor + (driverOn ? driverRateMinor : 0)

  const money = (minor: number) => formatMoney(minor, currency, locale)

  // ---------------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------------

  /** `09:00` with the locale's own digits. Never re-anchored to a timezone. */
  const clock = (value: string) => {
    if (!PLAIN_TIME.test(value)) return value
    const [hours, minutes] = value.split(':')
    const pad = (part: string) =>
      format.number(Number(part), { minimumIntegerDigits: 2, useGrouping: false })
    return `${pad(hours ?? '')}:${pad(minutes ?? '')}`
  }

  const meridiem = (value: string) => (Number(value.slice(0, 2)) < 12 ? t('am') : t('pm'))

  /**
   * A travel date is a calendar date on the island, not an instant. It is
   * pinned to UTC for formatting so the rendered day cannot drift by one with
   * the reader's own zone — which `new Date('2026-08-10T00:00:00')` does.
   */
  const calendarDate = (value: string) => {
    if (!PLAIN_DATE.test(value)) return EMPTY
    return format.dateTime(new Date(`${value}T00:00:00Z`), {
      dateStyle: 'medium',
      timeZone: 'UTC',
    })
  }

  // ---------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------

  function validate(): boolean {
    const next: FieldErrors = {}

    if (!PLAIN_DATE.test(date)) next.date = t('ad_err_date')
    else if (isPastInBali(date)) next.date = t('ad_err_past')

    if (!PLAIN_TIME.test(time)) next.time = t('ad_err_time')
    else if (next.date === undefined && !isWithinLeadTime(date, time, leadTimeHours)) {
      next.time = t('ad_err_lead')
    }

    setErrors(next)
    return next.date === undefined && next.time === undefined
  }

  /**
   * Hand the selection to the cart.
   *
   * This awaits the server action and only reports success once the row
   * exists. It previously fired the toast and the badge event and nothing
   * else, so the traveller was told "added to your trip" while the cart
   * stayed empty — the entire money path was unreachable through the UI.
   *
   * A linked driver goes in the SAME call rather than as a second item, so
   * removing the activity cannot leave an orphaned driver charge behind.
   */
  async function commit(withDriver: boolean): Promise<boolean> {
    setBusy(true)
    try {
      const result = await addToCartAction({
        kind: selected ? 'activity_tier' : 'activity',
        refId: selected?.id ?? activityId,
        quantity: guests,
        travelDate: date,
        travelTime: time,
        guests,
        driver: withDriver ? { guests } : null,
      })

      // The result was previously discarded, so a refused add still toasted
      // "Added to your trip" and routed on to an empty cart. This page is
      // prerendered, so the reason has to come from the response at request
      // time -- reading the flag here would bake the build machine's value in.
      if (!result.ok) {
        toast(t(result.reason === 'bookings_closed' ? 'bk_closed_t' : 'c_error'))
        return false
      }

      toast(t('c_added'))
      // The header badge re-reads CART_COUNT_COOKIE on this event. Imported
      // rather than spelled out so the two sides cannot drift.
      window.dispatchEvent(new Event(CART_CHANGED_EVENT))
      return true
    } catch {
      toast(t('c_error'))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function onAddToTrip() {
    if (!validate()) return
    await commit(driverOn)
  }

  async function onBookNow() {
    if (!validate()) return
    // The upsell is the point of the flow: ask once, only when there is
    // something to ask about.
    if (!driverOn && driverAvailable) {
      setUpsellOpen(true)
      return
    }
    if (await commit(driverOn)) router.push(CART_HREF)
  }

  async function checkout(withDriver: boolean) {
    setWantsDriver(withDriver)
    setUpsellOpen(false)
    if (await commit(withDriver)) router.push(CART_HREF)
  }

  const slots = timeSlots.filter((slot) => PLAIN_TIME.test(slot))

  return (
    <aside className="bt-booking" aria-labelledby={headingId}>
      <div className="bt-booking-price">
        <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>
          {t('c_from')}
        </span>
        <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--forest-deep)' }}>
          {money(effectivePriceMinor)}
        </span>
        <span className="muted" style={{ fontSize: 13 }}>
          {t('c_pp')}
        </span>
      </div>

      <h2 id={headingId} style={{ fontSize: 17, margin: '4px 0 14px' }}>
        {t('ad_book')}
      </h2>

      {/* ---------------- date ---------------- */}
      <div className="bt-field">
        <label className="bt-flabel" htmlFor={dateId}>
          {t('ad_seldate')}
        </label>
        <input
          id={dateId}
          type="date"
          className={errors.date === undefined ? 'bt-input' : 'bt-input bt-input-err'}
          value={date}
          min={minDate}
          aria-invalid={errors.date !== undefined}
          aria-describedby={errors.date === undefined ? undefined : dateErrorId}
          onChange={(event) => {
            setDate(event.target.value)
            setErrors((previous) => ({ ...previous, date: undefined }))
          }}
        />
        {errors.date !== undefined && (
          <p className="bt-errmsg" id={dateErrorId}>
            <Icon name="cross" size={12} color="var(--orange-deep)" />
            {errors.date}
          </p>
        )}
      </div>

      {/* ---------------- time ---------------- */}
      <div className="bt-field">
        <div className="bt-flabel" id={`${baseId}-timelabel`}>
          {t('ad_seltime')}
        </div>

        {slots.length > 0 ? (
          <div className="bt-timeslots" role="group" aria-labelledby={`${baseId}-timelabel`}>
            {slots.map((slot) => {
              const selected = slot === time
              return (
                <button
                  key={slot}
                  type="button"
                  className={selected ? 'bt-slot on' : 'bt-slot'}
                  aria-pressed={selected}
                  onClick={() => {
                    setTime(slot)
                    setErrors((previous) => ({ ...previous, time: undefined }))
                  }}
                >
                  {clock(slot)}
                  <span>{meridiem(slot)}</span>
                </button>
              )
            })}
          </div>
        ) : (
          // No fixed departures: a real time field, rather than the handoff's
          // four buttons that were wrong for every activity without them.
          <input
            type="time"
            aria-label={t('ad_seltime')}
            className={errors.time === undefined ? 'bt-input' : 'bt-input bt-input-err'}
            value={time}
            aria-invalid={errors.time !== undefined}
            aria-describedby={errors.time === undefined ? undefined : timeErrorId}
            onChange={(event) => {
              setTime(event.target.value)
              setErrors((previous) => ({ ...previous, time: undefined }))
            }}
          />
        )}

        {errors.time !== undefined && (
          <p className="bt-errmsg" id={timeErrorId}>
            <Icon name="cross" size={12} color="var(--orange-deep)" />
            {errors.time}
          </p>
        )}
      </div>

      {/* ---------------- guests ---------------- */}
      <div className="bt-field">
        <div className="bt-flabel">{t('ad_guests')}</div>
        <Stepper
          value={guests}
          onChange={setGuests}
          min={1}
          max={effectiveMaxGuests}
          label={t('ad_guests')}
          decreaseLabel={t('c_qty_dec')}
          increaseLabel={t('c_qty_inc')}
        />
      </div>

      {/* ---------------- driver cross-sell ---------------- */}
      {driverAvailable && (
        <button
          type="button"
          className={driverOn ? 'bt-toggle on' : 'bt-toggle'}
          aria-pressed={driverOn}
          onClick={() => setWantsDriver((previous) => !previous)}
        >
          <span className="bt-toggle-sw" aria-hidden="true" />
          <span style={{ flex: 1, textAlign: 'start' }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: 13.5,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="car" size={16} color="var(--forest)" /> {t('ad_adddriver')}
            </span>
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>
              {t('ad_adddriver_b')}
            </span>
          </span>
        </button>
      )}

      {/* ---------------- live order summary ---------------- */}
      <div className="bt-summary">
        <div className="bt-summary-t">{t('ad_summary')}</div>
        <SummaryRow label={t('c_date')} value={date === '' ? EMPTY : calendarDate(date)} />
        <SummaryRow label={t('ad_seltime')} value={time === '' ? EMPTY : clock(time)} />
        <SummaryRow label={t('c_guests')} value={format.number(guests)} />
        <SummaryRow
          label={`${t('ad_base')} (${money(effectivePriceMinor)} × ${format.number(guests)})`}
          value={money(baseMinor)}
        />
        {driverOn && vehicle !== null && (
          <SummaryRow
            label={`${t('ad_driverline')} · ${pick(vehicle.label, locale, vehicle.vehicleClass)}`}
            value={money(driverRateMinor)}
          />
        )}
        <div className="bt-summary-total">
          <span>{t('c_total')}</span>
          <span>{money(totalMinor)}</span>
        </div>
      </div>

      <Button
        variant="orange"
        block
        style={{ marginTop: 14 }}
        onClick={onAddToTrip}
        disabled={busy}
      >
        <Icon name="plus" size={17} color="#fff" /> {t('c_addtrip')}
      </Button>
      <Button variant="forest" block style={{ marginTop: 10 }} onClick={onBookNow} disabled={busy}>
        {t('c_book')}
      </Button>

      {/* ---------------- driver upsell ---------------- */}
      <Modal
        open={upsellOpen}
        // Escape and the scrim dismiss the question without committing. The
        // handoff treated both as "no thanks" and pushed the order through to
        // the cart, so an accidental click outside the dialog checked out.
        onClose={() => setUpsellOpen(false)}
        labelledBy={upsellTitleId}
        panelClassName="bt-upsell"
        showClose={false}
      >
        <div className="bt-upsell-icon">
          <Icon name="car" size={30} color="var(--forest)" />
        </div>
        <h2 id={upsellTitleId} style={{ fontSize: 24, textAlign: 'center' }}>
          {t('up_title')}
        </h2>
        <p
          className="muted"
          style={{ textAlign: 'center', fontSize: 15, margin: '10px 0 22px', lineHeight: 1.6 }}
        >
          {t('up_body')}
        </p>
        <Button variant="orange" block onClick={() => checkout(true)}>
          <Icon name="plus" size={17} color="#fff" /> {t('up_add')}
        </Button>
        <Button variant="ghost" block style={{ marginTop: 10 }} onClick={() => checkout(false)}>
          {t('up_no')}
        </Button>
      </Modal>
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
