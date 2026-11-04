/**
 * Map v3 pins (owner, Nov 2026): every map category gets its own colour and
 * a white line-icon glyph inside a teardrop with a white ring. The glyphs are
 * 24×24 stroke paths (no emoji, no sprite file): the same path is drawn into
 * the MapLibre pin (canvas `Path2D`) and as inline SVG on chips and cards.
 *
 * Keys are the real `categories.key` values the map uses. Plural / singular
 * variants (`hospitals`, `cafe`) resolve through `pinKindFor`.
 */

export const PIN_KINDS = [
  'sights',
  'activities',
  'beaches',
  'markets',
  'restaurants',
  'cafes',
  'waterfalls',
  'mosques',
  'malls',
  'hospital',
  'pharmacies',
  'spa',
  'kids-care',
  'beauty',
  'barbers',
  'generic',
] as const

export type PinKind = (typeof PIN_KINDS)[number]

export interface PinLook {
  /** Teardrop fill; white glyphs on it keep at least 3:1 contrast. */
  color: string
  /** 24×24 line-icon path, drawn with a round 2px white stroke. */
  path: string
}

const CIRCLE = (cx: number, cy: number, r: number) =>
  `M${cx + r} ${cy}a${r} ${r} 0 1 1-${2 * r} 0 ${r} ${r} 0 0 1 ${2 * r} 0z`

export const PIN_LOOK: Record<PinKind, PinLook> = {
  // monument / landmark
  sights: {
    color: '#a0561a',
    path: 'M12 2l-6 4h12zM5 10h14M7 6v4M17 6v4M4 14h16M6 10v4M18 10v4M7 14v7M17 14v7M3 21h18M10 21v-4h4v4',
  },
  // activity: a raft on waves
  activities: {
    color: '#c26a00',
    path: 'M3 18c3 0 3-2 6-2s3 2 6 2 3-2 6-2M5 13h14l-2 3H7zM12 13V5M12 5l5 4h-5',
  },
  beaches: {
    color: '#1f74b8',
    path: 'M12 4a8 8 0 0 0-8 8h16a8 8 0 0 0-8-8zM12 12l3 9M2 21h20M12 4V3',
  },
  markets: {
    color: '#7b1fa2',
    path: 'M4 8l2-5h12l2 5M4 8h16v2a3 3 0 0 1-6 0 3 3 0 0 1-4 0 3 3 0 0 1-6 0zM5 13v8h14v-8M10 21v-5h4v5',
  },
  // fork and knife
  restaurants: { color: '#d9412b', path: 'M7 2v8a2 2 0 0 0 4 0V2M9 10v12M17 2c-2 1-3 4-3 7h3v13' },
  // cup
  cafes: {
    color: '#6d4226',
    path: 'M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 11h2a2 2 0 0 1 0 4h-2M8 2v3M12 2v3',
  },
  waterfalls: {
    color: '#0b7f8c',
    path: 'M4 3h16M7 3v4c0 3 2 3 2 6s-2 3-2 6M12 3v5c0 3 2 3 2 6s-2 2-2 5M17 3v4c0 3-2 3-2 6M3 21h18',
  },
  mosques: {
    color: '#0f7a5c',
    path: 'M12 3c-3 2.2-5 4.3-5 7h10c0-2.7-2-4.8-5-7zM6 10v10h12V10M10 20v-4a2 2 0 0 1 4 0v4M12 1v2M3 20h18M3 20V8M21 20V8',
  },
  // shopping bag
  malls: { color: '#c2185b', path: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2' },
  // medical cross
  hospital: { color: '#d32f2f', path: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z' },
  // capsule pill
  pharmacies: {
    color: '#3f7d20',
    path: 'M10.6 3.6a5 5 0 0 1 7.1 7.1l-7 7a5 5 0 0 1-7.1-7.1zM7.1 7.1l7.1 7.1',
  },
  // lotus
  spa: {
    color: '#8e5bb5',
    path: 'M12 20c-2-2-3-5-3-8 0-3 1.5-5.5 3-7 1.5 1.5 3 4 3 7 0 3-1 6-3 8zM12 20c-4 0-8-2-9-7 3 0 5 1 6.5 2.5M12 20c4 0 8-2 9-7-3 0-5 1-6.5 2.5',
  },
  // child
  'kids-care': {
    color: '#3949ab',
    path: `${CIRCLE(12, 5, 2.5)}M7 11h10M12 10v5M12 15l-3 6M12 15l3 6`,
  },
  // sparkle
  beauty: {
    color: '#ad1457',
    path: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.6 1.6.7-1.6.7L19 21l-.7-1.6-1.6-.7 1.6-.7z',
  },
  // scissors
  barbers: {
    color: '#37474f',
    path: `${CIRCLE(6, 6, 3)}${CIRCLE(6, 18, 3)}M8.5 7.8L20 19M8.5 16.2L20 5`,
  },
  // pin with a dot
  generic: {
    color: '#2e5e4e',
    path: `M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z${CIRCLE(12, 10, 2.5)}`,
  },
}

/** Loose key aliases (Studio keys drift between singular and plural). */
const ALIASES: Record<string, PinKind> = {
  sight: 'sights',
  temple: 'sights',
  temples: 'sights',
  landmarks: 'sights',
  activity: 'activities',
  beach: 'beaches',
  market: 'markets',
  restaurant: 'restaurants',
  food: 'restaurants',
  cafe: 'cafes',
  waterfall: 'waterfalls',
  mosque: 'mosques',
  mall: 'malls',
  shopping: 'malls',
  hospitals: 'hospital',
  clinic: 'hospital',
  clinics: 'hospital',
  pharmacy: 'pharmacies',
  kids: 'kids-care',
  barber: 'barbers',
}

const KNOWN = new Set<string>(PIN_KINDS)

/** The pin kind of a category key; unknown keys get the generic pin. */
export function pinKindFor(categoryKey: string | null | undefined): PinKind {
  const key = (categoryKey ?? '').trim().toLowerCase()
  if (KNOWN.has(key)) return key as PinKind
  return ALIASES[key] ?? 'generic'
}

export function pinLookFor(categoryKey: string | null | undefined): PinLook {
  return PIN_LOOK[pinKindFor(categoryKey)]
}

/** MapLibre image ids: the normal pin and the larger selected one. */
export const pinImageId = (kind: PinKind, selected = false) =>
  `${selected ? 'mx-on' : 'mx-pin'}-${kind}`
