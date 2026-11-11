/**
 * «New places» import — parsing, validation, dedup and region choice (pure).
 *
 * The folder an external researcher hands over (free map sections:
 * mosques, hospital, markets, malls):
 *
 *   places.csv   slug,category_key,name_en,name_ar,name_id,lat,lon,maps_link,address,area,
 *                phone,website,opening_hours,short_ar,short_en,short_id,long_ar,long_en,long_id,
 *                image_sources
 *   images/<slug>/<slug>-N.webp   (-1 = cover)
 *   missing.txt  (informational)
 *
 * Nothing here touches the database or the disk; `scripts/import-new-places.ts`
 * does the IO and calls these functions.
 */

import { haversineKm, type LatLon } from '@/lib/geo'
import { parseCsv } from '@/lib/integrations/csv'

import type { LocalizedText } from './plan'

export const NEW_PLACE_CATEGORIES = ['mosques', 'hospital', 'markets', 'malls'] as const
export type NewPlaceCategory = (typeof NEW_PLACE_CATEGORIES)[number]

/** The brief's Bali box (whole island + Nusa islands). */
export const IMPORT_BOUNDS = { minLat: -8.95, maxLat: -8.0, minLon: 114.4, maxLon: 115.75 }

/** Two places closer than this with similar names are the same place. */
export const DEDUP_RADIUS_M = 120

export const PLACES_COLUMNS = [
  'slug',
  'category_key',
  'name_en',
  'name_ar',
  'name_id',
  'lat',
  'lon',
  'maps_link',
  'address',
  'area',
  'phone',
  'website',
  'opening_hours',
  'short_ar',
  'short_en',
  'short_id',
  'long_ar',
  'long_en',
  'long_id',
  'image_sources',
] as const

export interface NewPlaceRow {
  line: number
  slug: string
  categoryKey: NewPlaceCategory
  name: { en: string; ar: string; id: string }
  lat: number
  lon: number
  mapsLink: string
  address: string
  area: string
  phone: string
  website: string
  openingHours: string
  short: LocalizedText
  long: LocalizedText
  imageSources: string[]
}

