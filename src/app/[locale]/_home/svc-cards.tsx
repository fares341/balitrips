'use client'

/**
 * "What are you planning today?" — the motion around the service cards
 * (home.html `.svc` + bt.js `ncycle`):
 *
 *  - the cards rise in, one after another, the first time the list is seen;
 *  - one card at a time is highlighted (`data-on`), every 2.8 s, while the
 *    list is on screen; hovering or focusing a card highlights it and holds.
 *  - prefers-reduced-motion: the cards are simply there, the first one lit.
 *
 * The cards themselves are server-rendered links (children); this wrapper
 * only sets data attributes on them, so React never re-renders them.
 */

import { useEffect, useRef, type ReactNode } from 'react'

const STEP_MS = 2800

export function SvcCards({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const list = ref.current
    if (!list) return
    const cards = Array.from(list.children) as HTMLElement[]
    if (cards.length === 0) return

    let index = 0
    let timer: number | undefined
    let hold = false
    const set = (next: number) => {
      cards.forEach((card, i) => {
        if (i === next) card.setAttribute('data-on', '')
        else card.removeAttribute('data-on')
      })
      index = next
    }
    set(0)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      list.setAttribute('data-in', '')
      return
    }

    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer)
      timer = undefined
    }
    const start = () => {
      if (timer === undefined)
        timer = window.setInterval(() => {
          if (!hold) set((index + 1) % cards.length)
        }, STEP_MS)
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          list.setAttribute('data-in', '')
          start()
        } else stop()
      },
      { threshold: 0.12 },
    )
    observer.observe(list)

    const cleanups = cards.map((card, i) => {
      const enter = () => {
        hold = true
        set(i)
      }
      const leave = () => {
        hold = false
      }
      card.addEventListener('pointerenter', enter)
      card.addEventListener('pointerleave', leave)
      card.addEventListener('focusin', enter)
      card.addEventListener('focusout', leave)
      return () => {
        card.removeEventListener('pointerenter', enter)
        card.removeEventListener('pointerleave', leave)
        card.removeEventListener('focusin', enter)
        card.removeEventListener('focusout', leave)
      }
    })

    return () => {
      observer.disconnect()
      stop()
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [])

  return (
    <nav ref={ref} className="ncards svc" aria-labelledby={labelledBy}>
      {children}
    </nav>
  )
}
