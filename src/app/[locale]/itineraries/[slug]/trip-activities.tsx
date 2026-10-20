'use client'

/**
 * Sale mode B: the activities of this plan that can be booked, with their
 * dates worked out from the trip's start date. Each one opens the activity's
 * own booking box with that date already chosen — the box is where the
 * package, time, people and extras are picked and priced, so nothing is
 * booked here without the traveller seeing the real price first.
 */

import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'
import { Link } from '@/i18n/routing'
import { todayInBali } from '@/lib/booking-rules'
import { dateOfTripDay } from '@/lib/itineraries/sale'

export interface BookableDay {
  dayNumber: number
  activityName: string
  activityHref: string
}

export function TripActivities({ days }: { days: BookableDay[] }) {
  const t = useTranslations()
  const format = useFormatter()
  const [start, setStart] = useState('')
  const [today, setToday] = useState('')
  // "Today" in Bali, after mount: the page is shared by every visitor.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the date is only known in the browser
    setToday(todayInBali())
  }, [])

  const valid = start !== '' && (today === '' || start >= today)

  return (
    <div className="it-acts">
      <label className="it-acts-start">
        <span>{t('p3_trip_start')}</span>
        <input
          type="date"
          className="bt-input"
          value={start}
          min={today || undefined}
          onChange={(event) => setStart(event.target.value)}
        />
      </label>
      {!valid && <p className="muted it-acts-hint">{t('p3_trip_start_hint')}</p>}
      <ol className="it-acts-list">
        {days.map((day) => {
          const date = valid ? dateOfTripDay(start, day.dayNumber) : null
          const href = date === null ? day.activityHref : `${day.activityHref}?date=${date}`
          return (
            <li key={day.dayNumber}>
              <span className="it-acts-day">
                {t('dt_day_n')} {format.number(day.dayNumber)}
              </span>
              <span className="it-acts-name">
                <b>{day.activityName}</b>
                {date !== null && (
                  <small className="muted">
                    {format.dateTime(new Date(`${date}T00:00:00Z`), {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'UTC',
                    })}
                  </small>
                )}
              </span>
              <Link href={href} className="btn btn-ghost btn-sm">
                <Icon name="cal" size={15} />{' '}
                {date === null ? t('p3_see_activity') : t('p3_book_day')}
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