export interface InvalidRow {
  line: number
  slug: string
  categoryKey: string
  reason: string
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/

function isNewPlaceCategory(v: string): v is NewPlaceCategory {
  return (NEW_PLACE_CATEGORIES as readonly string[]).includes(v)
}

/** Parse and validate places.csv. Invalid rows are returned with a reason, never thrown. */
export function parsePlacesCsv(text: string): {
  rows: NewPlaceRow[]
  invalid: InvalidRow[]
  headerProblem: string | null
} {
  const raw = parseCsv(text)
  const header = (raw[0] ?? []).map((h) => h.trim().toLowerCase())
  const required = ['slug', 'category_key', 'name_en', 'lat', 'lon']
  const missing = required.filter((c) => !header.includes(c))
  if (missing.length > 0)
    return { rows: [], invalid: [], headerProblem: `missing column(s): ${missing.join(', ')}` }
  const index = new Map(header.map((h, i) => [h, i]))

  const rows: NewPlaceRow[] = []
  const invalid: InvalidRow[] = []
  const seen = new Set<string>()
  raw.slice(1).forEach((cells, i) => {
    const line = i + 2
    const get = (col: string) => (cells[index.get(col) ?? -1] ?? '').trim()
    const slug = get('slug').toLowerCase()
    const categoryKey = get('category_key').toLowerCase()
    const bad = (reason: string) => invalid.push({ line, slug, categoryKey, reason })

    if (!SLUG.test(slug) || slug.length > 120) return bad('invalid slug')
    if (seen.has(slug)) return bad('duplicate slug in places.csv')
    seen.add(slug)
    if (!isNewPlaceCategory(categoryKey))
      return bad(`unknown category_key "${categoryKey}" (want ${NEW_PLACE_CATEGORIES.join('/')})`)
    const nameEn = get('name_en')
    if (nameEn === '') return bad('name_en is empty')
    const lat = Number.parseFloat(get('lat'))
    const lon = Number.parseFloat(get('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return bad('lat/lon not numbers')
    if (
      lat < IMPORT_BOUNDS.minLat ||
      lat > IMPORT_BOUNDS.maxLat ||
      lon < IMPORT_BOUNDS.minLon ||
      lon > IMPORT_BOUNDS.maxLon
    )
      return bad(`lat/lon ${lat},${lon} outside Bali`)

    rows.push({
      line,
      slug,
      categoryKey,
      name: {
        en: nameEn.slice(0, 200),
        ar: get('name_ar').slice(0, 200),
        id: get('name_id').slice(0, 200),
      },
      lat,
      lon,
      mapsLink: get('maps_link'),
      address: get('address'),
      area: get('area'),
      phone: get('phone'),
      website: get('website'),
      openingHours: get('opening_hours'),
      short: { ar: get('short_ar'), en: get('short_en'), id: get('short_id') },
      long: { ar: get('long_ar'), en: get('long_en'), id: get('long_id') },
      imageSources: get('image_sources')
        .split('|')
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//i.test(s)),
    })
  })
  return { rows, invalid, headerProblem: null }
}

/* ---------------------------------------------------------------------------
   Images
   ------------------------------------------------------------------------ */

export interface FolderImage {
  file: string
  position: number
}

/** `<slug>-N.webp|jpg` files of one place folder, ordered by N (lowest = cover). */
export function pickPlaceImages(slug: string, files: readonly string[]): FolderImage[] {
  const re = new RegExp(`^${slug.replace(/[-]/g, '\\-')}-(\\d{1,2})\\.(webp|jpe?g)$`, 'i')
  const out: FolderImage[] = []
  for (const file of files) {
    const m = re.exec(file)
    if (m) out.push({ file, position: Number(m[1]) })
  }
  return out.sort((a, b) => a.position - b.position).slice(0, 24)
}

/* ---------------------------------------------------------------------------
   Name matching
   ------------------------------------------------------------------------ */

/** Words that say what a place IS, not which one: ignored when comparing names. */
const GENERIC = new Set([
  'the',
  'of',
  'and',
  'di',
  'dan',
  'bali',
  'indonesia',
  'masjid',
  'mosque',
  'musholla',
  'mushola',
  'musala',
  'musholah',
  'mushala',
  'surau',
  'hospital',
  'rumah',
  'sakit',
  'rs',
  'rsu',
  'rsud',
  'rsia',
  'klinik',
  'clinic',
  'medical',
  'centre',
  'center',
  'international',
  'pasar',
  'market',
  'mall',
  'plaza',
  'shopping',
  'مسجد',
  'جامع',
  'مستشفى',
  'مستوصف',
  'عيادة',
  'سوق',
  'مول',
  'مركز',
  'بالي',
])

export function normaliseName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ْـ]/g, '') // Arabic harakat + tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function nameTokens(name: string): string[] {
  const all = normaliseName(name).split(' ').filter(Boolean)
  const specific = all.filter((t) => !GENERIC.has(t))
  return specific.length > 0 ? specific : all
}

/** Same place by name: one contains the other, or half the specific words overlap. */
export function similarNames(a: string, b: string): boolean {
  const na = normaliseName(a)
  const nb = normaliseName(b)
  if (na === '' || nb === '') return false
  if (na === nb) return true
  const ta = nameTokens(a)
  const tb = nameTokens(b)
  const ja = ta.join(' ')
  const jb = tb.join(' ')
  if (ja.length >= 4 && jb.length >= 4 && (ja.includes(jb) || jb.includes(ja))) return true
  const setB = new Set(tb)
  const common = new Set(ta.filter((t) => setB.has(t))).size
  return common > 0 && common / Math.min(new Set(ta).size, setB.size) >= 0.5
}

/* ---------------------------------------------------------------------------
   Dedup
   ------------------------------------------------------------------------ */

export interface ExistingPlace {
  id: string
  slug: string
  categoryKey: string | null
  name: Partial<Record<'en' | 'ar' | 'id', string>>
  lat: number
  lon: number
}

export type DedupResult =
  | { kind: 'matched'; place: ExistingPlace; distanceM: number; sameCategory: boolean }
  | { kind: 'conflict'; place: ExistingPlace; distanceM: number }
  | { kind: 'new' }

const metres = (a: LatLon, b: LatLon) => haversineKm(a, b) * 1000

function namesMatch(row: Pick<NewPlaceRow, 'name'>, place: ExistingPlace): boolean {
  const ours = [row.name.en, row.name.id, row.name.ar].filter(Boolean)
  const theirs = [place.name.en, place.name.id, place.name.ar].filter((s): s is string => !!s)
  return ours.some((a) => theirs.some((b) => similarNames(a, b)))
}

/**
 * An existing place within DEDUP_RADIUS_M with a similar name (same category
 * preferred, then any) is the same place. Otherwise, if the slug is taken by
 * a place that is not this one, it is a slug conflict.
 */
