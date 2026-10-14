'use client'

/**
 * Reviews slider (client revision 1).
 *
 * A horizontally scrolling, snap-aligned list with no visible native
 * scrollbar, driven by previous / next arrows and a slim progress bar.
 * RTL-aware: "next" always moves in the reading direction (to the left in
 * Arabic), and the progress fills from the inline start.
 *
 * The list stays a plain scroll container, so touch swipe, trackpads and
 * keyboard scrolling keep working; the arrows only call `scrollBy`. State is
 * updated from the scroll event and a ResizeObserver callback — never
 * synchronously inside an effect.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { Icon } from '@/components/ui'

export type ReviewSliderProps = {
  children: ReactNode
  /** Accessible name of the list. */
  label: string
  prevLabel: string
  nextLabel: string
}

type Position = { progress: number; atStart: boolean; atEnd: boolean }

const EDGE = 4

export function ReviewSlider({ children, label, prevLabel, nextLabel }: ReviewSliderProps) {
  const listRef = useRef<HTMLUListElement>(null)
  const [position, setPosition] = useState<Position>({
    progress: 0,
    atStart: true,
    atEnd: false,
  })

  const measure = useCallback(() => {
    const list = listRef.current
    if (list === null) return
    const max = list.scrollWidth - list.clientWidth
    // scrollLeft is negative in RTL; the magnitude is what matters.
    const done = Math.abs(list.scrollLeft)
    setPosition({
      progress: max <= 0 ? 1 : Math.min(1, done / max),
      atStart: done <= EDGE,
      atEnd: max <= 0 || done >= max - EDGE,
    })
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (list === null || typeof ResizeObserver === 'undefined') return
    // The observer reports once on observe, which sets the initial state.
    const observer = new ResizeObserver(() => measure())
    observer.observe(list)
    return () => observer.disconnect()
  }, [measure])

  const go = (step: 1 | -1) => {
    const list = listRef.current
    if (list === null) return
    const rtl = getComputedStyle(list).direction === 'rtl'
    const first = list.firstElementChild
    const amount = first instanceof HTMLElement ? first.offsetWidth + 16 : list.clientWidth * 0.8
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollBy({ left: amount * step * (rtl ? -1 : 1), behavior: reduce ? 'auto' : 'smooth' })
  }

  const scrollable = !(position.atStart && position.atEnd)

  return (
    <div className="rv-slider">
      <ul className="rev-list" role="list" aria-label={label} ref={listRef} onScroll={measure}>
        {children}
      </ul>
      {scrollable && (
        <div className="rv-ctrl">
          <span className="rv-bar" aria-hidden="true">
            <i style={{ inlineSize: `${Math.max(12, position.progress * 100)}%` }} />
          </span>
          <button
            type="button"
            className="rv-arrow"
            aria-label={prevLabel}
            disabled={position.atStart}
            onClick={() => go(-1)}
          >
            <Icon name="back" size={18} stroke={2.2} className="flip" />
          </button>
          <button
            type="button"
            className="rv-arrow"
            aria-label={nextLabel}
            disabled={position.atEnd}
            onClick={() => go(1)}
          >
            <Icon name="arrow" size={18} stroke={2.2} className="flip" />
          </button>
        </div>
      )}
    </div>
  )
}
