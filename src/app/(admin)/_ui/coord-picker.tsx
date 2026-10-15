'use client'

/**
 * Studio → place editor: where the place is, made hard to get wrong.
 *
 *  - Paste a Google Maps link (or "lat, lng") → the coordinates are read
 *    out of it (`parseCoordinateText`: the dropped pin, the map centre, a
 *    ?q= query or a plain pair).
 *  - Or search by name / address (Photon by komoot, OpenStreetMap data,
 *    limited to Bali; debounced, one request per pause in typing, cancelled
 *    when superseded, cached — Photon's fair-use terms).
 *  - Or click the map / drag the pin: the SAME real 3D map the public site
 *    uses, opened at street level.
 *  - The two numeric fields stay the source of truth (they are what the form
 *    posts) and can still be typed into — the pin follows them.
 *  - Checks (warnings, never blockers): outside Bali, in the sea or a lake
 *    (the map's rendered water at the pin), another place within 50 m.
 *  - "Open in Google Maps" to cross-check against the operator's own source.
 *
 * Without the map (CDN or tiles unreachable, no WebGL) the fields, the
 * paste box and the search still work and a note says so.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type PointerEvent,
} from 'react'

import { attributionsFor, type MapSettings } from '@/app/[locale]/map/map-style'
import { loadMapLibre, type MapLike } from '@/app/[locale]/map/maplibre-loader'
import { createRealMap } from '@/app/[locale]/map/real-map'
import { haversineKm, isInBali } from '@/lib/geo'
import { parseCoordinateText, type ParsedCoords } from '@/lib/geo/parse-coords'

import { useAdminT } from './i18n-provider'

function parseCoord(text: string, limit: number): number | null {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null
}

const fixed = (value: number) => value.toFixed(6)

/** Street level, tilted: how a visitor sees the spot on the real map. */
const STREET_ZOOM = 17
const STREET_PITCH = 45
/** Water layers of the public style (map-style.ts). */
const WATER_LAYERS = ['water', 'water-inland']
/** Two places closer than this are probably the same place. */
const DUPLICATE_M = 50

/** Photon (komoot) — free OSM geocoder built for search-as-you-type. */
const PHOTON = 'https://photon.komoot.io/api/'
/** Bali, with the Nusa islands (minLon, minLat, maxLon, maxLat). */
const BALI_BBOX = '114.40,-8.95,115.75,-8.00'

export interface NearbyPlace {
  id: string
  name: string
  lat: number
  lon: number
  href: string
}

interface SearchHit {
  key: string
  name: string
  detail: string
  lat: number
  lon: number
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, string | number | undefined>
}

function hitsFrom(data: unknown): SearchHit[] {
  const features = (data as { features?: PhotonFeature[] } | null)?.features ?? []
  const out: SearchHit[] = []
  for (const [index, f] of features.entries()) {
    const c = f.geometry?.coordinates
    const p = f.properties ?? {}
    if (!c) continue
    const name = String(p.name ?? p.street ?? '')
    const detail = [p.street && p.name ? p.street : null, p.district, p.city, p.county]
      .filter((part): part is string | number => !!part)
      .map(String)
      .filter((part, i, all) => all.indexOf(part) === i && part !== name)
      .join(', ')
    out.push({ key: `${p.osm_type ?? ''}${p.osm_id ?? index}`, name, detail, lat: c[1], lon: c[0] })
  }
  return out
}

