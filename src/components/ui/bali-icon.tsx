/**
 * Bali Trips icon set — rounded line icons in the brand's forest green with a
 * Sunset Orange accent, each carrying a small tropical motif (a frangipani
 * flower or a palm leaf). Inline SVG, no emoji, no extra requests.
 *
 * Decorative by default (`aria-hidden`); pass `title` to give one a name.
 * Colours come from the tokens (`--forest`, `--orange`) and can be overridden
 * per use with the CSS variables `--bi-line` and `--bi-accent`.
 */

import type { ReactNode } from 'react'

export type BaliIconName =
  | 'lock'
  | 'unlock'
  | 'shield'
  | 'bolt'
  | 'ticket'
  | 'calendar'
  | 'food'
  | 'pin'
  | 'clock'
  | 'tip'
  | 'phone'
  | 'family'
  | 'map'
  | 'info'

const LINE = 'var(--bi-line, var(--forest, #26552e))'
const ACCENT = 'var(--bi-accent, var(--orange, #ff9000))'

/** A five-petal frangipani centred on (cx, cy). */
function Frangipani({ cx, cy, r = 2.4 }: { cx: number; cy: number; r?: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`} stroke="none">
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse
          key={deg}
          cx="0"
          cy={-r * 0.62}
          rx={r * 0.42}
          ry={r * 0.66}
          transform={`rotate(${deg})`}
          fill={ACCENT}
        />
      ))}
      <circle r={r * 0.26} fill="#fff6c7" />
    </g>
  )
}

/** A small palm leaf from (x, y), pointing up-and-out. */
function Leaf({ d }: { d: string }) {
  return <path d={d} fill={ACCENT} stroke="none" />
}

const SHAPES: Record<BaliIconName, ReactNode> = {
  lock: (
    <>
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <rect x="5" y="10.5" width="14" height="10" rx="3.2" />
      <Frangipani cx={12} cy={15.5} r={3} />
    </>
  ),
  unlock: (
    <>
      <path d="M8 10.5V8a4 4 0 0 1 7.6-1.7" />
      <rect x="5" y="10.5" width="14" height="10" rx="3.2" />
      <Frangipani cx={12} cy={15.5} r={3} />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 5.8v5.4c0 4.4 3 8 7 9.8 4-1.8 7-5.4 7-9.8V5.8L12 3Z" />
      <Leaf d="M9 15.2c.3-3.4 2.6-5.6 6.2-6-.2 3.6-2.5 5.9-6.2 6Z" />
      <path d="M9 15.2 13.4 10.6" stroke="#fff" strokeWidth="0.9" />
    </>
  ),
  bolt: (
    <>
      <path d="M13 3 6 13.2h5l-1 7.8 7-10.2h-5L13 3Z" />
      <Leaf d="M16.4 4.2c2.3.1 3.7 1.3 3.9 3.5-2.2.1-3.7-1.1-3.9-3.5Z" />
    </>
  ),
  ticket: (
    <>
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4V7.5Z" />
      <path d="M14.5 6.5v11" strokeDasharray="1.6 1.8" />
      <Frangipani cx={9.2} cy={12} r={3} />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="15" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
      <Frangipani cx={12} cy={15.3} r={2.6} />
    </>
  ),
  food: (
    <>
      <path d="M4 13h16a8 8 0 0 1-16 0Z" />
      <path d="M3 20.5h18" />
      <Leaf d="M12 12.2c-.2-3.4 1.5-6 5-7.2.3 3.6-1.5 6.2-5 7.2Z" />
      <path d="M8.5 11.5c0-1.4 1-1.6 1-3s-1-1.6-1-3" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" />
      <Frangipani cx={12} cy={10} r={3} />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12.5" r="8" />
      <path d="M12 8.2v4.5l3 1.8" />
      <Leaf d="M17.6 3.2c2.2-.3 3.6.6 4.1 2.6-2.1.4-3.6-.5-4.1-2.6Z" />
    </>
  ),
  tip: (
    <>
      <path d="M9 17.5h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.4.4.6.9.6 1.5v.2h6v-.2c0-.6.2-1.1.6-1.5A6 6 0 0 0 12 3Z" />
      <Frangipani cx={12} cy={9} r={2.6} />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.8" width="11" height="18.4" rx="2.8" />
      <path d="M10.5 18.2h3" />
      <Leaf d="M9.2 12.8c.2-3 2.2-5 5.4-5.4-.2 3.1-2.2 5.1-5.4 5.4Z" />
      <path d="M9.2 12.8 13 9" stroke="#fff" strokeWidth="0.8" />
    </>
  ),
  family: (
    <>
      <circle cx="8.5" cy="7.5" r="2.6" />
      <path d="M3.8 19.5c0-3 2.1-5.3 4.7-5.3s4.7 2.3 4.7 5.3" />
      <circle cx="16.5" cy="10" r="2" />
      <path d="M13.6 19.5c.2-2.4 1.4-4.1 2.9-4.1s2.9 1.7 2.9 4.1" />
      <Frangipani cx={18.6} cy={4.4} r={2.4} />
    </>
  ),
  map: (
    <>
      <path d="m3.5 6.5 5.5-2.2 6 2.2 5.5-2.2v13.2L15 19.7l-6-2.2-5.5 2.2V6.5Z" />
      <path d="M9 4.3v13.2M15 6.5v13.2" />
      <Frangipani cx={12} cy={11.5} r={2.4} />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="1.4" fill={ACCENT} stroke="none" />
    </>
  ),
}

export function BaliIcon({
  name,
  size = 24,
  title,
  className,
}: {
  name: BaliIconName
  size?: number
  title?: string
  className?: string
}) {
  return (
    <svg
      className={['bi', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={LINE}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      {SHAPES[name]}
    </svg>
  )
}
