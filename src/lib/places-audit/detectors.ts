/**
 * «تدقيق الأماكن» — pure duplicate / data-problem detectors for map places.
 *
 * No database, no I/O: the Studio page (`studio/places/audit`) and the
 * offline scripts feed rows in and get findings out, so the same rules run
 * against the production DB, a local DB and the public API alike. Nothing
 * here ever changes a place — the owner fixes or archives in the editor.
 */

/** Bali (incl. Nusa Penida / Lembongan / Menjangan) with a little margin. */
export const BALI_BBOX = { minLat: -8.95, maxLat: -8.04, minLon: 114.4, maxLon: 115.75 } as const

/** Two places of one category closer than this are probably the same place. */
export const NEAR_METRES = 75

/** dHash bits that may differ for two photos to count as «the same picture». */
export const NEAR_HASH_BITS = 4

export const AUDIT_LOCALES = ['ar', 'en', 'id'] as const
export type AuditLocale = (typeof AUDIT_LOCALES)[number]

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * A comparison key for a place name: case-, diacritics- and punctuation-
 * insensitive, in Latin and Arabic script.
 *
 *  - NFKD + drop combining marks: «Café Tegallalang» = «cafe tegallalang».
 *  - Arabic: harakat, tanween, superscript alef and tatweel dropped;
 *    أ إ آ ٱ → ا, ى → ي, ة → ه, ؤ → و, ئ → ي.
 *  - Arabic-Indic digits → Latin; punctuation → space; spaces collapsed.
 */
export function normaliseName(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[ـ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export interface NamedItem {
  id: string
  /** Per-locale names; any locale may be missing. */
  name: Partial<Record<string, string | null | undefined>>
}

export interface NameGroup {
  /** The normalised name every member shares (in at least one locale). */
  key: string
  ids: string[]
}

/**
 * Places that share a normalised name in ANY locale (ar/en/id; a name in one
 * locale also matches the same text stored under another). Transitive: if
 * A~B by English and B~C by Arabic, A, B and C are one group.
 */
export function groupByName(items: readonly NamedItem[], minLength = 2): NameGroup[] {
  const uf = new UnionFind(items.map((item) => item.id))
  const firstByKey = new Map<string, string>()
  const keyOf = new Map<string, string>()
  for (const item of items) {
    const keys = new Set(
      Object.values(item.name)
        .map((text) => normaliseName(text))
        .filter((key) => key.length >= minLength),
    )
    for (const key of keys) {
      const first = firstByKey.get(key)
      if (first === undefined) firstByKey.set(key, item.id)
      else {
        uf.union(first, item.id)
        if (!keyOf.has(first)) keyOf.set(first, key)
        keyOf.set(item.id, key)
      }
    }
  }
  return uf.groups().map((ids) => ({ key: keyOf.get(ids[0]!) ?? '', ids }))
}

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

const EARTH_M = 6_371_008.8

/** Great-circle distance in metres. */
export function distanceMetres(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export interface LatLon {
  lat: number
  lon: number
}

export interface PlacedItem extends LatLon {
  id: string
  /** Places are only compared inside one category (null = «no category»). */
  category: string | null
}

export interface DistanceCluster {
  category: string | null
  ids: string[]
  /** Largest pairwise distance that linked two members, metres (rounded). */
  maxLinkMetres: number
}

/**
 * Single-link clusters of places of the same category within `radius`
 * metres of each other. A grid of ~radius cells keeps it near-linear.
 */
export function clusterByDistance(
  items: readonly PlacedItem[],
  radius = NEAR_METRES,
): DistanceCluster[] {
  const valid = items.filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
  const uf = new UnionFind(valid.map((item) => item.id))
  const link = new Map<string, number>()
  const cellDeg = radius / 111_000
  const cells = new Map<string, PlacedItem[]>()
  const cellKey = (cat: string | null, x: number, y: number) => `${cat ?? ''}|${x}|${y}`

  for (const item of valid) {
    const x = Math.floor(item.lon / cellDeg)
    const y = Math.floor(item.lat / cellDeg)
    // At Bali's latitude a degree of longitude is ~0.99 of one of latitude,
    // so the 3×3 neighbourhood always covers the radius.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of cells.get(cellKey(item.category, x + dx, y + dy)) ?? []) {
          const d = distanceMetres(item, other)
          if (d <= radius) {
            uf.union(item.id, other.id)
            link.set(item.id, Math.max(link.get(item.id) ?? 0, d))
            link.set(other.id, Math.max(link.get(other.id) ?? 0, d))
          }
        }
      }
    }
    const own = cellKey(item.category, x, y)
    const list = cells.get(own)
    if (list) list.push(item)
    else cells.set(own, [item])
  }

  const byId = new Map(valid.map((item) => [item.id, item]))
  return uf.groups().map((ids) => ({
    category: byId.get(ids[0]!)?.category ?? null,
    ids,
    maxLinkMetres: Math.round(Math.max(...ids.map((id) => link.get(id) ?? 0))),
  }))
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export interface PhotoUse {
  placeId: string
  /** Media id, URL or object key — whatever identifies the file. */
  key: string
  /** Content hash (sha256 hex) when known. */
  sha?: string | null
  /** 64-bit perceptual dHash as 16 hex chars, when known. */
  dhash?: string | null
}

export interface SharedPhoto {
  /** What the members share: the file key, `sha:<hex>` or `dhash:<hex>`. */
  key: string
  kind: 'file' | 'content' | 'similar'
  placeIds: string[]
}

export interface RepeatedInGallery {
  placeId: string
  key: string
  times: number
  kind: 'file' | 'content'
}

/**
 * Generic «same value in more than one bucket» grouping. Returns values used
 * by two or more distinct owners, owners sorted, biggest groups first.
 */
export function groupShared<T>(
  rows: readonly T[],
  valueOf: (row: T) => string | null | undefined,
  ownerOf: (row: T) => string,
): { value: string; owners: string[] }[] {
  const map = new Map<string, Set<string>>()
  for (const row of rows) {
    const value = valueOf(row)
    if (!value) continue
    let set = map.get(value)
    if (!set) map.set(value, (set = new Set()))
    set.add(ownerOf(row))
  }
  return [...map]
    .filter(([, owners]) => owners.size > 1)
    .map(([value, owners]) => ({ value, owners: [...owners].sort() }))
    .sort((a, b) => b.owners.length - a.owners.length || a.value.localeCompare(b.value))
}

/** Hamming distance of two equal-length hex strings (bits). */
export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY
  let bits = 0
  for (let i = 0; i < a.length; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16)
    while (x) {
      bits += x & 1
      x >>>= 1
    }
  }
  return bits
}

