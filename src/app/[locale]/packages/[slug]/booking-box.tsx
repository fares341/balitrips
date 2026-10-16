'use client'

/**
 * Package booking sidebar.
 *
 * Ported from the `<aside className="bt-booking">` in `PackageDetailPage`
 * (design/handoff/sections-bt/page-plans.jsx, lines 169-180).
 *
 * The handoff's total was wrong, and wrong in a way that would have reached a
 * card statement. It rendered:
 *
 *     <SummaryRow label={t("c_guests")} value={guests} />
 *     <div className="bt-summary-total"><span>${p.price}</span></div>
 *
 * — collecting a guest count, showing it back, and then charging a flat price
 * that ignored it. For a per-guest package a family of six saw the price for
 * one. `pricingMode` is the schema's answer to that contradiction, and this
 * component honours it: `per_guest` multiplies, `flat` does not, and the
 * summary says which is happening rather than leaving the visitor to guess why
 * the number did or did not move.
 *
 * The arithmetic here is display only. `buildQuote()` recomputes the same
 * total server-side from the catalogue row at checkout and refuses to charge on
 * a mismatch — the browser is never trusted for an amount.
 *
 * 'use client' is required: date and guest count are live state.
 */

import { useEffect, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { Button, Stepper, useToast } from '@/components/shared'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { BALI_TIME_ZONE, todayInBali } from '@/lib/booking-rules'
import type { PricingMode } from '@/lib/content/types'
import { formatMoney, lineTotalMinor } from '@/lib/money'
import { Calendar } from '@/components/booking/calendar'

import { CART_CHANGED_EVENT } from '@/components/layout/routes'
import { addToCartAction } from '../../my-trip/actions'

export type PackageBookingBoxProps = {
  /** Cart lines reference the row, not the slug, which is editable. */
  packageId: string
  priceMinor: number
  currency: string
  pricingMode: PricingMode
  maxGuests: number
}

/** Party size the design pre-selects, never above what the package allows. */
const DEFAULT_GUESTS = 2

const HINT_ID = 'bt-pkg-date-hint'

export function PackageBookingBox({
  packageId,
  priceMinor,
  currency,
  pricingMode,
  maxGuests,
}: PackageBookingBoxProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const format = useFormatter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const upperGuests = Math.max(1, maxGuests)
  const [guests, setGuests] = useState(Math.min(DEFAULT_GUESTS, upperGuests))
  const [date, setDate] = useState('')

  /**
   * Earliest selectable date, computed after mount.
   *
   * Deliberately not computed during render: this page is prerendered, so
   * "today" resolved at build time would still be baked into the HTML weeks
   * later and would let a visitor pick a date already in the past. Empty until
   * hydration, which also keeps the server and client markup identical.
   */
  const [minDate, setMinDate] = useState('')
  useEffect(() => {
    // "today" is not derivable at build time; resolving it after mount is
    // the point. Validation enforces the constraint regardless.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinDate(todayInBali())
  }, [])

  const perGuest = pricingMode === 'per_guest'
  const totalMinor = perGuest ? lineTotalMinor(priceMinor, guests) : priceMinor

  /*
   * This used to build a `/cart?add=package&slug=...` link.
   *
   * The cart never read searchParams, so the button was a dead link: it opened
   * an empty cart and the selection was silently dropped. Its own comment said
   * "a cart that ignores them still opens correctly" -- which is precisely how
   * a broken buy path survives review, because nothing errors. It now calls
   * the same server action the activity page uses.
   */

  const dateLabel =
    date === ''
      ? '—'
      : format.dateTime(new Date(`${date}T00:00:00Z`), {
          dateStyle: 'medium',
          // A travel date is a calendar date in Bali, not an instant in the
          // reader's life. Pinning the zone keeps 12 March reading as 12 March
          // from Riyadh, London and New York alike.
          timeZone: BALI_TIME_ZONE,
        })

  return (
    <aside className="bt-booking" aria-label={t('pd_checkout')}>
      <div className="bt-booking-price">
        <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--forest-deep)' }}>
          {formatMoney(priceMinor, currency, locale)}
        </span>
        {perGuest && (
          <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>
            {t('c_pp')}
          </span>
        )}
      </div>

      {/* The start date on the shared calendar (v3 package.html), from Bali's
          today; rendered once that is known on the client. */}
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
        {/*
          Capped at the package's own maxGuests. The handoff passed the same
          bound, but its cart stepper did not — this one enforces it on the
          keyboard path as well, and the server re-checks it at checkout.
        */}
        <Stepper
          value={guests}
          onChange={setGuests}
          min={1}
          max={upperGuests}
          label={t('c_guests')}
        />
      </div>

      <div className="bt-summary">
        <div className="bt-summary-row">
          <span>{t('c_date')}</span>
          <span>{dateLabel}</span>
        </div>
        <div className="bt-summary-row">
          <span>{t('c_guests')}</span>
          <span>{format.number(guests)}</span>
        </div>
        {/*
          Shown only in per-guest mode, where it is the reason the total moves.
          In flat mode the total is deliberately independent of the guest count
          and repeating the unit price would imply a multiplication that is not
          happening.
        */}
        {perGuest && (
          <div className="bt-summary-row">
            <span>{t('c_pp')}</span>
            <span>{formatMoney(priceMinor, currency, locale)}</span>
          </div>
        )}
        <div className="bt-summary-total">
          <span>{t('c_total')}</span>
          <span>{formatMoney(totalMinor, currency, locale)}</span>
        </div>
      </div>

      {date === '' ? (
        <>
          <Button
            variant="orange"
            block
            disabled
            aria-describedby={HINT_ID}
            style={{ marginTop: 14 }}
          >
            <Icon name="plus" size={17} color="#fff" /> {t('pd_checkout')}
          </Button>
          <p id={HINT_ID} className="muted center" style={{ fontSize: 12.5, marginTop: 8 }}>
            {t('ad_seldate')}
          </p>
        </>
      ) : (
        <Button
          variant="orange"
          block
          disabled={busy}
          style={{ marginTop: 14 }}
          onClick={() => {
            void (async () => {
              setBusy(true)
              try {
                const result = await addToCartAction({
                  kind: 'package',
                  refId: packageId,
                  quantity: guests,
                  travelDate: date,
                  travelTime: null,
                  guests,
                  driver: null,
                })
                if (!result.ok) {
                  toast(t(result.reason === 'bookings_closed' ? 'bk_closed_t' : 'c_error'))
                  return
                }
                toast(t('c_added'))
                window.dispatchEvent(new Event(CART_CHANGED_EVENT))
              } catch {
                toast(t('c_error'))
              } finally {
                setBusy(false)
              }
            })()
          }}
        >
          <Icon name="plus" size={17} color="#fff" /> {t('pd_checkout')}
        </Button>
      )}
    </aside>
  )
}
