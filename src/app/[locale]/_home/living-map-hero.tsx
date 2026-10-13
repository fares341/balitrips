'use client'

/**
 * Home hero — "Living map".
 *
 * The client's animated prototype, rebuilt for the site: a night/blueprint map
 * under clouds; the clouds part, the coastline is traced in light, a golden
 * wave uncovers the colour map from Ubud, pins ripple out and a plane draws
 * the route; then the headline rises and a slider walks through the island's
 * destinations with a glass card and a leader line.
 *
 * React renders the markup once (server HTML is the opening frame); all motion
 * lives in ./living-map-engine.ts, started in an effect and fully torn down on
 * unmount. The card's text and link are React-rendered from a tiny external
 * store the engine writes to, so the next-intl `Link` always navigates to the
 * card that is showing.
 *
 * Accessibility: a visible Pause/Play control (WCAG 2.2.2); rotation also
 * stops on hover or keyboard focus in the card or controls, off screen and in
 * a hidden tab; the card is a polite live region whenever it is not rotating
 * on its own; prefers-reduced-motion shows the final frame with a manual
 * slider. Copy, CTAs and destinations arrive translated from the server page.
 */

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

import { Icon } from '@/components/ui'
import { Link } from '@/i18n/routing'

import { COASTLINES, HERO_IMAGE, MAP_H, MAP_W, ROUTE_D } from './living-map-data'
import { createLivingMap, type LivingMapEngine, type SlideState } from './living-map-engine'

export interface LivingMapDestination {
  id: string
  x: number
  y: number
  name: string
  /** Second line: the Latin name in Arabic, "TOWN · REGENCY" elsewhere. */
  latin: string
  tag: string
  desc: string
  href: string
  linkLabel: string
}

export interface LivingMapCopy {
  eyebrow: string
  /** Headline in runs; `accent` runs get the gradient. */
  title: readonly { text: string; accent: boolean }[]
  sub: string
  primary: string
  secondary: string
  /** Shorter CTA labels for phones, so both buttons fit on one row. */
  primaryShort: string
  secondaryShort: string
  mapAlt: string
  nav: string
  prev: string
  next: string
  pause: string
  play: string
  /** "Destination {n} of {total}". */
  count: string
}

interface Props {
  copy: LivingMapCopy
  destinations: readonly LivingMapDestination[]
  primaryHref: string
  secondaryHref: string
  /** Optional small line under the subtitle (price anchor, rating). */
  facts?: ReactNode
}

interface SlideStore {
  get(): SlideState
  set(next: SlideState): void
  subscribe(listener: () => void): () => void
}

