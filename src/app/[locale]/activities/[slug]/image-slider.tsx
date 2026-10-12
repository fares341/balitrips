'use client'

/**
 * Cross-fading gallery slider.
 *
 * Ported from `Slider` in design/handoff/sections-bt/page-activities.jsx:
 * stacked images cross-fading over 0.4s, two 44px circular controls pinned to
 * the inline edges, and a dot rail whose active dot widens to 22px. All of
 * that geometry already lives in components.css (`.bt-slider*`).
 *
 * What the handoff did not have:
 *
 *  - **Direction-correct chevrons.** It drew the "previous" arrow with a hard
 *    `transform: rotate(180deg)` and left it there under `dir="rtl"`, where
 *    the control sits on the *right* and the arrow then pointed back into the
 *    frame. The rotation is composed with the stylesheet's `.flip` rule, so
 *    the glyph points outward in both directions.
 *  - **Any accessible name.** The dots were `aria-label={"slide " + (k+1)}` —
 *    hard-coded English in all three locales. They are numbered with the
 *    locale's own digits and carry `aria-current` instead.
 *  - **Hidden slides that stay hidden.** Faded-out images were still exposed
 *    to assistive tech, so a four-image gallery announced four alt texts at
 *    once.
 */

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { Icon, Photo } from '@/components/ui'

export type SliderImage = {
  id: string
  url: string
  alt: string
}

export type ImageSliderProps = {
  images: SliderImage[]
  /** Alt text for the empty state, normally the activity name. */
  fallbackAlt: string
}

export function ImageSlider({ images, fallbackAlt }: ImageSliderProps) {
  const t = useTranslations()
  const format = useFormatter()
  const [index, setIndex] = useState(0)

  const count = images.length

  if (count === 0) {
    return (
      <div className="bt-slider">
        <Photo src={null} alt={fallbackAlt} />
      </div>
    )
  }

  // Guards a stale index if the gallery ever shrinks under the component.
  const active = Math.min(index, count - 1)
  const step = (delta: number) => setIndex((current) => (current + delta + count) % count)

  return (
    <div className="bt-slider">
      {images.map((image, position) => (
        <div
          key={image.id}
          aria-hidden={position !== active}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Photo
            src={image.url}
            alt={image.alt}
            // Only the first frame is worth preloading; the rest are behind it.
            priority={position === 0}
            style={{
              width: '100%',
              height: '100%',
              opacity: position === active ? 1 : 0,
              transition: 'opacity .4s',
            }}
          />
        </div>
      ))}

      {count > 1 && (
        <>
          <button
            type="button"
            className="bt-slider-nav start"
            onClick={() => step(-1)}
            aria-label={t('c_prev')}
          >
            {/*
              rotate(180deg) turns the base "points right" chevron into "points
              left"; `.flip` mirrors it again under RTL, where this control is
              on the right and must point right.
            */}
            <span style={{ display: 'flex', transform: 'rotate(180deg)' }}>
              <Icon name="chevronr" size={22} color="#fff" className="flip" />
            </span>
          </button>

          <button
            type="button"
            className="bt-slider-nav end"
            onClick={() => step(1)}
            aria-label={t('c_next')}
          >
            <Icon name="chevronr" size={22} color="#fff" className="flip" />
          </button>

          <div className="bt-slider-dots">
            {images.map((image, position) => (
              <button
                key={image.id}
                type="button"
                className={position === active ? 'on' : undefined}
                onClick={() => setIndex(position)}
                aria-label={format.number(position + 1)}
                aria-current={position === active ? 'true' : undefined}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
