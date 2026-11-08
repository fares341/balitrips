/**
 * Contractor «places content» import — parsing and planning (pure).
 *
 * A folder handed over by the content contractor:
 *
 *   manifest.csv      slug,file,position,alt_en,alt_ar,source,credit   (position 1 = cover)
 *   descriptions.csv  slug,short_ar,short_en,short_id,long_ar,long_en,long_id
 *   images/<slug>/<slug>-N.webp
 *   missing.txt       (optional, informational)
 *
 * Nothing here touches the database or the disk; `scripts/import-place-content.ts`
 * does the IO and calls these functions, so the decisions are unit-tested.
 */

import { createHash } from 'node:crypto'

import { creditText } from '@/lib/free-photos/attribution'
import { parseCsv } from '@/lib/integrations/csv'
import { widelySharedIds, type PlacePhotoIds } from '@/lib/map/shared-media-rule'

export const LOCALES = ['ar', 'en', 'id'] as const
export type ImportLocale = (typeof LOCALES)[number]
export type LocalizedText = Partial<Record<ImportLocale, string>>

export interface ManifestImage {
  slug: string
  file: string
  position: number
  altEn: string
  altAr: string
  sourceUrl: string | null
  credit: string
  line: number
}

export interface DescriptionRow {
  slug: string
  short: LocalizedText
  long: LocalizedText
}

export interface ParseProblem {
  file: 'manifest.csv' | 'descriptions.csv'
  line: number
  message: string
}

/* ---------------------------------------------------------------------------
   CSV
   ------------------------------------------------------------------------ */

