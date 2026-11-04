/**
 * Map v2 (owner, Nov 2026) — the pure half of the three-step map:
 * area → 1–3 categories → results. No database, no React, so every rule is
 * unit-tested (`explore.test.ts`).
 *
 * Nothing here carries a locked place's id, name, image or coordinate: the
 * area index is counts per (region, category) only, and `toResultPlace`
 * is only ever called for places the viewer may open.
 */

import type { IconName } from '@/components/ui/icon'

/**
 * How many categories one search may hold. Map v3 (reference UX, Nov 2026):
 * the map opens on every open type and the Categories sheet is a plain
 * multi-select, so this is only a sanity bound for URLs.
 */
export const MAX_CATEGORIES = 24

/** The "whole island" area. */
export const ALL_AREA = 'all'

/** One page of results from `/api/map/places`. */
export const PAGE_SIZE = 120

/** The top-level directions, in the order the concept lists them. */
export const DIRECTION_ORDER = ['south', 'central', 'north', 'east', 'west', 'islands'] as const

// ---------------------------------------------------------------------------
// Category look (pin colour + glyph)
// ---------------------------------------------------------------------------

export interface CategoryStyle {
  color: string
  icon: IconName
}

/**
 * The concept's colour/icon guide. Studio values (`categories.map_color`,
 * `categories.icon`) win; these fill the gaps, matched loosely by key so
 * `hospital` / `hospitals` / `clinics` all read as the red cross.
 */
const STYLE_RULES: readonly [RegExp, CategoryStyle][] = [
  [/restaurant|food|dining/, { color: '#E07A1F', icon: 'food' }],
  [/cafe|coffee/, { color: '#2F6FB5', icon: 'coffee' }],
  [/beach|surf/, { color: '#1A9E97', icon: 'wave' }],
  [/mall|shop|market/, { color: '#B5452A', icon: 'bag' }],
  [/hospital|clinic|pharma/, { color: '#D2342F', icon: 'cross' }],
  [/sight|temple|landmark|culture/, { color: '#8A5A3B', icon: 'temple' }],
  [/spa|massage|wellness|beauty/, { color: '#7A4FB0', icon: 'leaf' }],
  [/waterfall/, { color: '#1F3F7A', icon: 'drop' }],
  [/activit|adventure/, { color: '#2E7D4F', icon: 'bolt' }],
  [/kid|nurser/, { color: '#C2577A', icon: 'users' }],
  [/barber/, { color: '#55606E', icon: 'user' }],
]

const FALLBACK_STYLE: CategoryStyle = { color: '#2E5E4E', icon: 'pin' }

const HEX = /^#[0-9a-fA-F]{6}$/

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

export function defaultCategoryStyle(key: string): CategoryStyle {
  const k = key.toLowerCase()
  for (const [pattern, style] of STYLE_RULES) if (pattern.test(k)) return style
  return FALLBACK_STYLE
}

export function categoryStyle(
  key: string,
  stored: { color: string | null; icon: string | null },
  isIcon: (name: string) => name is IconName,
): CategoryStyle {
  const base = defaultCategoryStyle(key)
  return {
    color: isHexColor(stored.color) ? stored.color : base.color,
    icon: stored.icon !== null && isIcon(stored.icon) ? stored.icon : base.icon,
  }
}

// ---------------------------------------------------------------------------
// Selection (URL ⇄ state)
// ---------------------------------------------------------------------------

export interface Selection {
  /** `all`, a direction key (south…) or an area key (seminyak…). */
  area: string | null
  categories: string[]
}

/** Category aliases used by older links (`?cat=hospitals`). */
const CATEGORY_ALIASES: Record<string, string[]> = {
  hospitals: ['hospital'],
  hospital: ['hospitals'],
  rest: ['restaurants'],
  restaurant: ['restaurants'],
  cafe: ['cafes'],
  beach: ['beaches'],
  mall: ['malls'],
  sight: ['sights'],
  waterfall: ['waterfalls'],
}

const SAFE_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/

