'use client'

/**
 * Scroll-spy for the policies TOC: marks the link of the section in view
 * (`data-on`) and, on phones where the TOC is a row of pills, scrolls the
 * active pill into view. Same IntersectionObserver as the source page.
 */

import { useEffect } from 'react'

export function ScrollSpy() {
  useEffect(() => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-toc] a')]
    const sections = [...document.querySelectorAll<HTMLElement>('[data-policies] section[id]')]
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          let active: HTMLAnchorElement | undefined
          for (const link of links) {
            const on = link.hash === `#${entry.target.id}`
            link.toggleAttribute('data-on', on)
            if (on) {
              link.setAttribute('aria-current', 'location')
              active = link
            } else link.removeAttribute('aria-current')
          }
          if (active && window.innerWidth <= 900) {
            active.scrollIntoView({ block: 'nearest', inline: 'center' })
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px' },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])
  return null
}
