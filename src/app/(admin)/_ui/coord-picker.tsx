'use client'

/**
 * Studio → place editor: latitude / longitude with the SAME real map the
 * public site uses (`createRealMap`). Click the map or drag the pin to set
 * the point; the two numeric fields stay the source of truth (they are what
 * the form posts) and can still be typed into — the pin follows them.
 *
 * Without the map (CDN or tiles unreachable, no WebGL) the fields work as
 * before and a note says so.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'

import { attributionsFor, type MapSettings } from '@/app/[locale]/map/map-style'
import { loadMapLibre, type MapLike } from '@/app/[locale]/map/maplibre-loader'
import { createRealMap } from '@/app/[locale]/map/real-map'
import { isInBali } from '@/lib/geo'

import { useAdminT } from './i18n-provider'

function parseCoord(text: string, limit: number): number | null {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null
}

const fixed = (value: number) => value.toFixed(6)

export function CoordPicker({
  lat,
  lon,
  settings,
}: {
  lat: string
  lon: string
  settings: MapSettings
}) {
  const { t, locale } = useAdminT()
  const [latText, setLatText] = useState(lat)
  const [lonText, setLonText] = useState(lon)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLike | null>(null)
  const dragRef = useRef(false)
  const frameRef = useRef(0)

  const point = useMemo(() => {
    const a = parseCoord(latText, 90)
    const b = parseCoord(lonText, 180)
    return a === null || b === null ? null : { lat: a, lon: b }
  }, [latText, lonText])

  const live = useRef(point)
  useEffect(() => {
    live.current = point
  })

  const reproject = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      const map = mapRef.current
      const p = live.current
      setPin(map === null || p === null ? null : map.project([p.lon, p.lat]))
    })
  }, [])

  const setFrom = useCallback((lng: number, latitude: number) => {
    setLatText(fixed(latitude))
    setLonText(fixed(lng))
  }, [])

  useEffect(() => {
    const box = boxRef.current
    if (box === null) return
    let cancelled = false
    let map: MapLike | null = null
    let tileOk = false
    let tileErrors = 0
    const start = live.current
    loadMapLibre()
      .then((engine) => {
        if (cancelled) return
        try {
          map = createRealMap(engine, box, settings, {
            center: start === null ? undefined : [start.lon, start.lat],
            zoom: 15,
            locale,
          })
        } catch {
          setState('failed')
          return
        }
        mapRef.current = map
        const m = map
        m.on('load', () => {
          if (!cancelled) setState('ready')
          reproject()
        })
        m.on('move', reproject)
        m.on('resize', reproject)
        m.on('data', (event) => {
          const e = event as { dataType?: string; tile?: unknown } | undefined
          if (e?.dataType === 'source' && e.tile !== undefined) tileOk = true
        })
        m.on('error', (event) => {
          const e = event as { tile?: unknown; sourceId?: string } | undefined
          if (e && (e.tile !== undefined || e.sourceId !== undefined)) tileErrors += 1
          if (!cancelled && tileErrors > 2 && !tileOk) setState('failed')
        })
        m.on('click', (event) => {
          if (dragRef.current) return
          const e = event as { lngLat?: { lng: number; lat: number } } | undefined
          if (e?.lngLat) setFrom(e.lngLat.lng, e.lngLat.lat)
        })
      })
      .catch(() => {
        if (!cancelled) setState('failed')
      })
    return () => {
      cancelled = true
      cancelAnimationFrame(frameRef.current)
      map?.remove()
      mapRef.current = null
    }
  }, [settings, reproject, setFrom, locale])

  // Typed coordinates move the pin.
  useEffect(() => {
    reproject()
  }, [point, reproject])

  const onPinDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = true
  }
  const onPinMove = (event: PointerEvent<HTMLSpanElement>) => {
    const map = mapRef.current
    const box = boxRef.current
    if (!dragRef.current || map === null || box === null) return
    const r = box.getBoundingClientRect()
    const ll = map.unproject([event.clientX - r.left, event.clientY - r.top])
    setFrom(ll.lng, ll.lat)
  }
  const onPinUp = () => {
    // Let the map's click (fired after pointerup) see the drag first.
    window.setTimeout(() => {
      dragRef.current = false
    }, 0)
  }

  const centre = () => {
    const map = mapRef.current
    if (map === null || point === null) return
    map.flyTo({ center: [point.lon, point.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 })
  }

  const outside = point !== null && !isInBali(point)

  return (
    <div className="a-coord">
      <div className="a-row">
        <div className="a-field">
          <label htmlFor="lat">
            {t('places.latitude')}
            <span className="a-req" aria-hidden="true">
              *
            </span>
          </label>
          <input
            className="a-input"
            id="lat"
            name="lat"
            dir="ltr"
            inputMode="decimal"
            required
            value={latText}
            onChange={(event) => setLatText(event.target.value)}
          />
          <span className="a-hint">{t('places.latitude_hint')}</span>
        </div>
        <div className="a-field">
          <label htmlFor="lon">
            {t('places.longitude')}
            <span className="a-req" aria-hidden="true">
              *
            </span>
          </label>
          <input
            className="a-input"
            id="lon"
            name="lon"
            dir="ltr"
            inputMode="decimal"
            required
            value={lonText}
            onChange={(event) => setLonText(event.target.value)}
          />
          <span className="a-hint">{t('places.longitude_hint')}</span>
        </div>
      </div>

      <div className="a-coord-map" dir="ltr">
        <div
          ref={boxRef}
          className="a-coord-canvas"
          role="img"
          aria-label={t('places.pick_label')}
        />
        {pin !== null && state === 'ready' && (
          <span
            className="a-coord-pin"
            style={{ transform: `translate(${pin.x}px, ${pin.y}px)` }}
            aria-hidden="true"
            onPointerDown={onPinDown}
            onPointerMove={onPinMove}
            onPointerUp={onPinUp}
            onPointerCancel={onPinUp}
          >
            <i />
          </span>
        )}
        {state === 'loading' && <p className="a-coord-state">{t('places.pick_loading')}</p>}
        {state === 'failed' && <p className="a-coord-state">{t('places.pick_failed')}</p>}
        {state === 'ready' && (
          <p className="a-coord-attrib" lang="en">
            {attributionsFor(settings).join(' · ')}
          </p>
        )}
      </div>
      <div className="a-coord-foot">
        <span className="a-hint">
          {point === null ? t('places.pick_none') : t('places.pick_hint')}
        </span>
        {outside ? (
          <span className="a-hint a-coord-warn" role="status">
            {t('places.pick_outside')}
          </span>
        ) : null}
        <button
          type="button"
          className="a-btn ghost small"
          onClick={centre}
          disabled={point === null || state !== 'ready'}
        >
          {t('places.pick_center')}
        </button>
      </div>
    </div>
  )
}
