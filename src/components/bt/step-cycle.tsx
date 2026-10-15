'use client'

/**
 * StepCycle — the list wrapper that highlights one StepCard at a time
 * (Bluuu-style): the active card's number turns brand colour and a thin line
 * fills along its top edge, then the next card takes over.
 *
 * - Runs only while the list is on screen (IntersectionObserver).
 * - Hovering or focusing a card makes it the active one and pauses the cycle.
 * - prefers-reduced-motion: no cycling at all (CSS shows the static cards).
 *
 * The active card is marked with `data-active` on its <li> directly in the
 * DOM — no React state, so the server-rendered cards are never re-rendered.
 */

import { useEffect, useRef, type ReactNode } from 'react'

/** Must match the `--stc-step` duration in bt.css "Step cards". */
const STEP_MS = 2600

export function StepCycle({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const list = ref.current
    if (!list) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const items = Array.from(list.children) as HTMLElement[]
    if (items.length < 2) return

    let active = 0
    let timer: number | undefined
    let visible = false
    let paused = false

    const mark = (index: number) => {
      items.forEach((item, i) => {
        if (i === index) item.setAttribute('data-active', '')
        else item.removeAttribute('data-active')
      })
      active = index
    }
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer)
      timer = undefined
    }
    const start = () => {
      stop()
      if (!visible || paused) return
      mark(active)
      timer = window.setInterval(() => mark((active + 1) % items.length), STEP_MS)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting)
        if (visible) start()
        else stop()
      },
      { threshold: 0.35 },
    )
    observer.observe(list)

    const cleanups = items.map((item, index) => {
      const enter = () => {
        paused = true
        stop()
        mark(index)
        list.setAttribute('data-paused', '')
      }
      const leave = () => {
        if (list.contains(document.activeElement) && item !== document.activeElement) return
        paused = false
        list.removeAttribute('data-paused')
        // restart the line on the current card, then carry on
        item.removeAttribute('data-active')
        void item.offsetWidth
        start()
      }
      item.addEventListener('pointerenter', enter)
      item.addEventListener('pointerleave', leave)
      item.addEventListener('focusin', enter)
      item.addEventListener('focusout', leave)
      return () => {
        item.removeEventListener('pointerenter', enter)
        item.removeEventListener('pointerleave', leave)
        item.removeEventListener('focusin', enter)
        item.removeEventListener('focusout', leave)
      }
    })

    return () => {
      stop()
      observer.disconnect()
      cleanups.forEach((cleanup) => cleanup())
      items.forEach((item) => item.removeAttribute('data-active'))
    }
  }, [])

  return (
    <ol ref={ref} className="stc-grid" aria-label={label}>
      {children}
    </ol>
  )
}
