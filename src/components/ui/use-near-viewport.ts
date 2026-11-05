'use client'

/**
 * True once the element is in or near the viewport (IntersectionObserver),
 * then stays true. Used to defer billable Google photo loads on map cards: a
 * carousel windowed to ~21 eager cards would otherwise fire ~21 Places Photo
 * requests per map open. Native `loading="lazy"` is unreliable inside a
 * horizontal scroll-snap strip, hence the observer.
 *
 * `enabled = false` (our own photos) is always "visible": nothing changes.
 * Without IntersectionObserver (very old browsers, SSR) it loads at once.
 */

import { useCallback, useState } from 'react'

export const NEAR_MARGIN = '200px'

export function useNearViewport(enabled: boolean): {
  visible: boolean
  observe: (el: Element | null) => void
} {
  const [seen, setSeen] = useState(false)
  const observe = useCallback(
    (el: Element | null) => {
      if (!enabled || seen || el === null) return
      if (typeof IntersectionObserver === 'undefined') {
        setSeen(true)
        return
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setSeen(true)
            io.disconnect()
          }
        },
        { rootMargin: NEAR_MARGIN },
      )
      io.observe(el)
    },
    [enabled, seen],
  )
  return { visible: !enabled || seen, observe }
}
