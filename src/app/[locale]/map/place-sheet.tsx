'use client'

/**
 * The place sheet on the map (map v3 sheet, owner Nov 2026). Opening a place
 * no longer leaves /map: the sheet shows it over the map.
 *
 *   phone  — a bottom sheet with three stops (peek = the card, half ≈ 55% of
 *            the viewport with the map still visible, full), dragged by touch
 *            or mouse with velocity snapping. The content scrolls only when
 *            full; below that a drag anywhere moves the sheet.
 *   ≥1024  — a side panel at the inline start (the right in Arabic).
 *
 * The state lives in the explorer (`sheet-state.ts`); this component renders
 * a stop and reports drags. Details (full text, gallery, hours) come from
 * `/api/map/places/[slug]`, which applies the same lock rule as the list.
 */

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { useTranslations } from 'next-intl'

import { Icon, Photo, SafeImg } from '@/components/ui'
import { Link } from '@/i18n/routing'
import type { ResultPlace } from '@/lib/map/explore'
import { scrollsInside, snapAfterDrag, stopOffsets, type SheetStop } from '@/lib/map/sheet-state'

import { FavoriteHeart } from './place-actions'
import { PinGlyph } from './pin-glyph'

export interface NearbyItem {
  place: ResultPlace
  distance: string
}

interface Detail {
  description: string | null
  images: string[]
  hours: string | null
}

