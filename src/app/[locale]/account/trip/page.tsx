/**
 * My trip.
 *
 * The single most consequential fix in this slice. The handoff rendered
 * `ACCT_TRIP` — three hard-coded days — and, above it, `tripItems={cart}`
 * under a green "confirmed" tick reading "Added to your trip". The cart is
 * *unpaid*. A traveller could put four activities in it, never reach checkout,
 * open this panel and see them presented as a confirmed itinerary with a green
 * check beside them. They would turn up.
 *
 * Nothing here comes from the cart. Every line is an `order_items` row
 * belonging to an order that money actually arrived for, and a line that was
 * later refunded or cancelled disappears from the plan.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { LinkButton, Tag } from '@/components/shared'
import { TRIP_KIND_ICON } from '@/components/trip'
import { Icon } from '@/components/ui'
import { requireUser } from '@/lib/auth/session'
import { pick } from '@/lib/content/localize'
import type { CartItemKind } from '@/lib/pricing/quote'

import { toLocale } from '../../_seo-hreflang'
import { accountMetadata } from '../_lib/meta'
import { listTripDays } from '../_lib/queries'
import { PlannedPlaces } from './planned-places'
import { PrintTripButton } from './print-button'

const ACTIVITIES_HREF = '/activities'
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/

type PageParams = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  return accountMetadata(toLocale(raw), 'acct_nav_trip')
}

export default async function AccountTripPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const user = await requireUser()

  const days = await listTripDays(user.id)

  /**
   * A plain `DATE` is not an instant.
   *
   * Formatted at UTC midnight so "12 August" renders as 12 August for a reader
   * in Riyadh, in London and in Denpasar alike. Parsing it in the server's
   * zone would shift it by a day for half the world.
   */
  const calendarDate = (value: string): string => {
    if (!PLAIN_DATE.test(value)) return value
    return format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: 'full', timeZone: 'UTC' })
  }

  /**
   * Day numbers, assigned before render.
   *
   * Previously a counter incremented inside .map(), which mutates during
   * render — under StrictMode's double invoke, or any future partial
   * re-render, the numbering silently drifts. Undated items keep null and
   * are not numbered at all.
   */
  const dayNumbers = new Map<string, number>()
  let counter = 0
  for (const day of days) {
    if (day.date !== null) {
      counter += 1
      dayNumbers.set(day.date, counter)
    }
  }

  return (
    <section aria-labelledby="bt-acct-trip-h">
      <div className="bt-acct-sechead" style={{ marginBottom: 8 }}>
        <h1 id="bt-acct-trip-h">{t('acct_trip_t')}</h1>
        {days.length > 0 && <PrintTripButton />}
      </div>

      <p className="muted" style={{ marginTop: 0, marginBottom: 20, fontSize: 14.5 }}>
        {t('acct_trip_sub')}
      </p>

      <PlannedPlaces userId={user.id} locale={locale} />

      {days.length === 0 ? (
        <div className="bt-acct-empty">
          <Icon name="route" size={32} color="var(--muted)" />
          <p style={{ margin: 0, maxWidth: '40ch' }}>{t('acct_trip_empty')}</p>
          <LinkButton href={ACTIVITIES_HREF} variant="orange" size="sm">
            {t('ct2_browse')}
          </LinkButton>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {days.map((day) => {
            const dayNumber = day.date !== null ? (dayNumbers.get(day.date) ?? 0) : 0
            const headingId = `bt-acct-day-${day.date ?? 'undated'}`

            return (
              <article key={day.date ?? 'undated'} className="card" style={{ padding: 18 }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}
                  id={headingId}
                >
                  {day.date === null ? (
                    <span className="bt-acct-daynum" style={{ background: 'var(--forest-soft)' }}>
                      <Icon name="clock" size={16} color="#fff" />
                    </span>
                  ) : (
                    <span className="bt-acct-daynum">{format.number(dayNumber)}</span>
                  )}
                  <span style={{ fontWeight: 700, fontSize: 16 }}>
                    {day.date === null
                      ? t('acct_trip_undated')
                      : `${t('acct_trip_day')} ${format.number(dayNumber)}`}
                  </span>
                  {day.date !== null && (
                    <span className="muted" style={{ fontSize: 13 }}>
                      · {calendarDate(day.date)}
                    </span>
                  )}
                </div>

                <ul
                  aria-labelledby={headingId}
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {day.items.map((item) => {
                    const kind = item.kind as CartItemKind
                    const meta: string[] = []
                    if (item.travelTime !== null) meta.push(item.travelTime.slice(0, 5))
                    if (item.guests !== null) {
                      meta.push(`${t('c_guests')}: ${format.number(item.guests)}`)
                    }
                    if (item.endDate !== null && item.endDate !== item.travelDate) {
                      meta.push(`→ ${calendarDate(item.endDate)}`)
                    }

                    return (
                      <li key={item.id} className="bt-acct-dayline">
                        <Icon
                          name={TRIP_KIND_ICON[kind] ?? 'grid'}
                          size={16}
                          color="var(--forest-soft)"
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          {pick(item.name, locale, t(`ct2_grp_${item.kind}`))}
                          {meta.length > 0 && (
                            <span className="muted" style={{ fontSize: 12.5, display: 'block' }}>
                              {meta.join(' · ')}
                            </span>
                          )}
                        </span>
                        {/*
                          The money is in — every line here belongs to a
                          settled order. The badge reports the *supplier's*
                          acknowledgement on top of that, which is a different
                          fact and the one a traveller actually wants.
                        */}
                        {item.fulfilmentStatus === 'confirmed' ||
                        item.fulfilmentStatus === 'delivered' ? (
                          <Tag variant="palm">{t('cf_st_confirmed')}</Tag>
                        ) : (
                          <Tag>{t('cf_st_paid')}</Tag>
                        )}
                        <span className="muted" style={{ fontSize: 12 }}>
                          {item.orderNumber}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