function table(
  text: string,
  file: ParseProblem['file'],
  required: readonly string[],
): { rows: { line: number; get: (col: string) => string }[]; problems: ParseProblem[] } {
  const raw = parseCsv(text)
  const problems: ParseProblem[] = []
  const header = (raw[0] ?? []).map((h) => h.trim().toLowerCase())
  const missing = required.filter((c) => !header.includes(c))
  if (missing.length > 0) {
    problems.push({ file, line: 1, message: `missing column(s): ${missing.join(', ')}` })
    return { rows: [], problems }
  }
  const index = new Map(header.map((h, i) => [h, i]))
  const rows = raw.slice(1).map((cells, i) => ({
    // Data line number (blank lines are dropped by the parser, so approximate
    // only when the file has spacer rows — good enough to find the row).
    line: i + 2,
    get: (col: string) => (cells[index.get(col) ?? -1] ?? '').trim(),
  }))
  return { rows, problems }
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(webp|jpe?g)$/i

export function parseManifest(text: string): { images: ManifestImage[]; problems: ParseProblem[] } {
  const { rows, problems } = table(text, 'manifest.csv', ['slug', 'file', 'position'])
  const images: ManifestImage[] = []
  for (const r of rows) {
    const slug = r.get('slug')
    const file = r.get('file')
    const pos = r.get('position')
    if (!SLUG.test(slug)) {
      problems.push({ file: 'manifest.csv', line: r.line, message: `bad slug "${slug}"` })
      continue
    }
    if (!SAFE_FILE.test(file)) {
      problems.push({ file: 'manifest.csv', line: r.line, message: `bad file name "${file}"` })
      continue
    }
    if (!/^\d+$/.test(pos) || Number(pos) < 1) {
      problems.push({ file: 'manifest.csv', line: r.line, message: `bad position "${pos}"` })
      continue
    }
    const source = r.get('source')
    images.push({
      slug,
      file,
      position: Number(pos),
      altEn: r.get('alt_en'),
      altAr: r.get('alt_ar'),
      sourceUrl: /^https?:\/\//i.test(source) ? source : null,
      credit: r.get('credit'),
      line: r.line,
    })
  }
  return { images, problems }
}

export function parseDescriptions(text: string): {
  rows: DescriptionRow[]
  problems: ParseProblem[]
} {
  const cols = LOCALES.flatMap((l) => [`short_${l}`, `long_${l}`])
  const { rows, problems } = table(text, 'descriptions.csv', ['slug', ...cols])
  const out: DescriptionRow[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const slug = r.get('slug')
    if (!SLUG.test(slug)) {
      problems.push({ file: 'descriptions.csv', line: r.line, message: `bad slug "${slug}"` })
      continue
    }
    if (seen.has(slug)) {
      problems.push({ file: 'descriptions.csv', line: r.line, message: `duplicate slug "${slug}"` })
      continue
    }
    seen.add(slug)
    const short: LocalizedText = {}
    const long: LocalizedText = {}
    for (const l of LOCALES) {
      if (r.get(`short_${l}`)) short[l] = r.get(`short_${l}`)
      if (r.get(`long_${l}`)) long[l] = r.get(`long_${l}`)
    }
    out.push({ slug, short, long })
  }
  return { rows: out, problems }
}

/** Group images by slug, sorted by position; one position=1 and no repeats per slug. */
export function groupImages(images: readonly ManifestImage[]): {
  bySlug: Map<string, ManifestImage[]>
  problems: ParseProblem[]
} {
  const bySlug = new Map<string, ManifestImage[]>()
  const problems: ParseProblem[] = []
  for (const img of images) {
    const list = bySlug.get(img.slug) ?? []
    list.push(img)
    bySlug.set(img.slug, list)
  }
  for (const [slug, list] of bySlug) {
    list.sort((a, b) => a.position - b.position)
    const covers = list.filter((i) => i.position === 1).length
    const positions = new Set(list.map((i) => i.position))
    const files = new Set(list.map((i) => i.file))
    let bad: string | null = null
    if (covers !== 1) bad = `${slug}: needs exactly one position=1 (found ${covers})`
    else if (positions.size !== list.length) bad = `${slug}: repeated position`
    else if (files.size !== list.length) bad = `${slug}: repeated file`
    if (bad) {
      problems.push({ file: 'manifest.csv', line: list[0]!.line, message: bad })
      bySlug.delete(slug)
    }
  }
  return { bySlug, problems }
}

/* ---------------------------------------------------------------------------
   Attribution and identity
   ------------------------------------------------------------------------ */

/** "Simon_sees (CC BY 2.0)" → author + licence; the last parenthesis is the licence. */
export function splitCredit(credit: string): { author: string | null; license: string | null } {
  const text = credit.trim()
  const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(text)
  if (!m) return { author: text === '' ? null : text, license: null }
  return { author: m[1]!.trim(), license: m[2]!.trim() }
}

export interface MediaAttribution {
  source: 'commons' | null
  author: string | null
  license: string | null
  sourceUrl: string | null
  credit: string | null
}

export function attributionFor(img: Pick<ManifestImage, 'credit' | 'sourceUrl'>): MediaAttribution {
  const { author, license } = splitCredit(img.credit)
  const commons = img.sourceUrl !== null && /(^|\.)wikimedia\.org$/i.test(hostOf(img.sourceUrl))
  let credit: string | null
  if (commons) {
    credit = creditText({
      source: 'commons',
      author,
      authorUrl: null,
      license: license ?? 'licence unknown',
      licenseUrl: null,
      sourceUrl: img.sourceUrl,
    })
  } else if (author || license || img.sourceUrl) {
    const head = [`Photo: ${author ?? 'Unknown author'}`, license].filter(Boolean).join(' · ')
    credit = img.sourceUrl ? `${head} (${img.sourceUrl})` : head
  } else credit = null
  return {
    source: commons ? 'commons' : null,
    author: author?.slice(0, 300) ?? null,
    license: license?.slice(0, 64) ?? null,
    sourceUrl: img.sourceUrl,
    credit,
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** Deterministic media id (UUIDv5-shaped) per slug+file: re-runs never duplicate. */
export function importMediaId(slug: string, file: string): string {
  const h = createHash('sha1').update(`balitrips-place-content:${slug}/${file}`).digest()
  h[6] = (h[6]! & 0x0f) | 0x50
  h[8] = (h[8]! & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

/** Studio media-library name: "<slug>-<position>". */
export function importMediaName(img: Pick<ManifestImage, 'slug' | 'position'>): string {
  return `${img.slug}-${img.position}`.slice(0, 120)
}

/* ---------------------------------------------------------------------------
   Skip rule and plan
   ------------------------------------------------------------------------ */

export interface PlaceState {
  id: string
  slug: string
  heroId: string | null
  galleryIds: readonly unknown[] | null
  description: LocalizedText | null
  detailedDescription: LocalizedText | null
}

function photoIds(p: Pick<PlaceState, 'heroId' | 'galleryIds'>): string[] {
  return [p.heroId, ...(p.galleryIds ?? [])].filter(
    (id): id is string => typeof id === 'string' && id !== '',
  )
}

/**
 * The place's own unique photos: live (non-deleted) media, not widely shared
 * (`SHARED_MIN` rule), and not one this importer created for the place.
 */
export function uniquePhotoIds(
  place: Pick<PlaceState, 'heroId' | 'galleryIds'>,
  ctx: { live: ReadonlySet<string>; shared: ReadonlySet<string>; ours: ReadonlySet<string> },
): string[] {
  return photoIds(place).filter(
    (id) => ctx.live.has(id) && !ctx.shared.has(id) && !ctx.ours.has(id),
  )
}

export { widelySharedIds, type PlacePhotoIds }

export type PhotoAction =
  | { kind: 'none' }
  | { kind: 'skip-unique'; uniqueIds: string[] }
  | { kind: 'already' }
  | {
      kind: 'assign'
      heroId: string
      galleryIds: string[]
      replacedUnique: number
    }

export interface FieldChange {
  field: 'description' | 'detailedDescription'
  locale: ImportLocale
  before: string
  after: string
}

export interface PlacePlan {
  slug: string
  placeId: string
  images: (ManifestImage & { mediaId: string })[]
  photos: PhotoAction
  descriptions: FieldChange[]
  next: { description: LocalizedText | null; detailedDescription: LocalizedText | null }
}

export interface PlanOptions {
  replaceUnique: boolean
  overwriteDescriptions: boolean
}

function mergeLocalized(
  field: FieldChange['field'],
  current: LocalizedText | null,
  incoming: LocalizedText | undefined,
  overwrite: boolean,
): { value: LocalizedText | null; changes: FieldChange[] } {
  const changes: FieldChange[] = []
  const value: LocalizedText = { ...(current ?? {}) }
  for (const locale of LOCALES) {
    const after = incoming?.[locale]?.trim() ?? ''
    if (after === '') continue
    const before = typeof value[locale] === 'string' ? value[locale]!.trim() : ''
    if (before === after) continue
    if (before !== '' && !overwrite) continue
    value[locale] = after
    changes.push({ field, locale, before, after })
  }
  return { value: changes.length > 0 ? value : current, changes }
}

export function planPlace(
  place: PlaceState,
  images: readonly ManifestImage[],
  description: DescriptionRow | undefined,
  ctx: { live: ReadonlySet<string>; shared: ReadonlySet<string> },
  options: PlanOptions,
): PlacePlan {
  const withIds = images.map((img) => ({ ...img, mediaId: importMediaId(img.slug, img.file) }))
  const ours = new Set(withIds.map((i) => i.mediaId))

  let photos: PhotoAction = { kind: 'none' }
  if (withIds.length > 0) {
    const heroId = withIds[0]!.mediaId
    const galleryIds = withIds.slice(1).map((i) => i.mediaId)
    const current = photoIds(place)
    const unique = uniquePhotoIds(place, { ...ctx, ours })
    if (
      place.heroId === heroId &&
      current.length === withIds.length &&
      galleryIds.every((id, i) => (place.galleryIds ?? [])[i] === id)
    ) {
      photos = { kind: 'already' }
    } else if (unique.length > 0 && !options.replaceUnique) {
      photos = { kind: 'skip-unique', uniqueIds: unique }
    } else {
      photos = { kind: 'assign', heroId, galleryIds, replacedUnique: unique.length }
    }
  }

  const short = mergeLocalized(
    'description',
    place.description,
    description?.short,
    options.overwriteDescriptions,
  )
  const long = mergeLocalized(
    'detailedDescription',
    place.detailedDescription,
    description?.long,
    options.overwriteDescriptions,
  )

  return {
    slug: place.slug,
    placeId: place.id,
    images: withIds,
    photos,
    descriptions: [...short.changes, ...long.changes],
    next: { description: short.value, detailedDescription: long.value },
  }
}

/** One line for the dry-run / apply log. */
export function describePlan(plan: PlacePlan): string {
  const p = plan.photos
  const photo =
    p.kind === 'none'
      ? 'photos: -'
      : p.kind === 'already'
        ? `photos: already imported (${plan.images.length})`
        : p.kind === 'skip-unique'
          ? `photos: SKIP (has ${p.uniqueIds.length} unique photo(s); --replace-unique to override)`
          : `photos: set hero + ${p.galleryIds.length} gallery${p.replacedUnique > 0 ? ` (replaces ${p.replacedUnique} unique)` : ''}`
  const d = plan.descriptions
  const desc =
    d.length === 0
      ? 'text: -'
      : `text: ${d.map((c) => `${c.field === 'description' ? 'short' : 'long'}.${c.locale}${c.before ? '*' : ''}`).join(' ')}`
  return `${photo} | ${desc}`
}
