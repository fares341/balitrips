/**
 * «How your itinerary works» (client, Oct 2026): what the buyer receives and
 * how it reaches them — shown on the itineraries list and on each itinerary.
 *
 * The three «pages» are an illustration built in HTML/CSS (a cover, one day,
 * the map), not a real plan: no place name, time or price in them is content.
 * The photo is the itinerary's own hero when there is one.
 */

import { getTranslations } from 'next-intl/server'

import { Icon, Photo, type IconName } from '@/components/ui'
import type { Locale } from '@/i18n/config'

const STEPS: readonly { icon: IconName; key: string }[] = [
  { icon: 'doc', key: 'ihw_s1' },
  { icon: 'card', key: 'ihw_s2' },
  { icon: 'mail', key: 'ihw_s3' },
  { icon: 'map', key: 'ihw_s4' },
]

/** Pin positions on the illustrated map (percent of the frame). */
const PINS: readonly [number, number][] = [
  [26, 64],
  [44, 46],
  [63, 55],
  [74, 30],
]

export async function ItineraryHowItWorks({
  locale,
  photo,
  title,
  days,
  id = 'it-how',
}: {
  locale: Locale
  /** A photo for the illustrated cover (the itinerary's hero, or a brand photo). */
  photo: string
  /** The cover title; the generic «your Bali itinerary» when not given. */
  title?: string
  days?: number
  id?: string
}) {
  const t = await getTranslations({ locale })
  const coverTitle = title ?? t('ihw_cover_t')

  return (
    <section className="ihw" aria-labelledby={`${id}-h`} id={id}>
      <div className="ihw-head">
        <span className="ihw-eyebrow">{t('ihw_eyebrow')}</span>
        <h2 className="h2" id={`${id}-h`}>
          {t('ihw_title')}
        </h2>
        <p className="muted">{t('ihw_sub')}</p>
      </div>

      <div className="ihw-body">
        <ol className="ihw-steps">
          {STEPS.map((step, index) => (
            <li key={step.key}>
              <span className="ihw-num" aria-hidden="true">
                <Icon name={step.icon} size={20} />
                <i dir="ltr">{index + 1}</i>
              </span>
              <span>
                <b>{t(`${step.key}_t`)}</b>
                <span className="muted">{t(`${step.key}_b`)}</span>
              </span>
            </li>
          ))}
        </ol>

        <figure className="ihw-preview">
          <div className="ihw-pages" aria-hidden="true">
            {/* 1 · the cover */}
            <div className="ihw-page is-cover">
              <div className="ihw-cover-img">
                <Photo
                  src={photo}
                  alt=""
                  sizes="220px"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                />
              </div>
              <div className="ihw-cover-t">
                <small>Bali Trips</small>
                <b>{coverTitle}</b>
                {days !== undefined && <span>{t('c_days_n', { n: days })}</span>}
              </div>
            </div>
            {/* 2 · one day */}
            <div className="ihw-page is-day">
              <span className="ihw-day-badge">{t('ihw_day1')}</span>
              {[0, 1, 2].map((row) => (
                <div key={row} className="ihw-day-row">
                  <i />
                  <span>
                    <em style={{ width: `${78 - row * 14}%` }} />
                    <em style={{ width: `${52 + row * 9}%` }} />
                  </span>
                </div>
              ))}
              <div className="ihw-day-tip">
                <Icon name="info" size={12} />
                <em />
              </div>
            </div>
            {/* 3 · the map */}
            <div className="ihw-page is-map">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="ihw-map-art">
                <path
                  d="M8 62 C 18 40, 40 30, 58 34 S 90 26, 94 44 S 80 84, 52 82 S 12 82, 8 62 Z"
                  className="ihw-land"
                />
                <polyline
                  points={PINS.map(([x, y]) => `${x},${y}`).join(' ')}
                  className="ihw-route"
                />
              </svg>
              {PINS.map(([x, y], index) => (
                <span
                  key={index}
                  className="ihw-pin"
                  style={{ left: `${x}%`, top: `${y}%` }}
                  dir="ltr"
                >
                  {index + 1}
                </span>
              ))}
            </div>
          </div>
          <figcaption className="ihw-labels">
            <span>
              <Icon name="pdf" size={16} /> {t('ihw_l_pdf')}
            </span>
            <span>
              <Icon name="cal" size={16} /> {t('ihw_l_days')}
            </span>
            <span>
              <Icon name="route" size={16} /> {t('ihw_l_map')}
            </span>
          </figcaption>
          <p className="ihw-note muted">{t('ihw_note')}</p>
        </figure>
      </div>
    </section>
  )
}
