/**
 * Icon.
 *
 * The complete stroke-icon set from design/handoff/sections-bt/primitives.jsx,
 * ported glyph-for-glyph. Every path is on a 24x24 viewBox, drawn with
 * `fill: none` and a single stroke so the icon takes its colour from `stroke`.
 *
 * No 'use client' — this renders identical markup on every render and holds no
 * state, so it stays a Server Component and costs the client bundle nothing.
 *
 * Two deliberate departures from the handoff:
 *
 *  1. `className` is honoured. The handoff's Icon silently dropped it, which
 *     meant `<Icon name="chevronr" className="flip" />` — used for every
 *     breadcrumb separator and CTA arrow — never mirrored in Arabic. Pass
 *     "flip" on any directional glyph (arrow, chevron, chevronr) and the
 *     `[dir='rtl'] .flip` rule in base.css turns it around.
 *  2. `aria-hidden` is set. Icons here are decorative; the accessible name
 *     belongs on the button or link wrapping them.
 */

import type { CSSProperties, ReactElement } from 'react'

/**
 * The glyph table. Module-level, so the 44 elements are built once for the
 * lifetime of the process rather than rebuilt on every icon render as the
 * handoff did.
 *
 * `quote` is the one filled glyph. It uses `currentColor` rather than the
 * `color` prop directly so this table can stay constant; the `<svg>` sets the
 * `color` presentation attribute from the prop, which is what `currentColor`
 * then resolves against.
 */
const GLYPHS = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="5" r="3" />
      <path d="M9 19h6a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h0" />
    </>
  ),
  sparkle: <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" />,
  gem: (
    <>
      <path d="M6 3h12l3 6-9 12L3 9l3-6Z" />
      <path d="M3 9h18M9 3 7 9l5 12M15 3l2 6-5 12" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-2 5-4 1 2-5 4-1Z" />
    </>
  ),
  heart: (
    <path d="M12 21s-7-4.4-9.5-9.5C.8 7.5 3 4 6.5 4 8.5 4 10 5 12 7c2-2 3.5-3 5.5-3C21 4 23.2 7.5 21.5 11.5 19 16.6 12 21 12 21Z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="m5 12 5 5 9-11" />,
  cross: <path d="m6 6 12 12M18 6 6 18" />,
  star: <path d="m12 3 2.6 6 6.4.6-4.9 4.4 1.5 6.4L12 17.6 6.4 20.4 7.9 14 3 9.6 9.4 9z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  pdf: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </>
  ),
  cal: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M20.5 20c-.4-1.8-1.3-3.2-2.5-4" />
    </>
  ),
  coffee: (
    <>
      <path d="M4 8h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" />
      <path d="M17 9h2a2 2 0 0 1 0 4h-2" />
      <path d="M7 2v3M11 2v3" />
    </>
  ),
  wave: (
    <>
      <path d="M2 8c3 0 3 2 6 2s3-2 6-2 3 2 6 2" />
      <path d="M2 14c3 0 3 2 6 2s3-2 6-2 3 2 6 2" />
    </>
  ),
  mountain: <path d="m3 20 6-11 4 7 2-3 6 7H3Z" />,
  car: (
    <>
      <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11M5 11h14v6H5zM5 11v-.5M7 17v2M17 17v2" />
      <circle cx="7.5" cy="14" r="1" />
      <circle cx="16.5" cy="14" r="1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  trash: (
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  ),
  whatsapp: (
    <>
      <path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3Z" />
      <path d="M8.5 8.5c0 4 3 7 7 7 .8 0 1.2-.6 1-1.3l-.5-1.4-2 .6-1.5-2 .6-2-1.4-.5c-.7-.2-1.3.2-1.3 1Z" />
    </>
  ),
  quote: (
    <path
      d="M7 7H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v-2H5V9h2Zm10 0h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v-2h-2V9h2Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M3 4h2l2.2 11.2a1 1 0 0 0 1 .8h8.4a1 1 0 0 0 1-.78L20 8H6" />
    </>
  ),
  filter: <path d="M3 5h18M6 12h12M10 19h4" />,
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  phone: (
    <path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  chevronr: <path d="m9 6 6 6-6 6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" />
      <circle cx="8" cy="8" r="1.5" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  book: (
    <>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M19 17H8a3 3 0 0 0-3 3" />
    </>
  ),
  van: (
    <>
      <path d="M3 7h11l4 4h3v5H3zM3 7v9" />
      <circle cx="8" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </>
  ),
  suv: (
    <>
      <path d="M4 12l1-4h9l3 4h3v5H4zM4 12v5" />
      <circle cx="8" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
      <path d="M8 8v4" />
    </>
  ),
  plane: <path d="M10 3l1 7 8 4v2l-8-2-1 5 2 2v1l-3-1-3 1v-1l2-2-1-5-8 2v-2l8-4 1-7z" />,
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9h12v-9" />
    </>
  ),
  calcheck: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4M9 15l2 2 4-4" />
    </>
  ),
} satisfies Record<string, ReactElement>

/** Every glyph the icon set knows how to draw. */
export type IconName = keyof typeof GLYPHS

/** Sorted list of names — handy for icon pickers and tests. */
export const iconNames = Object.keys(GLYPHS).sort() as IconName[]

/**
 * Narrow an arbitrary string to an `IconName`.
 *
 * Icon names arrive from content rows (package amenities, nav entries, service
 * cards), so they are `string` at the type level. Guard before rendering
 * instead of casting.
 */
export function isIconName(value: string): value is IconName {
  return Object.prototype.hasOwnProperty.call(GLYPHS, value)
}

/** Drawn when a name that is not in the table slips through at runtime. */
const FALLBACK: ReactElement = <circle cx="12" cy="12" r="9" />

export type IconProps = {
  /** Which glyph to draw. */
  name: IconName
  /** Rendered box, in px. Square — the viewBox is 24x24. */
  size?: number
  /** Stroke width, in viewBox units. */
  stroke?: number
  /** Any CSS colour, including `var(--forest)`. Defaults to inheriting. */
  color?: string
  /** Add "flip" to any directional glyph so it mirrors under `dir="rtl"`. */
  className?: string
}

export function Icon({
  name,
  size = 22,
  stroke = 1.7,
  color = 'currentColor',
  className,
}: IconProps) {
  // `name` is a literal union, so this lookup is total for well-typed callers.
  // The guard covers names that arrive from the database and were cast.
  const glyph: ReactElement = GLYPHS[name] ?? FALLBACK

  const style: CSSProperties = { flexShrink: 0 }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      color={color}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {glyph}
    </svg>
  )
}
