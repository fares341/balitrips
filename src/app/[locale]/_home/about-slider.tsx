'use client'

/**
 * "Who we are" image slider — the package's infinite vertical marquee
 * (home.html `.about-media`): two columns, one moving up and one down.
 *
 * The motion is CSS only (bt-home.css `.mq-track`): each track holds its
 * images twice and shifts by half its height, so the loop is seamless. It
 * pauses on hover and with the button (which only toggles a class), and is
 * static under `prefers-reduced-motion`, where the button is hidden.
 */

import { useState } from 'react'

import { Icon } from '@/components/ui'

export type AboutSliderProps = {
  up: readonly string[]
  down: readonly string[]
  pauseLabel: string
  playLabel: string
}

export function AboutSlider({ up, down, pauseLabel, playLabel }: AboutSliderProps) {
  const [paused, setPaused] = useState(false)

  return (
    <div className={paused ? 'about-media paused' : 'about-media'}>
      <Column images={up} direction="up" />
      <Column images={down} direction="down" />
      <button
        type="button"
        className="mq-toggle"
        aria-pressed={paused}
        aria-label={paused ? playLabel : pauseLabel}
        onClick={() => setPaused((value) => !value)}
      >
        <Icon name={paused ? 'play' : 'pause'} size={14} />
      </button>
    </div>
  )
}

function Column({ images, direction }: { images: readonly string[]; direction: 'up' | 'down' }) {
  // Two identical halves; the second is decorative duplication.
  const track = [...images, ...images]
  return (
    <div className={`mq-col ${direction}`} aria-hidden="true">
      <div className="mq-track">
        {track.map((src, index) => (
          // eslint-disable-next-line @next/next/no-img-element -- fixed brand photos in a CSS marquee
          <img key={`${src}-${index}`} src={src} alt="" loading="lazy" decoding="async" />
        ))}
      </div>
    </div>
  )
}
