'use client'

/**
 * The map's itinerary-day mode (phase 3): `/map?itinerary=<slug>&day=<n>`.
 *
 * A separate view, not a change to the default map: the stops of one day,
 * numbered in visiting order, joined by a simple line, with a list beside
 * them and a way back to the itinerary. It receives only what
 * `buildDayRoute` produced on the server — numbered pins for the places the
 * viewer may see, and a COUNT of the locked ones (no id, name or coordinate).
 *
 * The real map (MapLibre) is used when it loads; otherwise — no WebGL, tiles
 * blocked — the illustrated island stands in, with the same pins and line.
 */

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'
import { Link } from '@/i18n/routing'

import { ART_H, ART_SMALL_URL, ART_W, geoToArt } from './art-warp'
import { attributionsFor, type MapSettings } from './map-style'
import { loadMapLibre, type MapLike } from './maplibre-loader'
import { createRealMap } from './real-map'

export interface DayPin {
  number: number
  lat: number
  lon: number
  slug: string
  name: string
}

export interface DayListEntry {
  number: number
  locked: boolean
  vip: boolean
  name: string | null
  note: string | null
  visitTime: string | null
}

const LINE_SOURCE = 'bt-day-route'

export function DayRouteMap({
  title,
  dayLabel,
  backHref,
  upgradeHref,
  pins,
  list,
  lockedCount,
  lockedNeedsVip,
  settings,
}: {
  title: string
  dayLabel: string
  backHref: string
  upgradeHref: string
  pins: DayPin[]
  list: DayListEntry[]
  lockedCount: number
  lockedNeedsVip: boolean
  settings: MapSettings
}) {
  const t = useTranslations()
  const locale = useLocale()
  const boxRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>(
    pins.length === 0 ? 'failed' : 'loading',
  )
  const [screen, setScreen] = useState<{ x: number; y: number }[]>([])

  useEffect(() => {
    const box = boxRef.current
    if (box === null || pins.length === 0) return
    let cancelled = false
    let map: MapLike | null = null
    let tileOk = false
    let tileErrors = 0
    const place = () => {
      if (map === null) return
      const m = map
      setScreen(pins.map((pin) => m.project([pin.lon, pin.lat])))
    }
    loadMapLibre()
      .then((engine) => {
        if (cancelled) return
        const first = pins[0]
        try {
          map = createRealMap(engine, box, settings, {
            center: first ? [first.lon, first.lat] : undefined,
            zoom: 12,
            pitch: 0,
            locale,
          })
        } catch {
          setState('failed')
          return
        }
        const m = map
        m.on('load', () => {
          if (cancelled) return
          if (pins.length >= 2) {
            m.addSource(LINE_SOURCE, {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: pins.map((p) => [p.lon, p.lat]) },
              },
            })
            m.addLayer({
              id: `${LINE_SOURCE}-casing`,
              type: 'line',
              source: LINE_SOURCE,
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
            })
            m.addLayer({
              id: LINE_SOURCE,
              type: 'line',
              source: LINE_SOURCE,
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: { 'line-color': '#e07e00', 'line-width': 3.5, 'line-dasharray': [2, 1.4] },
            })
          }
          const lons = pins.map((p) => p.lon)
          const lats = pins.map((p) => p.lat)
          if (pins.length >= 2) {
            m.fitBounds(
              [
                [Math.min(...lons), Math.min(...lats)],
                [Math.max(...lons), Math.max(...lats)],
              ],
              { padding: { top: 70, bottom: 70, left: 60, right: 60 }, duration: 0, maxZoom: 15 },
            )
          } else if (first) {
            m.jumpTo({ center: [first.lon, first.lat], zoom: 14 })
          }
          m.resize()
          place()
          setState('ready')
        })
        m.on('move', place)
        m.on('resize', place)
        m.on('data', (event) => {
          const e = event as { dataType?: string; tile?: unknown } | undefined
          if (e?.dataType === 'source' && e.tile !== undefined) tileOk = true
        })
        m.on('error', (event) => {
          const e = event as { tile?: unknown; sourceId?: string } | undefined
          if (e && (e.tile !== undefined || e.sourceId !== undefined)) tileErrors += 1
          if (!cancelled && tileErrors > 2 && !tileOk) setState('failed')
        })
      })
      .catch(() => {
        if (!cancelled) setState('failed')
      })
    return () => {
      cancelled = true
      map?.remove()
    }
  }, [pins, settings, locale])

  // The illustrated island: pins and line in artwork pixels.
  const art = pins.map((pin) => geoToArt(pin.lon, pin.lat))

  return (
    <main className="mp-day">
      <header className="mp-day-head">
        <Link href={backHref} className="btn btn-forest btn-sm mp-day-back">
          <Icon name="back" size={16} className="flip" /> {t('p3_back_itinerary')}
        </Link>
        <div className="mp-day-title">
          <small>{dayLabel}</small>
          <h1>{title}</h1>
        </div>
      </header>

      <div className="mp-day-body">
        <div className={`mp-day-map is-${state}`}>
          <div ref={boxRef} className="mp-day-canvas" dir="ltr" aria-hidden="true" />
          {state === 'ready' && (
            <div className="mp-day-pins" aria-hidden="true">
              {pins.map((pin, index) => {
                const point = screen[index]
                if (!point) return null
                return (
                  <span
                    key={pin.number}
                    className="mp-day-pin"
                    style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
                  >
                    {pin.number}
                  </span>
                )
              })}
            </div>
          )}
          {state === 'failed' && pins.length > 0 && (
            <div className="mp-day-art" dir="ltr" aria-hidden="true">
              <div className="mp-day-artbox">
                {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand artwork */}
                <img src={ART_SMALL_URL} alt="" />
                <svg viewBox={`0 0 ${ART_W} ${ART_H}`} preserveAspectRatio="none">
                  {art.length >= 2 && (
                    <polyline
                      points={art.map(([x, y]) => `${x},${y}`).join(' ')}
                      fill="none"
                      stroke="#e07e00"
                      strokeWidth={10}
                      strokeDasharray="24 16"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
                {pins.map((pin, index) => {
                  const point = art[index]
                  if (!point) return null
                  return (
                    <span
                      key={pin.number}
                      className="mp-day-pin is-art"
                      style={{
                        left: `${(point[0] / ART_W) * 100}%`,
                        top: `${(point[1] / ART_H) * 100}%`,
                      }}
                    >
                      {pin.number}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
          {state === 'loading' && <span className="mp-day-loading">{t('c_loading')}</span>}
          {pins.length === 0 && (
            <p className="mp-day-empty">
              {lockedCount > 0 ? t('p3_day_all_locked') : t('p3_day_no_places')}
            </p>
          )}
          {state === 'ready' && (
            <span className="mp-day-attrib" lang="en" dir="ltr">
              {attributionsFor(settings).join(' · ')}
            </span>
          )}
        </div>

        <aside className="mp-day-list" aria-label={dayLabel}>
          <ol>
            {list.map((entry) =>
              entry.locked ? (
                <li key={entry.number} className="is-locked">
                  <span className="it-stop-no">{entry.number}</span>
                  <span>
                    <b>
                      <Icon name="lock" size={13} /> {t('trip_locked_place')}
                    </b>
                    {entry.vip && <span className="tag tag-orange">VIP</span>}
                  </span>
                </li>
              ) : (
                <li key={entry.number}>
                  <span className="it-stop-no">{entry.number}</span>
                  <span>
                    <b>{entry.name}</b>
                    {entry.visitTime !== null && (
                      <small className="muted num" dir="ltr">
                        {entry.visitTime}
                      </small>
                    )}
                    {entry.note !== null && <small className="muted">{entry.note}</small>}
                  </span>
                </li>
              ),
            )}
          </ol>
          {lockedCount > 0 && (
            <div className="mp-day-upgrade">
              <p>
                <Icon name="lock" size={15} />{' '}
                {t(lockedNeedsVip ? 'p3_locked_vip_n' : 'p3_locked_n', { count: lockedCount })}
              </p>
              <Link href={upgradeHref} className="btn btn-orange btn-sm">
                {t('mp_unlock')}
              </Link>
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}