function createSlideStore(initial: SlideState): SlideStore {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(next) {
      if (
        next.active === state.active &&
        next.shown === state.shown &&
        next.pos === state.pos &&
        next.total === state.total
      )
        return
      state = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

function titleWords(runs: LivingMapCopy['title']): { text: string; accent: boolean }[] {
  return runs.flatMap((run) =>
    run.text
      .split(/\s+/)
      .filter((text) => text !== '')
      .map((text) => ({ text, accent: run.accent })),
  )
}

export function LivingMapHero({ copy, destinations, primaryHref, secondaryHref, facts }: Props) {
  const rootRef = useRef<HTMLElement>(null)
  const engineRef = useRef<LivingMapEngine | null>(null)
  const [store] = useState(() =>
    createSlideStore({ active: -1, shown: 0, pos: 0, total: destinations.length }),
  )
  const slide = useSyncExternalStore(store.subscribe, store.get, store.get)
  const [userPaused, setUserPaused] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    if (root === null) return
    const engine = createLivingMap({
      root,
      points: destinations,
      reduce: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      // Synchronous, so the engine can measure the card it just changed.
      onSlide: (state) => flushSync(() => store.set(state)),
    })
    engineRef.current = engine
    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [destinations, store])

  useEffect(() => {
    engineRef.current?.setUserPaused(userPaused)
  }, [userPaused])

  const card = destinations[slide.shown] ?? destinations[0]
  const countLabel = copy.count
    .replace('{n}', String(slide.pos + 1))
    .replace('{total}', String(slide.total))

  return (
    <section ref={rootRef} className="lmh is-pending is-waiting" aria-labelledby="home-hero">
      <div className="lmh-stage">
        {/* The colour map paints first and stays put: it is the LCP image.
            The night map above it is what the reveal wave masks away. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="lmh-map"
          src={HERO_IMAGE.map}
          srcSet={HERO_IMAGE.mapSrcSet}
          sizes={HERO_IMAGE.sizes}
          alt={copy.mapAlt}
          width={MAP_W}
          height={MAP_H}
          fetchPriority="high"
          decoding="async"
          draggable={false}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="lmh-night"
          src={HERO_IMAGE.night}
          srcSet={HERO_IMAGE.nightSrcSet}
          sizes={HERO_IMAGE.sizes}
          alt=""
          aria-hidden="true"
          width={MAP_W}
          height={MAP_H}
          decoding="async"
          draggable={false}
        />

        <svg
          className="lmh-overlay"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="lmh-spot-g">
              <stop offset="0" stopColor="#000" />
              <stop offset=".45" stopColor="#000" />
              <stop offset="1" stopColor="#fff" />
            </radialGradient>
            <mask
              id="lmh-spot-mask"
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={MAP_W}
              height={MAP_H}
            >
              <rect width={MAP_W} height={MAP_H} fill="#fff" />
              <circle
                className="lmh-spot-c"
                cx={destinations[0]?.x ?? 0}
                cy={destinations[0]?.y ?? 0}
                r="360"
                fill="url(#lmh-spot-g)"
              />
            </mask>
          </defs>
          <rect className="lmh-spot" width={MAP_W} height={MAP_H} mask="url(#lmh-spot-mask)" />
          <g className="lmh-coast">
            {COASTLINES.map((d, i) => (
              <path key={`base-${i}`} className="base" d={d} pathLength={1000} />
            ))}
            {COASTLINES.map((d, i) => (
              <path key={`comet-${i}`} className="comet" d={d} pathLength={1000} />
            ))}
          </g>
          <path className="lmh-route" d={ROUTE_D} />
          <g className="lmh-bursts" />
          <g className="lmh-pins">
            {destinations.map((point, i) => (
              <g
                key={point.id}
                className={i === slide.active ? 'lmh-pin is-active' : 'lmh-pin'}
                transform={`translate(${point.x} ${point.y})`}
                onClick={() => engineRef.current?.goToPoint(i)}
              >
                <g className="lmh-pin-pop">
                  <g className="lmh-pin-s">
                    <circle className="hit" r="48" />
                    <circle className="halo" r="40" strokeDasharray="14 12" />
                    <circle className="ring" r="20" />
                    <circle className="core" r="9" />
                  </g>
                </g>
              </g>
            ))}
          </g>
          <g className="lmh-plane">
            <path
              className="lmh-plane-s"
              d="M28 0 L-14 -6 L-24 -26 L-32 -26 L-26 -5 L-40 -4 L-46 -14 L-52 -14 L-48 0 L-52 14 L-46 14 L-40 4 L-26 5 L-32 26 L-24 26 L-14 6 Z"
            />
          </g>
        </svg>
      </div>

      <canvas className="lmh-sparkles" aria-hidden="true" />
      <div className="lmh-wisps" aria-hidden="true" />
      <div className="lmh-sheen" aria-hidden="true" />
      <svg className="lmh-fx" aria-hidden="true">
        <circle className="lmh-ring" r="0" />
      </svg>
      <div className="lmh-shade" aria-hidden="true" />

      <svg className="lmh-leader" aria-hidden="true">
        <g className="lmh-leader-g">
          <path className="lmh-leader-path" />
          <circle className="lmh-leader-dot" r="4" />
        </g>
      </svg>

      <div className="lmh-content">
        <p className="lmh-eyebrow">
          <i className="lmh-eyebrow-line" aria-hidden="true" />
          <span className="lmh-eyebrow-text">{copy.eyebrow}</span>
        </p>
        <h1 id="home-hero" className="lmh-title">
          {/* One clipped box per word, so each can rise on its own. The space
              stays outside the box: a trailing space inside an inline-block
              collapses and the words would run together. */}
          {titleWords(copy.title).map((word, i) => (
            <Fragment key={i}>
              {i > 0 && ' '}
              <span className="lmh-word">
                <span className={word.accent ? 'lmh-accent' : undefined}>{word.text}</span>
              </span>
            </Fragment>
          ))}
        </h1>
        <p className="lmh-sub">{copy.sub}</p>
        {facts !== undefined && facts !== null && <div className="lmh-facts">{facts}</div>}
        <div className="lmh-ctas">
          <Link href={primaryHref} className="bt-glowcta lmh-cta">
            <Icon name="pin" size={19} />
            <span className="lmh-long">{copy.primary}</span>
            <span className="lmh-short">{copy.primaryShort}</span>
          </Link>
          <Link href={secondaryHref} className="lmh-ghost">
            <span className="lmh-long">{copy.secondary}</span>
            <span className="lmh-short">{copy.secondaryShort}</span>
            <Icon name="arrow" size={17} className="flip" />
          </Link>
        </div>
      </div>

      {card !== undefined && (
        <article className="lmh-card" aria-label={countLabel}>
          <p className="lmh-card-meta">
            <span>{card.tag}</span>
            <span dir="ltr">
              {pad(slide.pos + 1)} / {pad(slide.total)}
            </span>
          </p>
          <h2 className="lmh-card-name">{card.name}</h2>
          <p className="lmh-card-latin" dir="ltr">
            {card.latin}
          </p>
          <p className="lmh-card-desc">{card.desc}</p>
          <Link href={card.href} className="lmh-card-link">
            {card.linkLabel}
            <Icon name="arrow" size={16} className="flip" />
          </Link>
          <div className="lmh-bar" aria-hidden="true">
            <i className="lmh-bar-fill" />
          </div>
        </article>
      )}

      <nav className="lmh-nav" aria-label={copy.nav}>
        <button
          type="button"
          className="lmh-btn"
          aria-label={copy.prev}
          onClick={() => engineRef.current?.step(-1)}
        >
          <svg viewBox="0 0 24 24" className="flip" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
        <span className="lmh-count" dir="ltr" aria-hidden="true">
          <b>{pad(slide.pos + 1)}</b> / {pad(slide.total)}
        </span>
        <button
          type="button"
          className="lmh-btn"
          aria-label={copy.next}
          onClick={() => engineRef.current?.step(1)}
        >
          <svg viewBox="0 0 24 24" className="flip" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
        <button
          type="button"
          className="lmh-btn lmh-toggle"
          aria-label={userPaused ? copy.play : copy.pause}
          onClick={() => setUserPaused((paused) => !paused)}
        >
          {userPaused ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="fill" d="M8 5.5v13l10.5-6.5z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6v12M15 6v12" />
            </svg>
          )}
        </button>
      </nav>

      <div className="lmh-clouds" aria-hidden="true">
        <div className="lmh-cloud lmh-cloud--l" />
        <div className="lmh-cloud lmh-cloud--r" />
      </div>
      <div className="lmh-topfade" aria-hidden="true" />
    </section>
  )
}