/** Resolves a requested key to a known one (exact first, then an alias). */
export function resolveKey(raw: string, known: ReadonlySet<string>): string | null {
  const key = raw.trim().toLowerCase()
  if (!SAFE_KEY.test(key)) return null
  if (known.has(key)) return key
  for (const alt of CATEGORY_ALIASES[key] ?? []) if (known.has(alt)) return alt
  return null
}

/**
 * Reads `?area=&cat=a,b` (and the legacy `?region=`) against the known keys.
 * Unknown keys are dropped, duplicates removed, at most three categories.
 * A category link with no area means the whole island (free-guide cards).
 */
export function parseSelection(
  params: { area?: string | null; region?: string | null; cat?: string | null },
  knownAreas: ReadonlySet<string>,
  knownCategories: ReadonlySet<string>,
): Selection {
  const rawArea = params.area ?? params.region ?? null
  let area: string | null = null
  if (rawArea !== null) {
    const key = rawArea.trim().toLowerCase()
    if (key === ALL_AREA) area = ALL_AREA
    else if (SAFE_KEY.test(key) && knownAreas.has(key)) area = key
  }
  const categories: string[] = []
  for (const part of (params.cat ?? '').split(',')) {
    const key = resolveKey(part, knownCategories)
    if (key !== null && !categories.includes(key)) categories.push(key)
    if (categories.length === MAX_CATEGORIES) break
  }
  if (area === null && categories.length > 0) area = ALL_AREA
  return { area, categories }
}

export function selectionQuery(selection: Selection): string {
  const params = new URLSearchParams()
  if (selection.area !== null) params.set('area', selection.area)
  if (selection.categories.length > 0) params.set('cat', selection.categories.join(','))
  const query = params.toString().replace(/%2C/g, ',')
  return query === '' ? '' : `?${query}`
}

/** Which step a selection lands on. */
export function stepOf(selection: Selection): 1 | 2 | 3 {
  if (selection.area === null) return 1
  if (selection.categories.length === 0) return 2
  return 3
}

/**
 * Toggles a category. Returns `full` (and changes nothing) for a fourth one —
 * the UI shows the inline hint instead of greying anything out.
 */
export function toggleCategory(
  current: readonly string[],
  key: string,
): { next: string[]; full: boolean } {
  if (current.includes(key)) return { next: current.filter((one) => one !== key), full: false }
  if (current.length >= MAX_CATEGORIES) return { next: [...current], full: true }
  return { next: [...current, key], full: false }
}

// ---------------------------------------------------------------------------
// Areas and counts
// ---------------------------------------------------------------------------

/** What the server knows about one place's position in the taxonomy. */
export interface PlaceKeys {
  regionKey: string | null
  parentRegionKey: string | null
  categoryKey: string | null
}

export function inArea(place: PlaceKeys, area: string): boolean {
  if (area === ALL_AREA) return true
  return place.regionKey === area || place.parentRegionKey === area
}

/** One aggregate row: how many places of a category sit in a region. */
export type CountRow = [regionKey: string, parentKey: string | null, categoryKey: string, n: number]

/** Counts per (region, category) — the only thing the step screens need. */
export function countRows(places: readonly PlaceKeys[]): CountRow[] {
  const map = new Map<string, CountRow>()
  for (const place of places) {
    if (place.categoryKey === null) continue
    const region = place.regionKey ?? place.parentRegionKey
    if (region === null) continue
    const parent = place.regionKey === null ? null : place.parentRegionKey
    const id = `${region}|${parent ?? ''}|${place.categoryKey}`
    const row = map.get(id)
    if (row) row[3] += 1
    else map.set(id, [region, parent, place.categoryKey, 1])
  }
  return [...map.values()]
}

/** Places per category inside an area. */
export function categoryCounts(rows: readonly CountRow[], area: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const [region, parent, category, n] of rows) {
    if (area !== ALL_AREA && region !== area && parent !== area) continue
    out.set(category, (out.get(category) ?? 0) + n)
  }
  return out
}

/** Places in an area (every category). */
export function areaTotal(rows: readonly CountRow[], area: string): number {
  let total = 0
  for (const n of categoryCounts(rows, area).values()) total += n
  return total
}

export interface AreaOption {
  key: string
  label: Record<string, string>
  /** null for a direction (south…); the direction's key for an area. */
  parentKey: string | null
  count: number
  /** Up to three category keys with the most places here (card subtitle). */
  top: string[]
}

