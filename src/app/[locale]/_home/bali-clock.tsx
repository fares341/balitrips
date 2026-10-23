'use client'

import { useEffect, useState } from 'react'

/**
 * The current time in Bali (WITA, UTC+8, Asia/Makassar), ticking in the
 * browser. The server renders its own reading; the client takes over on
 * mount and refreshes it every 15 seconds (minutes only are shown).
 */
export function BaliClock({ locale, initial }: { locale: string; initial: string }) {
  const [text, setText] = useState(initial)

  useEffect(() => {
    const format = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'Asia/Makassar',
    })
    const tick = () => setText(format.format(new Date()))
    tick()
    const timer = window.setInterval(tick, 15_000)
    return () => window.clearInterval(timer)
  }, [locale])

  return (
    <time className="num" dir="ltr" suppressHydrationWarning>
      {text}
    </time>
  )
}