/**
 * Photos shared between places:
 *  1. the same file (media id / URL) on two places;
 *  2. different files with identical bytes (sha256) — re-uploads;
 *  3. different content whose dHash differs by ≤ `nearBits` — the same
 *     picture re-encoded or resized. Only pairs not already caught above.
 */
export function findSharedPhotos(
  uses: readonly PhotoUse[],
  nearBits = NEAR_HASH_BITS,
): SharedPhoto[] {
  const out: SharedPhoto[] = []
  for (const g of groupShared(
    uses,
    (u) => u.key,
    (u) => u.placeId,
  )) {
    out.push({ key: g.value, kind: 'file', placeIds: g.owners })
  }

  // Content: one representative per file, so a file shared by N places
  // (already reported) does not also show up as N «content» matches.
  const byKey = new Map<string, PhotoUse>()
  for (const u of uses) if (!byKey.has(u.key)) byKey.set(u.key, u)
  const ownersOfKey = new Map<string, Set<string>>()
  for (const u of uses) {
    let s = ownersOfKey.get(u.key)
    if (!s) ownersOfKey.set(u.key, (s = new Set()))
    s.add(u.placeId)
  }

  const shaKeys = new Map<string, string[]>()
  for (const u of byKey.values()) {
    if (!u.sha) continue
    const list = shaKeys.get(u.sha) ?? []
    list.push(u.key)
    shaKeys.set(u.sha, list)
  }
  const shaOf = new Map<string, string>()
  for (const [sha, keys] of shaKeys) {
    for (const k of keys) shaOf.set(k, sha)
    if (keys.length < 2) continue
    const owners = new Set(keys.flatMap((k) => [...(ownersOfKey.get(k) ?? [])]))
    if (owners.size > 1)
      out.push({ key: `sha:${sha}`, kind: 'content', placeIds: [...owners].sort() })
  }

  // Perceptual: compare one representative per distinct sha (or per key).
  const reps = [...byKey.values()].filter((u) => u.dhash)
  const seenSha = new Set<string>()
  const distinct = reps.filter((u) => {
    const id = u.sha ?? `k:${u.key}`
    if (seenSha.has(id)) return false
    seenSha.add(id)
    return true
  })
  const uf = new UnionFind(distinct.map((u) => u.key))
  for (let i = 0; i < distinct.length; i++) {
    for (let j = i + 1; j < distinct.length; j++) {
      if (hammingHex(distinct[i]!.dhash!, distinct[j]!.dhash!) <= nearBits) {
        uf.union(distinct[i]!.key, distinct[j]!.key)
      }
    }
  }
  for (const repKeys of uf.groups()) {
    const shas = new Set(repKeys.map((k) => shaOf.get(k) ?? `k:${k}`))
    const keys = [...byKey.keys()].filter((k) => shas.has(shaOf.get(k) ?? `k:${k}`))
    const owners = new Set(keys.flatMap((k) => [...(ownersOfKey.get(k) ?? [])]))
    if (owners.size > 1) {
      out.push({
        key: `dhash:${byKey.get(repKeys[0]!)!.dhash}`,
        kind: 'similar',
        placeIds: [...owners].sort(),
      })
    }
  }

  return out.sort((a, b) => b.placeIds.length - a.placeIds.length || a.key.localeCompare(b.key))
}

