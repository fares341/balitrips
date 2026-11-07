'use client'

/**
 * Home hero — v3.4 full-screen video slider (design-reference home.html `.hv`).
 *
 *  - Phones/tablets (< 1000px): ONE full-screen clip at a time, the next one
 *    fading in every 7 s; the progress tabs at the bottom show where we are.
 *  - Desktop (≥ 1000px): the four tall clips side by side across the whole
 *    width; every one plays, the active one is lit and the others a little
 *    darker (CSS). The active one still moves on every 7 s.
 *  - The place pill above the title changes with each clip.
 *
 * Media paths live in `hero-media.ts` only (licence note there).
 *
 * Plays only while the hero is on screen (IntersectionObserver), with the
 * poster first (`preload="none"`: no video bytes until it plays). On phones
 * the clip starts only after the first interaction or once the page has been
 * loaded and idle for ~6 s (never on Save-Data / 2G / 3G), and only the
 * current and next posters are fetched. With
 * `prefers-reduced-motion` nothing plays or rotates: the first poster stays.
 * A pause button stops the videos and the rotation (WCAG 2.2.2); the tabs
 * jump to a clip.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { preload } from 'react-dom'

import { HERO_STEP_MS } from './hero-media'

export type HeroVideoClip = {
  id: string
  /** Null when the Studio replacement is MP4 only. */
  webm: string | null
  mp4: string | null
  poster: string
  /** Resolved: "Nusa Penida · Kelingking". */
  label: string
  /** Resolved: "Nusa Penida". */
  short: string
}

export type HeroVideoProps = {
  clips: readonly HeroVideoClip[]
  /** Title, lede, search and link — rendered on the server. */
  children: ReactNode
  labelledBy: string
  pauseLabel: string
  playLabel: string
  /** Accessible name of the tab row. */
  tabsLabel: string
}

const REDUCED = '(prefers-reduced-motion: reduce)'
const WIDE = '(min-width: 1000px)'

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCED)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const readReduced = () => window.matchMedia(REDUCED).matches
/** The server renders motion on; the client corrects it before playing. */
const readReducedOnServer = () => false