/** Only our own media paths and plain https URLs go into a CSS `url()`. */
function cssUrlSafe(url: string): boolean {
  return /^(\/|https:\/\/)[^"'()\\\s]+$/.test(url)
}

/** Details per slug for this page's life (a re-open does not refetch). */
const detailCache = new Map<string, Detail>()

export function PlaceSheet({
  place,
  stop,
  desktop,
  locale,
  categoryLabel,
  distance,
  nearby,
  onSnap,
  onClose,
  onOpen,
}: {
  place: ResultPlace | null
  stop: SheetStop
  desktop: boolean
  locale: string
  categoryLabel: string
  /** «3.2 km away» — null when there is no real origin. */
  distance: string | null
  nearby: NearbyItem[]
  onSnap: (stop: SheetStop) => void
  onClose: () => void
  onOpen: (id: string) => void
}) {
  const t = useTranslations()
  const sheet = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState(800)
  const open = stop !== 'closed' && place !== null

  // The last place stays rendered while the sheet slides away.
  const [shown, setShown] = useState<ResultPlace | null>(place)
  if (place !== null && place !== shown) setShown(place)

  useLayoutEffect(() => {
    const measure = () => setViewport(window.innerHeight)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const offsets = stopOffsets(viewport)
  const y = desktop ? 0 : offsets[stop]

  // New place: back to the top.
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0
  }, [shown?.id])

  // Escape closes.
  const closeRef = useRef(onClose)
  useLayoutEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // ---- details ----------------------------------------------------------------
  const slug = shown?.slug ?? null
  const [detail, setDetail] = useState<{ slug: string; data: Detail } | null>(null)
  useEffect(() => {
    if (slug === null) return
    const cached = detailCache.get(slug)
    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cache hit
      setDetail({ slug, data: cached })
      return
    }
    const controller = new AbortController()
    void fetch(`/api/map/places/${encodeURIComponent(slug)}?locale=${locale}`, {
      signal: controller.signal,
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) return
        const data = (await response.json()) as Detail
        detailCache.set(slug, data)
        setDetail({ slug, data })
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [slug, locale])
  const info = detail !== null && detail.slug === slug ? detail.data : null

  // ---- drag -------------------------------------------------------------------
  const drag = useRef<{
    id: number
    startY: number
    lastY: number
    lastT: number
    v: number
    moved: boolean
    from: SheetStop
    inBody: boolean
  } | null>(null)

  const setTransform = (px: number | null) => {
    const el = sheet.current
    if (!el) return
    if (px === null) {
      el.style.removeProperty('transform')
      el.classList.remove('is-dragging')
    } else {
      el.style.transform = `translateY(${Math.max(0, px)}px)`
      el.classList.add('is-dragging')
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (desktop || !open || event.button > 0) return
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, [data-no-drag]')) return
    // Full: the content scrolls; only the handle (or a pull at the top) drags.
    if (scrollsInside(stop) && body.current?.contains(target) && body.current.scrollTop > 0) return
    drag.current = {
      id: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: performance.now(),
      v: 0,
      moved: false,
      from: stop,
      inBody: body.current?.contains(target) ?? false,
    }
    // Moves keep coming here even when the pointer leaves the sheet (mouse).
    sheet.current?.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    const dy = event.clientY - d.startY
    if (!d.moved) {
      if (Math.abs(dy) < 6) return
      // Pulling up inside a full sheet is a scroll, not a drag.
      if (scrollsInside(d.from) && dy < 0 && d.inBody) {
        drag.current = null
        sheet.current?.releasePointerCapture?.(event.pointerId)
        return
      }
      d.moved = true
    }
    const now = performance.now()
    d.v = (event.clientY - d.lastY) / Math.max(1, now - d.lastT)
    d.lastY = event.clientY
    d.lastT = now
    setTransform(offsets[d.from] + dy)
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== event.pointerId) return
    setTransform(null)
    if (!d.moved) {
      // A tap on the card grows it to half.
      if (stop === 'peek') onSnap('half')
      return
    }
    const next = snapAfterDrag(d.from, offsets[d.from] + (event.clientY - d.startY), d.v, offsets)
    if (next === 'closed') onClose()
    else onSnap(next)
  }

  const onPointerCancel = () => {
    drag.current = null
    setTransform(null)
  }

  // ---- share ------------------------------------------------------------------
  const [copied, setCopied] = useState(false)
  const share = async () => {
    if (!shown) return
    const url = `${window.location.origin}${window.location.pathname}?place=${encodeURIComponent(shown.slug)}`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shown.name, url })
        return
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2400)
    } catch {
      window.prompt(t('mx4_share'), url)
    }
  }

  // Photos that failed to load (every fallback tried): their slot is removed,
  // and with none left the gallery is not rendered at all.
  const [broken, setBroken] = useState<readonly string[]>([])
  const markBroken = (src: string) =>
    setBroken((prev) => (prev.includes(src) ? prev : [...prev, src]))

  if (shown === null) return null
  const p = shown
  const images = (
    info?.images.length ? info.images : p.images.length ? p.images : p.thumb ? [p.thumb] : []
  ).filter((src) => !broken.includes(src))
  const description = info?.description ?? p.desc
  // An activity marker uses the activity's own map link; others route to the pin.
  const directions =
    p.mapUrl ?? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`

  return (
    <div
      ref={sheet}
      className="mx4-sheet"
      data-stop={open ? stop : 'closed'}
      data-desktop={desktop || undefined}
      style={
        desktop
          ? undefined
          : { height: offsets.closed, transform: `translateY(${open ? y : offsets.closed}px)` }
      }
      role="dialog"
      aria-modal="false"
      aria-label={p.name}
      aria-hidden={!open || undefined}
      inert={!open || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className="mx4-grab" aria-hidden="true">
        <i />
      </div>
      <button type="button" className="mx4-x" aria-label={t('c_close')} onClick={onClose}>
        <Icon name="cross" size={18} />
      </button>
      <div
        ref={body}
        className="mx4-body"
        data-scroll={scrollsInside(stop) || desktop || undefined}
      >
        <header className="mx4-peek">
          <span className="mx4-peek-img">
            <SafeImg
              src={p.thumb}
              deferGoogle
              alt=""
              loading="lazy"
              decoding="async"
              fallback={<PinGlyph categoryKey={p.categoryKey} size={40} />}
            />
          </span>
          <div className="mx4-peek-text">
            <h2 className="mx4-name">{p.name}</h2>
            <p className="mx4-meta">
              <PinGlyph categoryKey={p.categoryKey} size={18} />
              <span>{categoryLabel}</span>
              {p.rating !== null && (
                <span aria-label={t('mx3_rating', { r: p.rating.toFixed(1) })}>
                  <span className="mx3-star" aria-hidden="true">
                    ★
                  </span>{' '}
                  <b dir="ltr">{p.rating.toFixed(1)}</b>
                </span>
              )}
              {p.area && <span>{p.area}</span>}
            </p>
            {distance && (
              <p className="mx4-dist" data-distance>
                <Icon name="pin" size={13} />
                {distance}
              </p>
            )}
          </div>
        </header>

        {/* Actions first: at the half stop «Directions» is always on screen,
            whatever the photo's height. */}
        <div className="mx4-actions">
          <a
            className="mx4-btn is-primary"
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="map" size={16} />
            {t('mx4_directions')}
          </a>
          {p.activitySlug && (
            <Link className="mx4-btn" href={`/activities/${p.activitySlug}`}>
              <Icon name="bolt" size={16} />
              {t('mx4_details')}
            </Link>
          )}
          {p.canFavorite && (
            <span className="mx4-btn is-heart">
              <FavoriteHeart placeId={p.id} active={open} />
            </span>
          )}
          <button type="button" className="mx4-btn" onClick={() => void share()}>
            <Icon name="share" size={16} />
            {copied ? t('mx4_copied') : t('mx4_share')}
          </button>
        </div>

        {images.length > 0 && (
          <div className="mx4-gallery" data-no-drag aria-roledescription="carousel">
            {images.map((src, i) => (
              <figure
                key={src}
                className="mx4-shot"
                aria-label={t('mx4_photo', { i: i + 1, n: images.length })}
                // The card's small photo is already loaded: it fills the slot
                // until the large one arrives, so the slot is never empty.
                style={
                  i === 0 && p.thumb && cssUrlSafe(p.thumb)
                    ? { backgroundImage: `url("${p.thumb}")` }
                    : undefined
                }
              >
                <Photo
                  src={src}
                  alt={images.length > 1 ? `${p.name} — ${i + 1}` : p.name}
                  sizes="(min-width: 1024px) 360px, 80vw"
                  // Lazy loading inside this horizontal strip can leave the
                  // visible photo unloaded (WebKit): the two in view load now.
                  loading={i < 2 ? 'eager' : 'lazy'}
                  onUnavailable={() => markBroken(src)}
                />
              </figure>
            ))}
          </div>
        )}

        {description && (
          <section className="mx4-sec">
            <h3>{t('mx4_about')}</h3>
            <p className="mx4-desc">{description}</p>
          </section>
        )}

        {info?.hours && (
          <section className="mx4-sec" data-hours>
            <h3>{t('mx4_hours')}</h3>
            <p dir="auto">{info.hours}</p>
          </section>
        )}

        {nearby.length > 0 && (
          <section className="mx4-sec">
            <h3>{t('mx4_nearby')}</h3>
            <ul className="mx4-near" data-no-drag>
              {nearby.map(({ place: one, distance: d }) => (
                <li key={one.id}>
                  <button type="button" onClick={() => onOpen(one.id)} data-near={one.slug}>
                    <span className="mx4-near-img">
                      <SafeImg
                        src={one.thumb}
                        deferGoogle
                        alt=""
                        loading="lazy"
                        decoding="async"
                        fallback={<PinGlyph categoryKey={one.categoryKey} size={32} />}
                      />
                    </span>
                    <b>{one.name}</b>
                    <small>{d}</small>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link href={`/places/${p.slug}`} className="mx4-full">
          {t('mx4_full_page')}
          <Icon name="chevronr" size={16} className="flip" />
        </Link>
      </div>
    </div>
  )
}