/**
 * Directions and areas that hold at least one place, in the admin's order
 * (directions in the concept's order first). Empty ones are never offered.
 */
export function areaOptions(
  regions: readonly { key: string; label: Record<string, string>; parentKey: string | null }[],
  rows: readonly CountRow[],
  categoryOrder: readonly string[],
): AreaOption[] {
  const order = new Map(categoryOrder.map((key, index) => [key, index]))
  const out: AreaOption[] = []
  for (const region of regions) {
    const counts = categoryCounts(rows, region.key)
    let count = 0
    for (const [key, n] of counts) if (order.has(key)) count += n
    if (count === 0) continue
    const top = [...counts]
      .filter(([key]) => order.has(key))
      .sort((a, b) => b[1] - a[1] || (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
      .slice(0, 3)
      .map(([key]) => key)
    out.push({ key: region.key, label: region.label, parentKey: region.parentKey, count, top })
  }
  const rank = (key: string) => {
    const index = (DIRECTION_ORDER as readonly string[]).indexOf(key)
    return index === -1 ? DIRECTION_ORDER.length : index
  }
  const directions = out.filter((one) => one.parentKey === null)
  directions.sort((a, b) => rank(a.key) - rank(b.key))
  return [...directions, ...out.filter((one) => one.parentKey !== null)]
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** What the results map and card receive for one (open) place. Compact on purpose. */
export interface ResultPlace {
  id: string
  slug: string
  name: string
  categoryKey: string
  lat: number
  lon: number
  rating: number | null
  /** Review count of the linked activity (the place itself keeps none). */
  reviews: number | null
  /** One short line (two at most on the card). */
  desc: string | null
  /** A small image rung (~320px) for the card thumbnail. */
  thumb: string | null
  /** Up to three real image URLs, hero first, no duplicates (desktop card). */
  images: string[]
  /** «From» price: the linked live activity's price. Null = no real price. */
  priceMinor: number | null
  currency: string | null
  activitySlug: string | null
  canFavorite: boolean
}

// ---------------------------------------------------------------------------
// Traveler type + duration (migration 0039)
// ---------------------------------------------------------------------------

/** The traveler types Studio offers, in display order. */
export const TRAVELER_TYPES = ['families', 'couples', 'friends', 'solo', 'kids'] as const
export type TravelerType = (typeof TRAVELER_TYPES)[number]

export function isTravelerType(value: unknown): value is TravelerType {
  return typeof value === 'string' && (TRAVELER_TYPES as readonly string[]).includes(value)
}

/** Duration buckets: up to 2 h, 2–4 h, more than 4 h. */
export const DURATION_BUCKETS = ['short', 'half', 'full'] as const
export type DurationBucket = (typeof DURATION_BUCKETS)[number]

export function isDurationBucket(value: unknown): value is DurationBucket {
  return typeof value === 'string' && (DURATION_BUCKETS as readonly string[]).includes(value)
}

export function durationBucket(minutes: number | null | undefined): DurationBucket | null {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) {
    return null
  }
  if (minutes <= 120) return 'short'
  if (minutes <= 240) return 'half'
  return 'full'
}

/** Clean a stored/typed traveler list: known values, unique, display order. */
export function cleanTravelerTypes(values: readonly unknown[] | null | undefined): TravelerType[] {
  if (!values) return []
  const set = new Set(values.filter(isTravelerType))
  return TRAVELER_TYPES.filter((one) => set.has(one))
}

export interface PlaceFacts {
  travelerTypes: readonly string[] | null
  durationMinutes: number | null
}

/**
 * Which traveler types and duration buckets exist in the data at all. The
 * map shows a filter chip only for values some place really has.
 */
export function facetOptions(places: readonly PlaceFacts[]): {
  travelers: TravelerType[]
  durations: DurationBucket[]
} {
  const travelers = new Set<string>()
  const durations = new Set<string>()
  for (const place of places) {
    for (const one of cleanTravelerTypes(place.travelerTypes)) travelers.add(one)
    const bucket = durationBucket(place.durationMinutes)
    if (bucket) durations.add(bucket)
  }
  return {
    travelers: TRAVELER_TYPES.filter((one) => travelers.has(one)),
    durations: DURATION_BUCKETS.filter((one) => durations.has(one)),
  }
}

export interface FactFilter {
  travelers: readonly TravelerType[]
  durations: readonly DurationBucket[]
}

/** Reads `?traveler=a,b&dur=short,half` to known values. */
export function parseFactFilter(params: {
  traveler?: string | null
  dur?: string | null
}): FactFilter {
  const split = (raw: string | null | undefined) =>
    (raw ?? '')
      .split(',')
      .map((one) => one.trim().toLowerCase())
      .filter(Boolean)
  return {
    travelers: TRAVELER_TYPES.filter((one) => split(params.traveler).includes(one)),
    durations: DURATION_BUCKETS.filter((one) => split(params.dur).includes(one)),
  }
}

/** A place passes when it matches ANY chosen value of each active filter. */
export function matchesFacts(place: PlaceFacts, filter: FactFilter): boolean {
  if (filter.travelers.length > 0) {
    const mine = cleanTravelerTypes(place.travelerTypes)
    if (!mine.some((one) => filter.travelers.includes(one))) return false
  }
  if (filter.durations.length > 0) {
    const bucket = durationBucket(place.durationMinutes)
    if (bucket === null || !filter.durations.includes(bucket)) return false
  }
  return true
}

/** A short card line: whitespace collapsed, cut at a word near `max`. */
export function shortText(text: string | null | undefined, max = 140): string | null {
  if (!text) return null
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat === '') return null
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:،]+$/, '')}…`
}

/** Places ordered by distance from a point (stable for ties). */
export function byDistance<T extends { lat: number; lon: number }>(
  places: readonly T[],
  from: { lat: number; lon: number },
): T[] {
  return places
    .map((place, index) => ({ place, index, d: distanceMeters(from, place) }))
    .sort((a, b) => a.d - b.d || a.index - b.index)
    .map((one) => one.place)
}

/** The window of indexes to render around `center` (carousel virtualisation). */
export function windowRange(total: number, center: number, radius = 10): [number, number] {
  if (total <= 0) return [0, 0]
  const c = Math.max(0, Math.min(total - 1, center))
  let start = Math.max(0, c - radius)
  let end = Math.min(total, c + radius + 1)
  const want = Math.min(total, radius * 2 + 1)
  if (end - start < want) {
    if (start === 0) end = Math.min(total, want)
    else start = Math.max(0, total - want)
  }
  return [start, end]
}

/** GeoJSON for the clustered marker source (open places only). */
export function toFeatureCollection(places: readonly ResultPlace[]): {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    id: number
    /** `s`: draw order — southern pins over northern ones. */
    properties: { id: string; i: number; s: number }
    geometry: { type: 'Point'; coordinates: [number, number] }
  }[]
} {
  return {
    type: 'FeatureCollection',
    features: places.map((place, i) => ({
      type: 'Feature',
      id: i,
      properties: { id: place.id, i, s: -place.lat },
      geometry: { type: 'Point', coordinates: [place.lon, place.lat] },
    })),
  }
}

export function cardImages(hero: string | null, gallery: readonly string[]): string[] {
  const out: string[] = []
  for (const url of [hero, ...gallery]) {
    if (url === null || url === '' || out.includes(url)) continue
    out.push(url)
    if (out.length === 3) break
  }
  return out
}

/**
 * Filters the server's place list to the selection and splits it into what
 * the viewer may open and how many are locked. Locked places only add to the
 * count; their fields never leave this function.
 */
export function selectPlaces<
  T extends PlaceKeys & { categoryKey: string | null; lat: number; lon: number },
>(
  places: readonly T[],
  selection: { area: string; categories: readonly string[] },
  canOpen: (place: T) => boolean,
): { open: T[]; lockedCount: number } {
  const wanted = new Set(selection.categories)
  const open: T[] = []
  let lockedCount = 0
  for (const place of places) {
    if (place.categoryKey === null || !wanted.has(place.categoryKey)) continue
    if (!inArea(place, selection.area)) continue
    if (canOpen(place)) open.push(place)
    else lockedCount += 1
  }
  return { open, lockedCount }
}

/** Bounds of a list of points with a small minimum span (one pin still frames). */
export function boundsOf(
  points: readonly { lat: number; lon: number }[],
): [[number, number], [number, number]] | null {
  if (points.length === 0) return null
  let w = Infinity
  let e = -Infinity
  let s = Infinity
  let n = -Infinity
  for (const p of points) {
    w = Math.min(w, p.lon)
    e = Math.max(e, p.lon)
    s = Math.min(s, p.lat)
    n = Math.max(n, p.lat)
  }
  const pad = 0.004
  if (e - w < pad * 2) {
    w -= pad
    e += pad
  }
  if (n - s < pad * 2) {
    s -= pad
    n += pad
  }
  return [
    [w, s],
    [e, n],
  ]
}

// ---------------------------------------------------------------------------
// Clustering (screen space)
// ---------------------------------------------------------------------------

export interface ScreenPoint {
  id: string
  x: number
  y: number
}

export interface Cluster {
  ids: string[]
  x: number
  y: number
}

/**
 * Groups pins that would truly overlap on screen (closer than `radius` px).
 * Greedy, deterministic (input order). A group of one is a plain pin; the
 * selected pin is never folded into a cluster.
 */
export function clusterPoints(
  points: readonly ScreenPoint[],
  radius: number,
  keepAlone: string | null = null,
): Cluster[] {
  const clusters: (Cluster & { sx: number; sy: number })[] = []
  const r2 = radius * radius
  for (const point of points) {
    if (point.id === keepAlone) {
      clusters.push({ ids: [point.id], x: point.x, y: point.y, sx: point.x, sy: point.y })
      continue
    }
    let joined = false
    for (const cluster of clusters) {
      if (cluster.ids.includes(keepAlone ?? '\u0000')) continue
      const dx = cluster.x - point.x
      const dy = cluster.y - point.y
      if (dx * dx + dy * dy < r2) {
        cluster.ids.push(point.id)
        cluster.sx += point.x
        cluster.sy += point.y
        cluster.x = cluster.sx / cluster.ids.length
        cluster.y = cluster.sy / cluster.ids.length
        joined = true
        break
      }
    }
    if (!joined)
      clusters.push({ ids: [point.id], x: point.x, y: point.y, sx: point.x, sy: point.y })
  }
  return clusters.map(({ ids, x, y }) => ({ ids, x, y }))
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Great-circle distance in metres. */
export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function directionsUrl(place: { lat: number; lon: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`
}

