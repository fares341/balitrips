'use client'

/**
 * Calendar — port of the prototype's `BT.Calendar` (assets/booking.js) onto
 * the bt.css `.cal` styles: a Booking-style month grid, single day or range,
 * past and unavailable days disabled (hatched), today dotted, a legend, and
 * previous/next month buttons that mirror in RTL.
 *
 * Dates are plain `YYYY-MM-DD` strings and all arithmetic is in UTC, so a
 * calendar day never drifts with the reader's own time zone. "Today" is
 * passed in (Bali's date) rather than read from the device clock.
 */

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Icon } from '@/components/ui/icon'

export type CalendarValue = string | null
export type CalendarRange = [string | null, string | null]

type Common = {
  /** Bali's today, `YYYY-MM-DD`. Days before it are disabled. */
  today: string
  /** Extra closed days (fully booked, lead time passed, outside an event). */
  isUnavailable?: (iso: string) => boolean
  /** Two months side by side (desktop range pickers). */
  months?: 1 | 2
  /** Accessible name of the grid. */
  label: string
  /** Id put on the wrapper, e.g. for aria-describedby of an error line. */
  id?: string
  invalid?: boolean
}

export type CalendarProps =
  | (Common & { mode: 'single'; value: CalendarValue; onChange: (value: string) => void })
  | (Common & {
      mode: 'range'
      value: CalendarRange
      onChange: (value: CalendarRange) => void
      /** The picked range crosses an unavailable day; the caller explains. */
      onBlockedRange?: () => void
    })

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m, d))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}
const parts = (value: string): [number, number, number] => {
  const [y, m, d] = value.split('-').map(Number)
  return [y ?? 1970, (m ?? 1) - 1, d ?? 1]
}

export function Calendar(props: CalendarProps) {
  const { today, isUnavailable = () => false, months = 1, label, id, invalid } = props
  const t = useTranslations()
  const locale = useLocale()
  const intlLocale = locale === 'ar' ? 'ar-EG' : locale
  const rtl = locale === 'ar'

  const [a, b]: CalendarRange =
    props.mode === 'single' ? [props.value, null] : [props.value[0], props.value[1]]

  const [view, setView] = useState<[number, number]>(() => {
    const [y, m] = parts(a ?? today)
    return [y, m]
  })

  const [ty, tm] = parts(today)
  const canPrev = view[0] > ty || (view[0] === ty && view[1] > tm)

  const fmtNum = new Intl.NumberFormat(intlLocale, { useGrouping: false })
  const weekdayFmt = new Intl.DateTimeFormat(intlLocale, { weekday: 'narrow', timeZone: 'UTC' })
  const longFmt = new Intl.DateTimeFormat(intlLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  const titleFmt = new Intl.DateTimeFormat(intlLocale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  // 4 Jan 1970 was a Sunday: the week starts on Sunday, as in the prototype.
  const dows = Array.from({ length: 7 }, (_, i) =>
    weekdayFmt.format(new Date(Date.UTC(1970, 0, 4 + i))),
  )

  const disabled = (day: string) => day < today || isUnavailable(day)

  function pick(day: string) {
    if (props.mode === 'single') {
      props.onChange(day)
      return
    }
    if (!a || (a && b) || day < a) {
      props.onChange([day, null])
      return
    }
    // A range may not cross an unavailable day.
    let cursor = a
    while (cursor < day) {
      const [y, m, d] = parts(cursor)
      cursor = iso(y, m, d + 1)
      if (isUnavailable(cursor)) {
        props.onBlockedRange?.()
        return
      }
    }
    props.onChange([a, day])
  }

  function month(y: number, m: number) {
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay()
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const cells = []
    for (let i = 0; i < first; i++) cells.push(<span key={`b${i}`} />)
    for (let d = 1; d <= days; d++) {
      const day = iso(y, m, d)
      const past = day < today
      const un = !past && isUnavailable(day)
      const cls = [
        'cd',
        past ? 'past' : null,
        un ? 'un' : null,
        day === a ? 'sel s-a' : null,
        day === b ? 'sel s-b' : null,
        a && b && day > a && day < b ? 'in' : null,
        day === today ? 'today' : null,
      ]
        .filter(Boolean)
        .join(' ')
      const [yy, mm, dd] = parts(day)
      cells.push(
        <button
          key={day}
          type="button"
          className={cls}
          data-date={day}
          disabled={disabled(day)}
          aria-pressed={day === a || day === b}
          aria-label={`${longFmt.format(new Date(Date.UTC(yy, mm, dd)))}${un ? ` — ${t('act_cal_unavailable')}` : ''}`}
          onClick={() => pick(day)}
        >
          <span className="num">{fmtNum.format(d)}</span>
        </button>,
      )
    }
    return (
      <div className="cal-m" key={`${y}-${m}`}>
        <div className="cal-t">{titleFmt.format(new Date(Date.UTC(y, m, 1)))}</div>
        <div className="cal-g">
          {dows.map((dow, i) => (
            <span key={i} className="dw" aria-hidden="true">
              {dow}
            </span>
          ))}
          {cells}
        </div>
      </div>
    )
  }

  const shift = (delta: number) =>
    setView(([y, m]) => {
      const next = new Date(Date.UTC(y, m + delta, 1))
      return [next.getUTCFullYear(), next.getUTCMonth()]
    })

  const second = new Date(Date.UTC(view[0], view[1] + 1, 1))

  return (
    <div
      id={id}
      className={['cal', months === 2 ? 'two' : null, invalid ? 'is-invalid' : null]
        .filter(Boolean)
        .join(' ')}
      role="group"
      aria-label={label}
    >
      <div className="cal-nav">
        <button
          type="button"
          className="icon-btn"
          disabled={!canPrev}
          aria-label={t('act_cal_prev')}
          onClick={() => shift(-1)}
        >
          <span style={{ display: 'grid', transform: rtl ? undefined : 'scaleX(-1)' }}>
            <Icon name="chevronr" size={18} />
          </span>
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('act_cal_next')}
          onClick={() => shift(1)}
        >
          <span style={{ display: 'grid', transform: rtl ? 'scaleX(-1)' : undefined }}>
            <Icon name="chevronr" size={18} />
          </span>
        </button>
      </div>
      <div className="cal-ms">
        {month(view[0], view[1])}
        {months === 2 ? month(second.getUTCFullYear(), second.getUTCMonth()) : null}
      </div>
      <div className="cal-leg">
        <span>
          <i className="lg-sel" />
          {t('act_cal_selected')}
        </span>
        <span>
          <i className="lg-un" />
          {t('act_cal_unavailable')}
        </span>
        {props.mode === 'range' && a && !b ? (
          <span className="muted">{t('act_cal_pick_end')}</span>
        ) : null}
      </div>
    </div>
  )
}