export function HeroVideo({
  clips,
  children,
  labelledBy,
  pauseLabel,
  playLabel,
  tabsLabel,
}: HeroVideoProps) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  /** Bumped on every change so the progress bar animation restarts. */
  const [cycle, setCycle] = useState(0)
  const reduce = useSyncExternalStore(subscribeReduced, readReduced, readReducedOnServer)
  // The first poster is the page's LCP; a <video poster> is discovered late.
  const firstPoster = clips[0]?.poster
  if (firstPoster) preload(firstPoster, { as: 'image', fetchPriority: 'high' })

  const rootRef = useRef<HTMLElement>(null)
  const videosRef = useRef<(HTMLVideoElement | null)[]>([])
  const visibleRef = useRef(false)
  /**
   * Phones: no video bytes on the first load. The poster is the hero until
   * the page has loaded and the browser is idle, and not at all on Save-Data
   * or a 2G/3G connection (the poster simply stays).
   */
  const phoneReadyRef = useRef(false)
  /** Which posters to set: the first always; on phones the others only when next up. */
  const [wideView, setWideView] = useState(false)
  const currentRef = useRef(0)
  const pausedRef = useRef(false)

  /** Play/pause each video for the current state (no React re-render). */
  const apply = useCallback(() => {
    const reduced = window.matchMedia(REDUCED).matches
    const wide = window.matchMedia(WIDE).matches
    const run =
      visibleRef.current && !pausedRef.current && !reduced && (wide || phoneReadyRef.current)
    videosRef.current.forEach((video, index) => {
      if (video === null) return
      const active = index === currentRef.current
      if (run && (wide || active)) {
        const playing = video.play()
        // Autoplay can be refused (data saver, power mode); the poster stays.
        if (playing !== undefined) playing.catch(() => undefined)
      } else {
        video.pause()
      }
    })
  }, [])

  const go = useCallback(
    (index: number) => {
      const next = ((index % clips.length) + clips.length) % clips.length
      const video = videosRef.current[next]
      // On phones the incoming clip starts from its first frame.
      if (video && !window.matchMedia(WIDE).matches) {
        try {
          video.currentTime = 0
        } catch {
          /* not seekable yet */
        }
      }
      currentRef.current = next
      setCurrent(next)
      setCycle((value) => value + 1)
      apply()
    },
    [apply, clips.length],
  )

  // Phones: arm the video only once the page is loaded and idle.
  useEffect(() => {
    const wide = window.matchMedia(WIDE)
    const syncWide = () => setWideView(wide.matches)
    syncWide()
    wide.addEventListener('change', syncWide)
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection
    const frugal =
      connection?.saveData === true || /(^|-)(2g|3g)$/.test(connection?.effectiveType ?? '')
    let idleId: number | undefined
    let timer: number | undefined
    const INTERACTIONS = ['pointerdown', 'scroll', 'keydown'] as const
    const ready = () => {
      if (phoneReadyRef.current) return
      phoneReadyRef.current = true
      INTERACTIONS.forEach((name) => window.removeEventListener(name, onInteract))
      apply()
    }
    // Whichever comes first: the visitor interacts, or the page has been
    // loaded and idle for a few seconds. The first load is the poster only.
    function onInteract() {
      ready()
    }
    const arm = () => {
      INTERACTIONS.forEach((name) =>
        window.addEventListener(name, onInteract, { once: true, passive: true }),
      )
      timer = window.setTimeout(() => {
        if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(ready)
        else ready()
      }, 6000)
    }
    if (!frugal) {
      if (document.readyState === 'complete') arm()
      else window.addEventListener('load', arm, { once: true })
    }
    return () => {
      wide.removeEventListener('change', syncWide)
      window.removeEventListener('load', arm)
      INTERACTIONS.forEach((name) => window.removeEventListener(name, onInteract))
      if (timer !== undefined) window.clearTimeout(timer)
      if (idleId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId)
    }
  }, [apply])

  // Reduced motion switched on or off: stop or resume the videos.
  useEffect(() => {
    apply()
  }, [reduce, apply])

  // Visibility: play only while the hero is on screen.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry?.isIntersecting ?? false
        apply()
      },
      { threshold: 0.2 },
    )
    observer.observe(root)
    const wide = window.matchMedia(WIDE)
    wide.addEventListener('change', apply)
    return () => {
      observer.disconnect()
      wide.removeEventListener('change', apply)
    }
  }, [apply])

  // Rotation: the next clip every 7 s while visible, playing and in motion.
  useEffect(() => {
    if (paused || reduce || clips.length < 2) return
    const timer = window.setTimeout(() => {
      if (visibleRef.current) go(currentRef.current + 1)
      else setCycle((value) => value + 1) // try again later
    }, HERO_STEP_MS)
    return () => window.clearTimeout(timer)
  }, [cycle, paused, reduce, clips.length, go])

  const togglePause = () => {
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
    apply()
  }

  const active = clips[current]

  return (
    <section
      ref={rootRef}
      className={`hv${paused ? ' is-paused' : ''}`}
      aria-labelledby={labelledBy}
    >
      <div className="wrap hv-grid">
        <div className="hv-copy">
          {active !== undefined && (
            <span className="hv-place">
              <i aria-hidden="true" />
              <span className="hv-pl-in">
                <b key={active.id}>{active.label}</b>
              </span>
            </span>
          )}
          {children}
        </div>

        <div className="hv-frame" aria-hidden="true">
          <div className="hv-slides">
            {clips.map((clip, index) => (
              <div key={clip.id} className={index === current ? 'hv-sl on' : 'hv-sl'}>
                <video
                  ref={(node) => {
                    videosRef.current[index] = node
                  }}
                  muted
                  playsInline
                  loop
                  preload="none"
                  poster={
                    index === 0 ||
                    wideView ||
                    index === current ||
                    index === (current + 1) % clips.length
                      ? clip.poster
                      : undefined
                  }
                  tabIndex={-1}
                >
                  {clip.webm ? <source src={clip.webm} type="video/webm" /> : null}
                  {clip.mp4 ? <source src={clip.mp4} type="video/mp4" /> : null}
                </video>
                <span className="hv-cap">{clip.short}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="hv-tabs"
          role="group"
          aria-label={tabsLabel}
          style={{ '--hv-n': clips.length } as CSSProperties}
        >
          {clips.map((clip, index) => (
            <button
              key={clip.id}
              type="button"
              className={
                index === current ? 'hv-tab on' : index < current ? 'hv-tab done' : 'hv-tab'
              }
              aria-pressed={index === current}
              onClick={() => go(index)}
            >
              <span className="bar" aria-hidden="true">
                <i key={index === current ? `on-${cycle}` : 'off'} />
              </span>
              <span>{clip.short}</span>
            </button>
          ))}
          <button
            type="button"
            className="hv-pause"
            aria-pressed={paused}
            aria-label={paused ? playLabel : pauseLabel}
            title={paused ? playLabel : pauseLabel}
            onClick={togglePause}
          >
            {paused ? (
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </section>
  )
}
