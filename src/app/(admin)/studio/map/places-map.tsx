'use client'

/**
 * Studio → Map: every place on the real map — drafts, hidden and locked ones
 * included (this is the dashboard, not the paywalled public payload). Each
 * pin is a link to the place's edit page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { attributionsFor, type MapSettings } from '@/app/[locale]/map/map-style'
import { loadMapLibre, type MapLike } from '@/app/[locale]/map/maplibre-loader'
import { createRealMap } from '@/app/[locale]/map/real-map'

import { useAdminT } from '../../_ui/i18n-provider'

export type PinKind = 'free' | 'locked' | 'draft' | 'hidden'

const PIN_KINDS: readonly PinKind[] = ['free', 'locked', 'draft', 'hidden']

export interface StudioPin {
  id: string
  name: string
  lat: number
  lon: number
  kind: PinKind
  /** e.g. `map_access` / `vip` for a locked place. */
  note: string | null
  href: string
}

export function PlacesMap({
  pins,
  settings,
  focusId,
}: {
  pins: StudioPin[]
  settings: MapSettings
  focusId: string | null
}) {
  const { t, locale } = useAdminT()
  const [shown, setShown] = useState<Record<PinKind, boolean>>({
    free: true,
    locked: true,
    draft: true,
    hidden: true,
  })
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [screen, setScreen] = useState<{ id: string; x: number; y: number }[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLike | null>(null)
  const frameRef = useRef(0)

  const visible = useMemo(() => pins.filter((pin) => shown[pin.kind]), [pins, shown])
  const live = useRef(visible)
  useEffect(() => {
    live.current = visible
  })

  const counts = useMemo(() => {
    const out: Record<PinKind, number> = { free: 0, locked: 0, draft: 0, hidden: 0 }
    for (const pin of pins) out[pin.kind] += 1
    return out
  }, [pins])

  const measure = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      const map = mapRef.current
      const box = boxRef.current
      if (map === null || box === null) return
      const W = box.clientWidth
      const H = box.clientHeight
      const out: { id: string; x: number; y: number }[] = []
      for (const pin of live.current) {
        const p = map.project([pin.lon, pin.lat])
        if (p.x > -30 && p.y > -30 && p.x < W + 30 && p.y < H + 30) out.push({ id: pin.id, ...p })
      }
      setScreen(out)
    })
  }, [])

  const focus = useMemo(() => pins.find((pin) => pin.id === focusId) ?? null, [pins, focusId])

  useEffect(() => {
    const box = boxRef.current
    if (box === null) return
    let cancelled = false
    let map: MapLike | null = null
    let tileOk = false
    let tileErrors = 0
    loadMapLibre()
      .then((engine) => {
        if (cancelled) return
        try {
          map = createRealMap(engine, box, settings, {
            center: focus === null ? undefined : [focus.lon, focus.lat],
            zoom: 14,
            locale,
          })
        } catch {
          setState('failed')
          return
        }
        mapRef.current = map
        map.on('load', () => {
          if (!cancelled) setState('ready')
          measure()
        })
        map.on('move', measure)
        map.on('resize', measure)
        map.on('data', (event) => {
          const e = event as { dataType?: string; tile?: unknown } | undefined
          if (e?.dataType === 'source' && e.tile !== undefined) tileOk = true
        })
        map.on('error', (event) => {
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
      cancelAnimationFrame(frameRef.current)
      map?.remove()
      mapRef.current = null
    }
  }, [settings, focus, measure, locale])

  // Legend toggles: re-place the pins.
  useEffect(() => {
    measure()
  }, [visible, measure])

  const byId = useMemo(() => new Map(pins.map((pin) => [pin.id, pin])), [pins])

  return (
    <div className="a-card a-pmap">
      <div className="a-pmap-legend" role="group" aria-label={t('map.legend')}>
        {PIN_KINDS.map((kind) => (
          <label key={kind} className={`a-check a-pmap-key is-${kind}`}>
            <input
              type="checkbox"
              checked={shown[kind]}
              onChange={(event) => setShown((s) => ({ ...s, [kind]: event.target.checked }))}
            />
            <i aria-hidden="true" />
            {t(`map.legend_${kind}`)} <span dir="ltr">({counts[kind]})</span>
          </label>
        ))}
        <span className="a-hint">
          {t('map.count', { shown: visible.length, total: pins.length })}
        </span>
      </div>
      <div className="a-pmap-box" dir="ltr">
        <div ref={boxRef} className="a-pmap-canvas" />
        {state === 'ready' &&
          screen.map((s) => {
            const pin = byId.get(s.id)
            if (pin === undefined) return null
            return (
              <a
                key={s.id}
                href={pin.href}
                className={`a-pmap-pin is-${pin.kind}${pin.id === focusId ? ' is-focus' : ''}`}
                style={{ transform: `translate(${s.x}px, ${s.y}px)` }}
                aria-label={`${pin.name} — ${t(`map.legend_${pin.kind}`)} — ${t('map.edit')}`}
              >
                <i aria-hidden="true" />
                <span>
                  <b>{pin.name}</b>
                  <small>
                    {t(`map.legend_${pin.kind}`)}
                    {pin.note ? ` · ${pin.note}` : ''}
                  </small>
                </span>
              </a>
            )
          })}
        {state === 'loading' && <p className="a-coord-state">{t('map.loading')}</p>}
        {state === 'failed' && <p className="a-coord-state">{t('map.failed')}</p>}
        {state === 'ready' && (
          <p className="a-coord-attrib" lang="en">
            {attributionsFor(settings).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