/** The same file (or the same bytes) more than once in ONE place's photos. */
export function findRepeatsInPlace(uses: readonly PhotoUse[]): RepeatedInGallery[] {
  const out: RepeatedInGallery[] = []
  const byPlace = new Map<string, PhotoUse[]>()
  for (const u of uses) {
    const list = byPlace.get(u.placeId) ?? []
    list.push(u)
    byPlace.set(u.placeId, list)
  }
  for (const [placeId, list] of byPlace) {
    const fileCount = new Map<string, number>()
    for (const u of list) fileCount.set(u.key, (fileCount.get(u.key) ?? 0) + 1)
    for (const [key, times] of fileCount) {
      if (times > 1) out.push({ placeId, key, times, kind: 'file' })
    }
    const shaFiles = new Map<string, Set<string>>()
    for (const u of list) {
      if (!u.sha) continue
      const s = shaFiles.get(u.sha) ?? new Set()
      s.add(u.key)
      shaFiles.set(u.sha, s)
    }
    for (const [sha, files] of shaFiles) {
      if (files.size > 1)
        out.push({ placeId, key: `sha:${sha}`, times: files.size, kind: 'content' })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Data problems
// ---------------------------------------------------------------------------

export type DataProblem =
  | 'placeholder_slug'
  | 'missing_name_ar'
  | 'missing_name_en'
  | 'missing_name_id'
  | 'no_hero'
  | 'empty_gallery'
  | 'outside_bali'
  | 'bad_coordinates'

export interface ProblemInput extends LatLon {
  slug: string
  name: Partial<Record<string, string | null | undefined>>
  heroKey: string | null
  galleryKeys: readonly string[]
}

/** `place-12`, `place_3`, `place12`: slugs the importer generated when a name was missing. */
export const PLACEHOLDER_SLUG = /^place[-_]?\d+$/i

export function isInBali(p: LatLon): boolean {
  return (
    p.lat >= BALI_BBOX.minLat &&
    p.lat <= BALI_BBOX.maxLat &&
    p.lon >= BALI_BBOX.minLon &&
    p.lon <= BALI_BBOX.maxLon
  )
}

export function dataProblems(place: ProblemInput): DataProblem[] {
  const out: DataProblem[] = []
  if (PLACEHOLDER_SLUG.test(place.slug.trim())) out.push('placeholder_slug')
  for (const locale of AUDIT_LOCALES) {
    if (!(place.name[locale] ?? '').trim()) out.push(`missing_name_${locale}`)
  }
  if (!place.heroKey) out.push('no_hero')
  if (place.galleryKeys.length === 0) out.push('empty_gallery')
  if (
    !Number.isFinite(place.lat) ||
    !Number.isFinite(place.lon) ||
    (place.lat === 0 && place.lon === 0)
  ) {
    out.push('bad_coordinates')
  } else if (!isInBali(place)) out.push('outside_bali')
  return out
}

// ---------------------------------------------------------------------------

/** Disjoint sets; `groups()` returns only sets of two or more, members sorted. */
export class UnionFind {
  private parent = new Map<string, string>()
  constructor(ids: Iterable<string>) {
    for (const id of ids) this.parent.set(id, id)
  }
  find(id: string): string {
    let root = id
    while (this.parent.get(root) !== root) {
      const up = this.parent.get(root)
      if (up === undefined) {
        this.parent.set(root, root)
        break
      }
      root = up
    }
    let cur = id
    while (cur !== root) {
      const next = this.parent.get(cur)!
      this.parent.set(cur, root)
      cur = next
    }
    return root
  }
  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb)
  }
  groups(): string[][] {
    const map = new Map<string, string[]>()
    for (const id of this.parent.keys()) {
      const root = this.find(id)
      const list = map.get(root) ?? []
      list.push(id)
      map.set(root, list)
    }
    return [...map.values()]
      .filter((ids) => ids.length > 1)
      .map((ids) => ids.sort())
      .sort((a, b) => b.length - a.length || a[0]!.localeCompare(b[0]!))
  }
}
