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
 *
 * Also (full QA, Nov 2026): `data-fab-typing` while a form field has focus
 * (phones: the buttons stepped onto the field and its submit button above the
 * keyboard), and `data-fab-compact` once the page is scrolled past the first
 * screen (desktop: the labelled pills become round buttons so they stop
 * covering content at the inline-end edge).
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
    // Only write the attribute when it changes: every write to <body>
    // invalidates style for the whole page, and this runs during a fling.
    const show = () => {
      idle = 0
      if (body.dataset.fabScroll !== undefined) delete body.dataset.fabScroll
    }
    const update = () => {
      frame = 0
      const y = window.scrollY
      // Past the first screen the labelled desktop pills shrink to round
      // buttons (bt-mobile.css), so they no longer sit on the content.
      const compact = y >= TOP_ZONE
      if (compact !== (body.dataset.fabCompact !== undefined)) {
        if (compact) body.dataset.fabCompact = ''
        else delete body.dataset.fabCompact
      }
      if (y < TOP_ZONE) {
        window.clearTimeout(idle)
        show()
        last = y
        return
      }
      if (Math.abs(y - last) <= STEP) return
      last = y
      if (body.dataset.fabScroll !== 'down') body.dataset.fabScroll = 'down'
      window.clearTimeout(idle)
      idle = window.setTimeout(show, IDLE_MS)
    }
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update)
    }
    // Typing in a field (phone keyboard up): the buttons would sit on the
    // field or its submit button, so they step aside until focus leaves.
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      el.matches('input:not([type=checkbox]):not([type=radio]), textarea, select')
    const onFocusIn = (event: FocusEvent) => {
      if (isField(event.target)) body.dataset.fabTyping = ''
    }
    const onFocusOut = (event: FocusEvent) => {
      if (isField(event.target) && !isField(event.relatedTarget)) delete body.dataset.fabTyping
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    // A page opened mid-way (back/forward restores the scroll position).
    if (window.scrollY >= TOP_ZONE) body.dataset.fabCompact = ''
    return () => {
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      delete body.dataset.fabTyping
      delete body.dataset.fabCompact
      if (frame !== 0) window.cancelAnimationFrame(frame)
      window.clearTimeout(idle)
      delete body.dataset.fabScroll
    }
  }, [pathname])

  return null
}
