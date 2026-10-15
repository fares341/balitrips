'use client'

/**
 * The place page's location preview: a small, non-interactive real map
 * (the same 3D map as /map) at the place's exact coordinates, tilted, with a
 * pin — the whole box links to the place on the full map. Loaded only when
 * it scrolls into view. If MapLibre, WebGL or the tiles fail, the
 * illustrated artwork stands in (approximate, it is an overview).
 */

import { useEffect, useRef, useState } from 'react'
import { useLocale } from 'next-intl'

import { Link } from '@/i18n/routing'

import { ART_H, ART_SMALL_URL, ART_W, geoToArt } from './art-warp'
import { attributionsFor, type MapSettings } from './map-style'
import { loadMapLibre, type MapLike } from './maplibre-loader'
import { createRealMap } from './real-map'

export function PlaceMiniMap({
  lat,
  lon,
  slug,
  label,
  settings,
}: {
  lat: number
  lon: number
  slug: string
  /** Accessible name of the link ("Open this place on the map"). */
  label: string
  settings: MapSettings
}) {
  const locale = useLocale()
  const boxRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'idle' | 'ready' | 'failed'>('idle')

  useEffect(() => {
    const box = boxRef.current
    if (box === null) return
    let cancelled = false
    let map: MapLike | null = null
    let ro: ResizeObserver | null = null
    let tileOk = false
    let tileErrors = 0
    const start = () => {
      loadMapLibre()
        .then((engine) => {
          if (cancelled) return
          try {
            map = createRealMap(engine, box, settings, {
              center: [lon, lat],
              zoom: 15.4,
              pitch: Math.min(55, settings.tiltOnEnter || 50),
              bearing: -12,
              locale,
              interactive: false,
            })
          } catch {
            setState('failed')
            return
          }
          const m = map
          // The box can still change size after the map is made (fonts,
          // images above it): keep the canvas filling it.
          if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => m.resize())
            ro.observe(box)
          }
          m.on('load', () => {
            m.resize()
            if (!cancelled) setState('ready')
          })
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
    }
    // Lazy: only once the preview is (nearly) on screen.
    let io: IntersectionObserver | null = null
    if (typeof IntersectionObserver === 'undefined') start()
    else {
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            io?.disconnect()
            start()
          }
        },
        { rootMargin: '200px' },
      )
      io.observe(box)
    }
    return () => {
      cancelled = true
      io?.disconnect()
      ro?.disconnect()
      map?.remove()
    }
  }, [lat, lon, settings, locale])

  const [ax, ay] = geoToArt(lon, lat)
  const fx = (Math.max(0, Math.min(ART_W, ax)) / ART_W) * 100
  const fy = (Math.max(0, Math.min(ART_H, ay)) / ART_H) * 100

  return (
    <Link
      href={`/map?place=${encodeURIComponent(slug)}`}
      className={`pl-mini is-${state}`}
      aria-label={label}
    >
      <div ref={boxRef} className="pl-mini-map" dir="ltr" aria-hidden="true" />
      {state === 'failed' && (
        // eslint-disable-next-line @next/next/no-img-element -- fixed brand artwork, positioned by CSS
        <img
          src={ART_SMALL_URL}
          alt=""
          className="pl-mini-art"
          style={{ transform: `translate(-${fx.toFixed(2)}%, -${fy.toFixed(2)}%)` }}
        />
      )}
      <i aria-hidden="true" />
      {state === 'ready' && (
        <span className="pl-mini-attrib" lang="en" dir="ltr">
          {attributionsFor(settings).join(' · ')}
        </span>
      )}
    </Link>
  )
}
