/**
 * The places of one itinerary day, in order (phase 3) — itinerary page and
 * My Trip. Server component: it receives stops already redacted for the
 * viewer (`@/lib/itineraries/day-route`). A locked stop is a numbered lock
 * with an upgrade link; its name, place and note never reach this file.
 */

import { getTranslations } from 'next-intl/server'

import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick, pickOptional } from '@/lib/content/localize'
import type { DayStop } from '@/lib/itineraries/day-route'

export async function DayStops({
  stops,
  locale,
  mapHref,
  upgradeHref = '/plans',
}: {
  stops: readonly DayStop[]
  locale: Locale
  /** "Open this day on the map"; null hides it. */
  mapHref: string | null
  upgradeHref?: string
}) {
  if (stops.length === 0) return null
  const t = await getTranslations({ locale })
  const locked = stops.filter((stop) => stop.locked).length
  const needsVip = stops.some((stop) => stop.locked && stop.requiredEntitlement === 'vip')

  return (
    <div className="it-stops">
      <ol className="it-stops-list">
        {stops.map((stop) =>
          stop.locked ? (
            <li key={`locked-${stop.number}`} className="it-stop is-locked">
              <span className="it-stop-no" aria-hidden="true">
                {stop.number}
              </span>
              <span className="it-stop-b">
                <b>
                  <Icon name="lock" size={13} /> {t('trip_locked_place')}
                  {stop.requiredEntitlement === 'vip' && (
                    <span className="tag tag-orange" style={{ marginInlineStart: 6 }}>
                      VIP
                    </span>
                  )}
                </b>
              </span>
            </li>
          ) : (
            <li key={stop.place.id} className="it-stop">
              <span className="it-stop-no" aria-hidden="true">
                {stop.number}
              </span>
              <span className="it-stop-b">
                <Link href={stop.place.href}>
                  <b>{pick(stop.place.name, locale, stop.place.slug)}</b>
                </Link>
                {(stop.visitTime !== null || stop.place.regionLabel !== null) && (
                  <small className="muted">
                    {stop.visitTime !== null && (
                      <span dir="ltr" className="num">
                        {stop.visitTime}
                      </span>
                    )}
                    {stop.visitTime !== null && stop.place.regionLabel !== null && ' · '}
                    {stop.place.regionLabel !== null && pick(stop.place.regionLabel, locale)}
                  </small>
                )}
                {pickOptional(stop.note, locale) !== null && (
                  <small className="it-stop-note">{pickOptional(stop.note, locale)}</small>
                )}
              </span>
            </li>
          ),
        )}
      </ol>
      <div className="it-stops-foot">
        {mapHref !== null && (
          <Link href={mapHref} className="btn btn-ghost btn-sm">
            <Icon name="map" size={15} /> {t('p3_open_day_map')}
          </Link>
        )}
        {locked > 0 && (
          <Link href={upgradeHref} className="it-stops-upgrade">
            <Icon name="lock" size={14} />{' '}
            {t(needsVip ? 'p3_locked_vip_n' : 'p3_locked_n', { count: locked })}
          </Link>
        )}
      </div>
    </div>
  )
}
