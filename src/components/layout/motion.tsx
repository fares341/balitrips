'use client'

/**
 * Site motion, in one place (mobile audit, Nov 2026).
 *
 * 1. Reveal on scroll. Section heads (`.sec-head`) and the cards of every
 *    `.grid` (plus a few home-page blocks, see HEADS / GROUPS) fade up gently (about half a second) as they enter the screen;
 *    cards that enter together are staggered. Only blocks that are still
 *    BELOW the fold when the page opens are touched, so nothing on screen
 *    blinks; content is visible by default, so without JavaScript (or with
 *    an error here) everything simply shows. Opacity and transform only: no
 *    layout shift. CSS: `[data-rv]` in bt-mobile.css.
 * 2. A short fade of the page content after each in-app navigation (opacity
 *    only, so fixed bars inside the page are not displaced). Not on the first
 *    load, which the preloader covers.
 *
 * Both are off under `prefers-reduced-motion` and on the map, which manages
 * its own screen.
 *
 * To turn the reveal off site-wide, remove <Motion /> from the locale layout
 * (or add `data-no-motion` on a block to leave just that block alone).
 */

import { useEffect, useLayoutEffect, useRef } from 'react'

import { usePathname } from '@/i18n/routing'

/** Blocks that rise on their own: section heads, and the home page's own heads and panels. */
const HEADS = 'main .sec-head, main .svc-head, main .about-media, main .about-copy, main .ct'
/** Blocks whose children rise one by one (staggered): every card grid. */
const GROUPS = 'main .grid, main .guide-grid'
const STAGGER_MS = 70
const MAX_STAGGER = 5
/** After this, the attribute goes, so the card's own hover transitions return. */
const CLEANUP_MS = 700 + STAGGER_MS * MAX_STAGGER

/** Paths that keep their own motion (the map is a full-screen app). */
function isExcluded(pathname: string): boolean {
  return pathname === '/map' || pathname.startsWith('/map/')
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// useLayoutEffect warns on the server; this component only matters in the browser.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function Motion() {
  const pathname = usePathname()
  const firstPath = useRef<string | null>(null)

  // Page fade after a client navigation (before paint, so no flash).
  useIsoLayoutEffect(() => {
    if (firstPath.current === null) {
      firstPath.current = pathname
      return
    }
    if (isExcluded(pathname) || reducedMotion()) return
    const main = document.getElementById('main')
    main?.animate?.([{ opacity: 0.001 }, { opacity: 1 }], {
      duration: 260,
      easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
    })
  }, [pathname])

  // Reveal on scroll.
  useEffect(() => {
    if (isExcluded(pathname) || reducedMotion() || typeof IntersectionObserver === 'undefined') {
      return
    }
    const armed = new Set<HTMLElement>()
    const timers: number[] = []

    const show = (el: HTMLElement, delay: number) => {
      el.style.setProperty('--rv-delay', `${delay}ms`)
      el.dataset.rv = '1'
      armed.delete(el)
      timers.push(
        window.setTimeout(() => {
          delete el.dataset.rv
          el.style.removeProperty('--rv-delay')
        }, CLEANUP_MS + delay),
      )
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entering = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target as HTMLElement)
          // Reading order: top to bottom, then along the row.
          .sort((a, b) => {
            const ra = a.getBoundingClientRect()
            const rb = b.getBoundingClientRect()
            return (
              ra.top - rb.top || (document.dir === 'rtl' ? rb.left - ra.left : ra.left - rb.left)
            )
          })
        entering.forEach((el, i) => {
          observer.unobserve(el)
          show(el, Math.min(i, MAX_STAGGER) * STAGGER_MS)
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    )

    // Below the fold now? Measured once, before anything is hidden.
    const fold = window.innerHeight
    const candidates: HTMLElement[] = []
    document.querySelectorAll<HTMLElement>(HEADS).forEach((el) => candidates.push(el))
    document.querySelectorAll<HTMLElement>(GROUPS).forEach((grid) => {
      for (const child of grid.children) candidates.push(child as HTMLElement)
    })
    const below = candidates.filter((el) => {
      if (el.closest('[data-no-motion]') !== null || el.dataset.rv !== undefined) return false
      const r = el.getBoundingClientRect()
      return r.height > 0 && r.top > fold
    })
    for (const el of below) {
      el.dataset.rv = '0'
      armed.add(el)
      observer.observe(el)
    }

    return () => {
      observer.disconnect()
      timers.forEach((t) => window.clearTimeout(t))
      // Leave nothing hidden behind (route change, unmount).
      for (const el of armed) delete el.dataset.rv
    }
  }, [pathname])

  return null
}
