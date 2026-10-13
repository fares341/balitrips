'use client'

/**
 * Hero video portals — the package's four arched windows (home.html `.arches`).
 *
 * Each arch is a muted, looping video from public/brand (WebM, then MP4) with
 * the matching still as its poster. The videos:
 *  - play only while the arches are on screen (IntersectionObserver);
 *  - stop for everyone with one pause/play button (WCAG 2.2.2);
 *  - never play under `prefers-reduced-motion` — the poster stills stay, and
 *    the button is hidden by CSS because there is nothing to pause.
 *
 * `preload="none"`: nothing is downloaded until the first play, so a visitor
 * who never sees the hero (or prefers reduced motion) pays only for posters.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type Arch = {
  /** Place name shown on the arch (a proper noun, not translated). */
  name: string
  /** Basename in public/brand: `<video>.webm` and `<video>.mp4`. */
  video: string
  poster: string
}

export type HeroArchesProps = {
  arches: readonly Arch[]
  pauseLabel: string
  playLabel: string
}

const REDUCED = '(prefers-reduced-motion: reduce)'

export function HeroArches({ arches, pauseLabel, playLabel }: HeroArchesProps) {
  const [paused, setPaused] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const videosRef = useRef<(HTMLVideoElement | null)[]>([])
  const pausedRef = useRef(false)
  const visibleRef = useRef(false)

  const apply = useCallback(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia(REDUCED).matches
    const run = visibleRef.current && !pausedRef.current && !reduce
    for (const video of videosRef.current) {
      if (video === null) continue
      if (run) {
        const playing = video.play()
        // Autoplay can be refused (data saver, power mode); the poster stays.
        if (playing !== undefined) playing.catch(() => undefined)
      } else {
        video.pause()
      }
    }
  }, [])

  useEffect(() => {
    pausedRef.current = paused
    apply()
  }, [paused, apply])

  useEffect(() => {
    const root = rootRef.current
    if (root === null) return
    if (typeof IntersectionObserver === 'undefined') {
      visibleRef.current = true
      apply()
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry?.isIntersecting ?? false
        apply()
      },
      { threshold: 0.15 },
    )
    observer.observe(root)
    const media = window.matchMedia(REDUCED)
    media.addEventListener('change', apply)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', apply)
    }
  }, [apply])

  return (
    <div className="arches" ref={rootRef}>
      {arches.map((arch, index) => (
        <figure className="arch" key={arch.video} aria-hidden="true">
          <video
            ref={(node) => {
              videosRef.current[index] = node
            }}
            muted
            loop
            playsInline
            preload="none"
            poster={arch.poster}
            tabIndex={-1}
            onLoadedData={(event) => {
              // Offset the loops so the four arches never move in step.
              const video = event.currentTarget
              const duration = Number.isFinite(video.duration) ? video.duration : 11
              if (video.currentTime < 0.1) video.currentTime = (index * 2.7) % duration
            }}
          >
            <source src={`/brand/${arch.video}.webm`} type="video/webm" />
            <source src={`/brand/${arch.video}.mp4`} type="video/mp4" />
          </video>
          <figcaption>{arch.name}</figcaption>
        </figure>
      ))}
      <button
        type="button"
        className="vid-toggle"
        aria-pressed={paused}
        aria-label={paused ? playLabel : pauseLabel}
        onClick={() => setPaused((value) => !value)}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {paused ? (
            <path d="M8 5.5v13l10.5-6.5z" />
          ) : (
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          )}
        </svg>
      </button>
    </div>
  )
}
