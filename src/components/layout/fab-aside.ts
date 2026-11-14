'use client'

/**
 * Lets a wide, dense block (the activity booking form, the package comparison
 * table) ask the floating chat buttons to step aside on phones while it is on
 * screen. Without it the WhatsApp and assistant buttons sit on top of add-on
 * prices and table cells at 390px.
 *
 * The block sets `data-fab="aside"` on <body>; `.wa-fab` / `.ai-fab` slide off
 * the edge under that attribute on phones only (bt.css). Several blocks may
 * hold it at once: it is released when the last one leaves the screen.
 */

import { useEffect, type RefObject } from 'react'

const holders = new Set<symbol>()

function sync() {
  if (holders.size > 0) document.body.dataset.fab = 'aside'
  else delete document.body.dataset.fab
}

export function useFabAside(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const el = ref.current
    if (!enabled || el === null || typeof IntersectionObserver === 'undefined') return
    const token = Symbol('fab-aside')
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) holders.add(token)
        else holders.delete(token)
        sync()
      },
      // Counted as «on screen» once it reaches the lower part where the buttons float.
      { rootMargin: '0px 0px -15% 0px' },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      holders.delete(token)
      sync()
    }
  }, [ref, enabled])
}