export function CoordPicker({
  lat,
  lon,
  settings,
  others = [],
}: {
  lat: string
  lon: string
  settings: MapSettings
  /** Every other (non-archived) place — for the duplicate check. */
  others?: NearbyPlace[]
}) {
  const { t, locale } = useAdminT()
  const [latText, setLatText] = useState(lat)
  const [lonText, setLonText] = useState(lon)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null)
  const [inWater, setInWater] = useState(false)
  const [paste, setPaste] = useState('')
  const [pasteResult, setPasteResult] = useState<ParsedCoords | 'none' | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [search, setSearch] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLike | null>(null)
  const dragRef = useRef(false)
  const frameRef = useRef(0)
  const cache = useRef(new Map<string, SearchHit[]>())

  const point = useMemo(() => {
    const a = parseCoord(latText, 90)
    const b = parseCoord(lonText, 180)
    return a === null || b === null ? null : { lat: a, lon: b }
  }, [latText, lonText])

  const live = useRef(point)
  useEffect(() => {
    live.current = point
  })

  /** Pin position + "is it in water" — read from what the map actually draws. */
  const reproject = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      const map = mapRef.current
      const p = live.current
      if (map === null || p === null) {
        setPin(null)
        setInWater(false)
        return
      }
      const at = map.project([p.lon, p.lat])
      setPin(at)
      const layers = WATER_LAYERS.filter((id) => map.getLayer(id))
      const found =
        layers.length > 0 ? (map.queryRenderedFeatures?.([at.x, at.y], { layers }) ?? []) : []
      setInWater(found.length > 0)
    })
  }, [])

  const setFrom = useCallback((lng: number, latitude: number) => {
    setLatText(fixed(latitude))
    setLonText(fixed(lng))
  }, [])

  /** Go there on the map, at street level. */
  const flyTo = useCallback((lng: number, latitude: number) => {
    const map = mapRef.current
    if (map === null) return
    map.flyTo({
      center: [lng, latitude],
      zoom: Math.max(map.getZoom(), STREET_ZOOM),
      pitch: STREET_PITCH,
      duration: 900,
    })
  }, [])

  const place = useCallback(
    (lng: number, latitude: number) => {
      setFrom(lng, latitude)
      flyTo(lng, latitude)
    },
    [setFrom, flyTo],
  )

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
            zoom: STREET_ZOOM,
            pitch: start === null ? 0 : STREET_PITCH,
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
        m.on('idle', reproject)
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

  // Place search: one request per pause in typing, the previous one cancelled.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const known = cache.current.get(q)
      if (known) {
        setHits(known)
        setSearch('done')
        return
      }
      setSearch('busy')
      const url = `${PHOTON}?q=${encodeURIComponent(q)}&limit=6&bbox=${BALI_BBOX}&lat=-8.45&lon=115.2${
        locale === 'en' ? '&lang=en' : ''
      }`
      fetch(url, { signal: controller.signal, referrerPolicy: 'strict-origin-when-cross-origin' })
        .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
        .then((data: unknown) => {
          const found = hitsFrom(data)
          cache.current.set(q, found)
          setHits(found)
          setSearch('done')
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearch('error')
        })
    }, 650)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, locale])

  const readPaste = (text: string) => {
    const parsed = parseCoordinateText(text)
    setPasteResult(parsed ?? 'none')
    if (parsed) place(parsed.lon, parsed.lat)
  }

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

  const outside = point !== null && !isInBali(point)
  const duplicates =
    point === null ? [] : others.filter((other) => haversineKm(point, other) * 1000 < DUPLICATE_M)
  const gmaps =
    point === null
      ? null
      : `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lon}`

  return (
    <div className="a-coord">
      <div className="a-row">
        <div className="a-field">
          <label htmlFor="coord-paste">{t('places.pick_paste_label')}</label>
          <div className="a-coord-inline">
            <input
              className="a-input"
              id="coord-paste"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://www.google.com/maps/…  ·  -8.5069, 115.2625"
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
                const text = event.clipboardData.getData('text')
                if (text) window.setTimeout(() => readPaste(text), 0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  readPaste(paste)
                }
              }}
            />
            <button type="button" className="a-btn ghost" onClick={() => readPaste(paste)}>
              {t('places.pick_paste_btn')}
            </button>
          </div>
          {pasteResult === 'none' ? (
            <span className="a-hint a-coord-warn" role="status">
              {t('places.pick_paste_err')}
            </span>
          ) : pasteResult !== null ? (
            <span className="a-hint a-good" role="status">
              {t('places.pick_paste_ok', { source: t(`places.pick_src_${pasteResult.source}`) })}
            </span>
          ) : (
            <span className="a-hint">{t('places.pick_paste_hint')}</span>
          )}
        </div>
        <div className="a-field a-coord-search">
          <label htmlFor="coord-search">{t('places.pick_search_label')}</label>
          <input
            className="a-input"
            id="coord-search"
            type="search"
            autoComplete="off"
            placeholder={t('places.pick_search_placeholder')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              if (event.target.value.trim().length < 3) {
                setHits([])
                setSearch('idle')
              }
            }}
          />
          {search === 'busy' && <span className="a-hint">{t('places.pick_searching')}</span>}
          {search === 'error' && (
            <span className="a-hint a-coord-warn">{t('places.pick_search_err')}</span>
          )}
          {search === 'done' && hits.length === 0 && (
            <span className="a-hint">{t('places.pick_search_none')}</span>
          )}
          {hits.length > 0 && (
            <ul className="a-coord-hits">
              {hits.map((hit) => (
                <li key={hit.key}>
                  <button
                    type="button"
                    onClick={() => {
                      place(hit.lon, hit.lat)
                      setHits([])
                      setSearch('idle')
                    }}
                  >
                    <b>{hit.name}</b>
                    {hit.detail ? <span>{hit.detail}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <span className="a-hint a-coord-credit" lang="en">
            {t('places.pick_search_credit')}
          </span>
        </div>
      </div>

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
        <div className="a-coord-actions">
          {gmaps !== null && (
            <a className="a-btn ghost small" href={gmaps} target="_blank" rel="noopener noreferrer">
              {t('places.pick_gmaps')}
            </a>
          )}
          <button
            type="button"
            className="a-btn ghost small"
            onClick={() => point && flyTo(point.lon, point.lat)}
            disabled={point === null || state !== 'ready'}
          >
            {t('places.pick_center')}
          </button>
        </div>
      </div>

      {(outside || (inWater && state === 'ready') || duplicates.length > 0) && (
        <ul className="a-coord-warnings" role="status">
          {outside && <li>{t('places.pick_outside')}</li>}
          {inWater && state === 'ready' && <li>{t('places.pick_water')}</li>}
          {duplicates.map((other) => (
            <li key={other.id}>
              {t('places.pick_dupe', { name: other.name })}{' '}
              <a href={other.href}>{t('places.pick_dupe_open')}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
