'use client'

/**
 * Site motion, in one place (mobile audit, Nov 2026).
 *
 * 1. Reveal on scroll. Section heads (`.sec-head`) and the cards of every
 *    `.grid` (plus a few home-page blocks, see HEADS / GROUPS) fade up gently
 *    (about half a second) as they enter the screen; cards that enter
 *    together are staggered. Only blocks that are still BELOW the fold when
 *    the page opens are touched, so nothing on screen blinks; content is
 *    visible by default, so without JavaScript (or with an error here)
 *    everything simply shows. Opacity and transform only: no layout shift.
 *    Done with the Web Animations API, not classes or attributes, so the
 *    server HTML is never touched (no hydration mismatch in parts of the page
 *    that are still streaming in) and nothing is left behind afterwards.
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
const HEADS =
  'main .sec-head, main.home-v3 .svc-head, main.home-v3 .about-media, main.home-v3 .about-copy, main.home-v3 .wrap > .ct'
/** Blocks whose children rise one by one (staggered): every card grid. */
const GROUPS = 'main .grid, main .guide-grid'
/** Any element animated by the rules above (to skip blocks nested inside one). */
const ANY_TARGET = `${HEADS}, ${GROUPS.split(', ')
  .map((group) => `${group} > *`)
  .join(', ')}`
const STAGGER_MS = 70
/** Entering above this share of the screen height = scrolled past fast. */
const LATE_FRACTION = 0.6
const MAX_STAGGER = 5
const HIDDEN: Keyframe = { opacity: 0, transform: 'translate3d(0, 12px, 0)' }
const SHOWN: Keyframe = { opacity: 1, transform: 'translate3d(0, 0, 0)' }
const TIMING: KeyframeAnimationOptions = {
  duration: 460,
  easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  // Holds the hidden first frame while paused and during the stagger delay.
  fill: 'backwards',
}

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
    if (
      isExcluded(pathname) ||
      reducedMotion() ||
      typeof IntersectionObserver === 'undefined' ||
      typeof Element.prototype.animate !== 'function'
    ) {
      return
    }
    const armed = new Map<Element, Animation>()

    const observer = new IntersectionObserver(
      (entries) => {
        const entering = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target)
          // Reading order: top to bottom, then along the row.
          .sort((a, b) => {
            const ra = a.getBoundingClientRect()
            const rb = b.getBoundingClientRect()
            return (
              ra.top - rb.top || (document.dir === 'rtl' ? rb.left - ra.left : ra.left - rb.left)
            )
          })
        // A block that is already well inside the screen when it is first
        // seen was scrolled past quickly (a flick, a jump): it just shows.
        // Fading text in under a moving finger read as doubled, ghosted
        // lines on the owner's iPhone recording (Nov 2026).
        const late = window.innerHeight * LATE_FRACTION
        let n = 0
        entering.forEach((el) => {
          observer.unobserve(el)
          const animation = armed.get(el)
          armed.delete(el)
          if (animation === undefined) return
          if (el.getBoundingClientRect().top < late) {
            animation.cancel()
            return
          }
          const i = n++
          animation.effect?.updateTiming({ delay: Math.min(i, MAX_STAGGER) * STAGGER_MS })
          animation.play()
          animation.finished.then(
            () => animation.cancel(),
            () => {},
          )
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    )

    // Below the fold now? Measured once, before anything is hidden.
    const fold = window.innerHeight
    const candidates = new Set<Element>(document.querySelectorAll(HEADS))
    document.querySelectorAll(GROUPS).forEach((grid) => {
      for (const child of grid.children) candidates.add(child)
    })
    for (const el of candidates) {
      if (el.closest('[data-no-motion]') !== null) continue
      // One animation per area: a block inside another candidate rides with it.
      if (el.parentElement?.closest(ANY_TARGET)) continue
      const r = el.getBoundingClientRect()
      if (r.height === 0 || r.top <= fold) continue
      const animation = el.animate([HIDDEN, SHOWN], TIMING)
      animation.pause()
      armed.set(el, animation)
      observer.observe(el)
    }

    // Printing or leaving: show everything that never came into view.
    const showAll = () => armed.forEach((animation) => animation.cancel())
    window.addEventListener('beforeprint', showAll)
    return () => {
      observer.disconnect()
      window.removeEventListener('beforeprint', showAll)
      showAll()
    }
  }, [pathname])

  return null
}