export function findExisting(
  row: Pick<NewPlaceRow, 'slug' | 'categoryKey' | 'name' | 'lat' | 'lon'>,
  existing: readonly ExistingPlace[],
): DedupResult {
  let best: { place: ExistingPlace; d: number; same: boolean } | null = null
  for (const place of existing) {
    const d = metres(row, place)
    if (d > DEDUP_RADIUS_M || !namesMatch(row, place)) continue
    const same = place.categoryKey === row.categoryKey
    if (best === null || (same && !best.same) || (same === best.same && d < best.d))
      best = { place, d, same }
  }
  if (best)
    return {
      kind: 'matched',
      place: best.place,
      distanceM: Math.round(best.d),
      sameCategory: best.same,
    }
  const taken = existing.find((p) => p.slug === row.slug)
  if (taken) return { kind: 'conflict', place: taken, distanceM: Math.round(metres(row, taken)) }
  return { kind: 'new' }
}

/** First free `<slug>-<area>` / `<slug>-N` (max 128 chars). */
export function suffixedSlug(slug: string, area: string, taken: ReadonlySet<string>): string {
  const areaPart = normaliseName(area).replace(/ /g, '-')
  const candidates = [areaPart && !slug.endsWith(areaPart) ? `${slug}-${areaPart}` : '']
  for (let n = 2; n < 100; n++) candidates.push(`${slug}-${n}`)
  for (const c of candidates) if (c && c.length <= 128 && !taken.has(c)) return c
  throw new Error(`no free slug for ${slug}`)
}

/* ---------------------------------------------------------------------------
   Region
   ------------------------------------------------------------------------ */

export interface RegionRef {
  id: string
  key: string
  label: Partial<Record<'en' | 'ar' | 'id', string>>
  centerLat: number | null
  centerLon: number | null
  radiusKm: number | null
}

/**
 * Region for a new place: the researcher's `area` when it names a region
 * (key or label), else the smallest region whose circle contains the point,
 * else none (left for Studio).
 */
export function regionFor(
  point: LatLon,
  area: string,
  regions: readonly RegionRef[],
): RegionRef | null {
  const a = normaliseName(area)
  if (a !== '') {
    const byName = regions.find(
      (r) =>
        normaliseName(r.key.replace(/-/g, ' ')) === a ||
        [r.label.en, r.label.id, r.label.ar].some((l) => l && normaliseName(l) === a),
    )
    if (byName) return byName
  }
  let best: { r: RegionRef; radius: number } | null = null
  for (const r of regions) {
    if (r.centerLat === null || r.centerLon === null || r.radiusKm === null || r.radiusKm <= 0)
      continue
    if (haversineKm(point, { lat: r.centerLat, lon: r.centerLon }) > r.radiusKm) continue
    if (best === null || r.radiusKm < best.radius) best = { r, radius: r.radiusKm }
  }
  return best?.r ?? null
}

/* ---------------------------------------------------------------------------
   Text fields
   ------------------------------------------------------------------------ */

/** Fill empty locales only (or every given locale with overwrite). */
export function mergeLocalized(
  current: LocalizedText | null | undefined,
  incoming: LocalizedText,
  overwrite: boolean,
): { next: { ar: string; en: string; id: string }; changed: boolean } {
  const next = { ar: current?.ar ?? '', en: current?.en ?? '', id: current?.id ?? '' }
  let changed = false
  for (const loc of ['ar', 'en', 'id'] as const) {
    const v = incoming[loc]?.trim() ?? ''
    if (v === '' || v === next[loc]) continue
    if (next[loc].trim() === '' || overwrite) {
      next[loc] = v
      changed = true
    }
  }
  return { next, changed }
}

/** Contact details have no columns on map_places: kept in internal notes (never sent to clients). */
export function internalNotesFor(row: NewPlaceRow): string {
  return [
    'Imported by scripts/import-new-places.ts',
    row.area && `Area: ${row.area}`,
    row.address && `Address: ${row.address}`,
    row.phone && `Phone: ${row.phone}`,
    row.website && `Website: ${row.website}`,
    row.mapsLink && `Google Maps: ${row.mapsLink}`,
    row.openingHours.length > 64 && `Opening hours: ${row.openingHours}`,
    row.imageSources.length > 0 && `Image sources: ${row.imageSources.join(' | ')}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** CSV cell escaping for the report. */
export function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
