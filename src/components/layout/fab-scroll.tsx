'use client'

/**
 * Phones: the floating WhatsApp and assistant buttons step aside while the
 * visitor scrolls down (reading), and come back on the first scroll up.
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

export function FabScroll() {
  const pathname = usePathname()

  useEffect(() => {
    const body = document.body
    let last = window.scrollY
    let frame = 0
    const update = () => {
      frame = 0
      const y = window.scrollY
      if (y < TOP_ZONE) {
        delete body.dataset.fabScroll
      } else if (y - last > STEP) {
        body.dataset.fabScroll = 'down'
      } else if (last - y > STEP) {
        delete body.dataset.fabScroll
      } else {
        return
      }
      last = y
    }
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame !== 0) window.cancelAnimationFrame(frame)
      delete body.dataset.fabScroll
    }
  }, [pathname])

  return null
}
