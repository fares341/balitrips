'use client'

import { useEffect, useRef } from 'react'

/**
 * A KPI number that counts up once when it first shows. The server text is
 * rendered as is (it is what screen readers, no-JS and print get); only the
 * first run of Latin digits is animated, for ~600 ms, and never when the
 * viewer asked for reduced motion.
 */
export function CountUp({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const match = /\d[\d,]*(\.\d+)?/.exec(text)
    if (!match) return
    const raw = match[0]
    const target = Number(raw.replace(/,/g, ''))
    if (!Number.isFinite(target) || target === 0) return
    const decimals = match[1] ? match[1].length - 1 : 0
    const grouped = raw.includes(',')
    const fmt = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouped,
    })
    const before = text.slice(0, match.index)
    const after = text.slice(match.index + raw.length)
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600)
      const eased = 1 - (1 - t) ** 3
      el.textContent = `${before}${fmt.format(target * eased)}${after}`
      if (t < 1) frame = requestAnimationFrame(tick)
      else el.textContent = text
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      el.textContent = text
    }
  }, [text])
  return (
    <b ref={ref} className={className} dir="ltr">
      {text}
    </b>
  )
}