/** The remembered selection (localStorage), validated like a URL. */
export const STORAGE_KEY = 'bt-map-v2'

/**
 * Carousel order (map v3): start at the first place (the server's priority
 * order) and always step to the nearest unvisited one, so swiping to the
 * next card moves the map a short way instead of across the island.
 * O(n²); n is a few hundred at most.
 */
export function nearestChain<T extends { lat: number; lon: number }>(places: readonly T[]): T[] {
  if (places.length < 3) return [...places]
  const left = places.slice(1)
  const out: T[] = [places[0]!]
  let here = places[0]!
  while (left.length > 0) {
    let best = 0
    let bestD = Infinity
    const cos = Math.cos((here.lat * Math.PI) / 180)
    for (let i = 0; i < left.length; i += 1) {
      const p = left[i]!
      const dx = (p.lon - here.lon) * cos
      const dy = p.lat - here.lat
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    here = left.splice(best, 1)[0]!
    out.push(here)
  }
  return out
}

/** `?area=&cat=&traveler=&dur=` for the map v3 URL (defaults left out). */
export function mapQuery(selection: Selection, facts: FactFilter): string {
  const params = new URLSearchParams()
  if (selection.area !== null && selection.area !== ALL_AREA) params.set('area', selection.area)
  if (selection.categories.length > 0) params.set('cat', selection.categories.join(','))
  if (facts.travelers.length > 0) params.set('traveler', facts.travelers.join(','))
  if (facts.durations.length > 0) params.set('dur', facts.durations.join(','))
  const query = params.toString().replace(/%2C/g, ',')
  return query === '' ? '' : `?${query}`
}
