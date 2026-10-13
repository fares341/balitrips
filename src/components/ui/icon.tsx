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
  // v3 package glyphs (design-reference/prototype/assets/bt.js), ported
  // path-for-path; social marks from its footer.
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 22s7-6.6 7-12.5A7 7 0 0 0 5 9.5C5 15.4 12 22 12 22Z" />
      <circle cx="12" cy="9.5" r="2.6" />
    </>
  ),
  heart: (
    <path d="M12 20.5s-7.5-4.6-9.3-9.7C1.4 7 3.9 4 7.2 4c2 0 3.4 1.1 4.8 2.9C13.4 5.1 14.8 4 16.8 4c3.3 0 5.8 3 4.5 6.8-1.8 5.1-9.3 9.7-9.3 9.7Z" />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.4 3 14.6 0 18M12 3c-3 3.4-3 14.6 0 18" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6L5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  suitcase: (
    <>
      <rect x="4" y="7" width="16" height="13" rx="2.5" />
      <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M9 11v5M15 11v5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  star: <path d="m12 3.5 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 17l-5.3 2.9 1.2-6-4.5-4.1 6-.7L12 3.5Z" />,
  cal: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" />
      <path d="M16 5.6a3 3 0 0 1 0 5.8M20.5 19.5c-.4-1.9-1.4-3.4-2.7-4.3" />
    </>
  ),
  car: (
    <>
      <path d="M4.5 16.5V12l1.8-4.6A2 2 0 0 1 8.2 6h7.6a2 2 0 0 1 1.9 1.4l1.8 4.6v4.5" />
      <path d="M3.5 12h17v4.5h-17z" />
      <circle cx="7.5" cy="16.5" r="1.8" />
      <circle cx="16.5" cy="16.5" r="1.8" />
    </>
  ),
  map: (
    <>
      <path d="m9 4-5.5 2v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5" />
    </>
  ),
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  box: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </>
  ),
  wand: (
    <path d="m4 20 11-11M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2ZM19 11l.6 1.4L21 13l-1.4.6L19 15l-.6-1.4L17 13l1.4-.6L19 11Z" />
  ),
  sparkle: <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 11 10.1 9 12 3.5Z" />,
  bolt: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" />,
  wave: (
    <path d="M2.5 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 4 2M2.5 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 4 2" />
  ),
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />,
  bed: (
    <>
      <path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3" />
      <circle cx="7" cy="10.5" r="1.6" />
    </>
  ),
  temple: (
    <path d="M12 2.5 8 6h8l-4-3.5ZM6 9h12M7 6.5 5 9.5h14l-2-3M8 12h8M6 12l-1 3h14l-1-3M7 15v6M17 15v6M10 21v-3h4v3" />
  ),
  food: <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1.5-2.5 4-2.5 7h2.5v11" />,
  coffee: (
    <>
      <path d="M4.5 9h12v4.5A4.5 4.5 0 0 1 12 18h-3a4.5 4.5 0 0 1-4.5-4.5V9Z" />
      <path d="M16.5 10h1.5a2.3 2.3 0 0 1 0 4.6h-1.5M8 3.5v2.5M12 3.5v2.5" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
      <circle cx="12" cy="12" r="7.5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4" />
    </>
  ),
  trash: <path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13" />,
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 2.5 20h19L12 3.5Z" />
      <path d="M12 10v4.5M12 17.3v.1" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5.5c0 4.3 3 7.9 7 9.5 4-1.6 7-5.2 7-9.5V6l-7-3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  chat: (
    <>
      <path d="M4 18.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 1.5Z" />
      <path d="M8.5 9.5h7M8.5 12.5h4.5" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M12 3.2A8.8 8.8 0 0 0 4.4 16.4L3.3 20.7l4.4-1.1A8.8 8.8 0 1 0 12 3.2Z" />
      <path d="M8.8 8.6c0 3.7 2.9 6.6 6.6 6.6.7 0 1.1-.6.9-1.2l-.5-1.3-1.8.5-1.4-1.8.6-1.8-1.3-.5c-.6-.2-1.1.2-1.1.8" />
    </>
  ),
  phone: (
    <path d="M5 4h3.5l1.5 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.5 20 4 13.5 3.5 5.6A1.5 1.5 0 0 1 5 4Z" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 6.5 8.5 7 8.5-7" />
    </>
  ),
  download: <path d="M12 3.5v12M7 11l5 5 5-5M4.5 20.5h15" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  home: <path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4v-9.5Z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.2 5-4.8 2 2.2-5 4.8-2Z" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 15h4" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />,
  cube: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="m12 12 8-4.5M12 12v9M12 12 4 7.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.4-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </>
  ),
  logout: <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 8l-4 4 4 4M5 12h11" />,
  wifi: (
    <>
      <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.7 16a5 5 0 0 1 6.6 0" />
      <circle cx="12" cy="19.5" r="1" />
    </>
  ),
  refresh: (
    <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4" />
  ),
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r=".8" fill="currentColor" />
    </>
  ),
  tiktok: <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2.2 4.4 5 4.7" />,
  youtube: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="m10 9.5 5 2.5-5 2.5v-5Z" fill="currentColor" />
    </>
  ),
  pause: <path d="M9 5.5v13M15 5.5v13" />,

  gem: (
    <>
      <path d="M6 3h12l3 6-9 12L3 9l3-6Z" />
      <path d="M3 9h18M9 3 7 9l5 12M15 3l2 6-5 12" />
    </>
  ),
  cross: <path d="m6 6 12 12M18 6 6 18" />,
  pdf: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </>
  ),
  mountain: <path d="m3 20 6-11 4 7 2-3 6 7H3Z" />,
  quote: (
    <path
      d="M7 7H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v-2H5V9h2Zm10 0h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v-2h-2V9h2Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  cart: (
    <>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="17" cy="20" r="1.4" />
      <path d="M3 4h2l2.2 11.2a1 1 0 0 0 1 .8h8.4a1 1 0 0 0 1-.78L20 8H6" />
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
  calcheck: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4M9 15l2 2 4-4" />
    </>
  ),
  // Home "Find what to do" tiles, landmarks and events.
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  utensils: (
    <>
      <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10" />
      <path d="M17 21V3c-2.2 1.4-3.5 4-3.5 7v3H17" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15Z" />
      <path d="M5 19 13 11" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 8a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.5a1.5 1.5 0 0 0 0 3V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2.5a1.5 1.5 0 0 0 0-3V8Z" />
      <path d="M14 7v10" strokeDasharray="2 2" />
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
  stroke = 1.8,
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
