'use client'

/**
 * Phones: the floating WhatsApp and assistant buttons step aside while the
 * visitor scrolls, in either direction, and come back once the page has been
 * still for a moment (owner video, Nov 2026: scrolling back up brought them
 * straight back over the cards and text being read). Near the top they stay.
 *
 * At 390px the two 52px buttons covered card prices, «Open on the map» links
 * and the last letters of titles on every list page (mobile audit, Nov 2026).
 * Sets `data-fab-scroll="down"` on <body>; bt-mobile.css does the slide, on
 * phones only. One passive scroll listener, read in a frame callback.
 */

import { useEffect } from 'react'

import { usePathname } from '@/i18n/routing'

/** Scroll this far from the top before the buttons may hide. */
const TOP_ZONE = 240
/** Ignore jitter smaller than this (momentum scrolling, address bar). */
const STEP = 12
/** Still this long (iOS momentum included: it fires scroll events) → back. */
const IDLE_MS = 1100

export function FabScroll() {
  const pathname = usePathname()

  useEffect(() => {
    const body = document.body
    let last = window.scrollY
    let frame = 0
    let idle = 0
    const show = () => {
      idle = 0
      delete body.dataset.fabScroll
    }
    const update = () => {
      frame = 0
      const y = window.scrollY
      if (y < TOP_ZONE) {
        window.clearTimeout(idle)
        show()
        last = y
        return
      }
      if (Math.abs(y - last) <= STEP) return
      last = y
      body.dataset.fabScroll = 'down'
      window.clearTimeout(idle)
      idle = window.setTimeout(show, IDLE_MS)
    }
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame !== 0) window.cancelAnimationFrame(frame)
      window.clearTimeout(idle)
      delete body.dataset.fabScroll
    }
  }, [pathname])

  return null
}
