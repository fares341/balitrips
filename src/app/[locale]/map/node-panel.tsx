'use client'

/**
 * Node detail panel.
 *
 * Ported from `MapNodePanel` in design/handoff/sections-bt/page-map.jsx. The
 * stylesheet already carries the behaviour the design asks for: `.bt-nodepanel`
 * pins to `inset-inline-end` on desktop and, under the 820px breakpoint,
 * re-anchors to the bottom of the frame as a sheet. Nothing here branches on
 * viewport width.
 *
 * Three departures from the handoff:
 *
 *  1. **It only ever receives an unlocked place.** The handoff's panel read
 *     `p.name[lang]`, `p.rating` and `p.flickr` off a record that existed on
 *     the client whether or not the visitor had paid. `MapPin` wraps an
 *     `OpenMapPlace`, so a locked place has no shape that could reach this
 *     component — there is nothing to guard against.
 *  2. **No fabricated gallery.** The handoff built a three-image strip out of
 *     `[p.flickr, "bali,beach", "bali,jungle"]` — two stock searches for
 *     somewhere that is not the place being described. A place row has one hero
 *     image, so the panel shows one hero image.
 *  3. **No local "favourite" / "add to trip" state.** Those were `useState` in
 *     a context provider in the prototype: they survived until reload and
 *     reached no server. Booking lives on the activity page, so the panel links
 *     there instead of pretending to save something.
 */

import { useEffect, useRef } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { LinkButton, Rating, Tag } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import { entityHref } from '@/lib/content/types'

import { PlaceActions } from './place-actions'
import type { MapPin } from './projection'

/** Tags are an editorial list; showing all of them would overflow the panel. */
const MAX_TAGS = 3

export type NodePanelProps = {
  pin: MapPin
  onClose: () => void
}

export function NodePanel({ pin, onClose }: NodePanelProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const format = useFormatter()
  const closeRef = useRef<HTMLButtonElement>(null)

  const { place } = pin
  const name = pick(place.name, locale, place.slug)
  const category = pickOptional(place.category, locale)
  const description = pickOptional(place.description, locale)
  const details = pickOptional(place.detailedDescription, locale)
  const area = [
    pickOptional(place.regionLabel, locale),
    pickOptional(place.parentRegionLabel, locale),
  ]
    .filter((part): part is string => part !== null)
    .join('، ')
  // أسماء الوسوم المترجمة من لوحة التحكم (لا النص الإنجليزي القديم).
  const tags = place.tagList.slice(0, MAX_TAGS).map((tag) => pick(tag.label, locale, tag.key))

  // Move focus into the panel when it opens, and again when the visitor picks
  // a different pin while it is already open. The explorer hands focus back to
  // the pin that opened it on close.
  useEffect(() => {
    closeRef.current?.focus()
  }, [place.id])

  return (
    <div className="bt-nodepanel" role="dialog" aria-label={name}>
      <button
        type="button"
        ref={closeRef}
        className="bt-modal-x"
        onClick={onClose}
        aria-label={t('c_close')}
        style={{ position: 'absolute', top: 12, insetInlineEnd: 12, zIndex: 3 }}
      >
        <Icon name="cross" size={18} />
      </button>

      <div className="bt-nodepanel-hero">
        <Photo
          src={place.heroImageUrl}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </div>

      <div className="bt-nodepanel-body">
        <div className="row" style={{ gap: 8 }}>
          {category !== null && <Tag variant="forest">{category}</Tag>}
          {place.isFree && <Tag variant="palm">{t('mp_free')}</Tag>}
          {place.isHiddenGem && <Tag variant="orange">{t('map_f_gems')}</Tag>}
          {!place.isFree && !place.isHiddenGem && place.requiredEntitlement === 'vip' && (
            <Tag variant="orange">VIP</Tag>
          )}
          {tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>

        <h3 style={{ fontSize: 22, marginTop: 10 }}>{name}</h3>

        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          {place.rating !== null && <Rating value={place.rating} size="sm" />}
          {place.openingHours !== null && (
            <span className="muted" style={{ fontSize: 12.5 }}>
              {t('map_hours')}: {place.openingHours}
            </span>
          )}
        </div>

        {area !== '' && (
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            <Icon name="pin" size={13} /> {area}
          </div>
        )}

        {description !== null && (
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10 }}>
            {description}
          </p>
        )}

        {details !== null && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13.5 }}>
              {t('map_more_details')}
            </summary>
            <p style={{ fontSize: 14, lineHeight: 1.7, marginTop: 8, whiteSpace: 'pre-line' }}>
              {details}
            </p>
          </details>
        )}

        {place.videos.length > 0 && (
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t('map_videos')}</div>
            {place.videos.map((url) => (
              <PlaceVideo key={url} url={url} title={name} />
            ))}
          </div>
        )}

        <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          {/* Coordinates are the record, not decoration — they are what the
              projection above the panel used to place the pin. */}
          {format.number(place.lat, { maximumFractionDigits: 4 })},{' '}
          {format.number(place.lon, { maximumFractionDigits: 4 })}
        </div>

        <PlaceActions
          key={place.id}
          placeId={place.id}
          canFavorite={place.canFavorite}
          canAddToTrip={place.canAddToTrip}
        />

        {place.activitySlug !== null && (
          <LinkButton
            href={entityHref('activity', place.activitySlug)}
            variant="orange"
            size="sm"
            block
            style={{ marginTop: 14 }}
          >
            {t('mp_detail')} <Icon name="arrow" size={15} className="flip" />
          </LinkButton>
        )}
      </div>
    </div>
  )
}

/** YouTube/Vimeo → مشغّل مضمّن بلا كوكيز؛ mp4/webm → <video>. الروابط مُرشَّحة على الخادم. */
function embedUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.hostname === 'youtu.be')
      return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`
    if (url.hostname.endsWith('youtube.com')) {
      const id = url.searchParams.get('v') ?? url.pathname.split('/').pop() ?? ''
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null
    }
    if (url.hostname.endsWith('vimeo.com')) {
      const id = url.pathname.split('/').filter(Boolean).pop() ?? ''
      return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null
    }
  } catch {
    return null
  }
  return null
}

function PlaceVideo({ url, title }: { url: string; title: string }) {
  const embed = embedUrl(url)
  if (embed !== null) {
    return (
      <iframe
        src={embed}
        title={title}
        loading="lazy"
        allow="encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: 10 }}
      />
    )
  }
  return <video src={url} controls preload="metadata" style={{ width: '100%', borderRadius: 10 }} />
}
