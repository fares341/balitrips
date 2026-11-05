/**
 * Collect and score free photo candidates for one place. No database: the
 * job (`./job`) and the read-only dry run (`scripts/free-photos.ts --dry-run`)
 * both use it. All network goes through the injected `PoliteClient`.
 */

import type { PoliteClient } from './http'
import {
  commonsFiles,
  commonsGeosearch,
  commonsSearch,
  openverseSearch,
  unsplashSearch,
  wikidataNear,
  type CommonsFile,
  type RawCandidate,
} from './sources'
import { compareScored, scoreCandidate, type Scored, type ScorePlace } from './score'

export interface CollectPlace extends ScorePlace {
  /** The main (English) name, used for search queries. */
  name: string
  categoryKey: string | null
  priority?: number
}

export type ScoredCandidate = RawCandidate & Scored

/** Categories worth an Unsplash lookup: well-known, photogenic spots. */
export const FAMOUS_CATEGORIES = new Set([
  'beaches',
  'sights',
  'temples',
  'waterfalls',
  'viewpoints',
  'nature',
  'rice-terraces',
  'lakes',
  'islands',
])

export interface CollectOptions {
  http: PoliteClient
  unsplashKey?: string | null
  geoRadiusM?: number
  /** Keep at most this many (best first). */
  keep?: number
  log?: (line: string) => void
}

function fromCommons(
  file: CommonsFile,
  via: RawCandidate['via'],
  itemLabel: string | null,
  itemCoords?: { lat: number; lon: number },
): RawCandidate | null {
  if (!file.license) return null
  return {
    source: 'commons',
    externalId: file.title,
    via,
    title: file.title,
    description: file.description,
    lat: itemCoords?.lat ?? file.lat ?? null,
    lon: itemCoords?.lon ?? file.lon ?? null,
    itemLabel,
    width: file.width,
    height: file.height,
    thumbUrl: file.thumbUrl,
    imageUrl: file.imageUrl,
    author: file.author,
    authorUrl: file.authorUrl,
    license: file.license,
    sourceUrl: file.sourceUrl,
    downloadLocation: null,
  }
}

async function safe<T>(fn: () => Promise<T>, fallback: T, log?: (l: string) => void): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    log?.(`  ! ${error instanceof Error ? error.message : 'error'}`)
    return fallback
  }
}

export async function collectCandidates(
  place: CollectPlace,
  options: CollectOptions,
): Promise<ScoredCandidate[]> {
  const { http, log } = options
  const name = place.name.trim()

  // 1. Commons: geotagged near the pin, and by name.
  const geo = await safe(
    () => commonsGeosearch(http, place.lat, place.lon, options.geoRadiusM ?? 400),
    [],
    log,
  )
  const byName =
    name.length >= 3
      ? [
          ...(await safe(() => commonsSearch(http, `${name} Bali`), [], log)),
          ...(await safe(() => commonsSearch(http, `"${name}"`, 6), [], log)),
        ]
      : []
  // 2. Wikidata items near the pin whose P18 image is on Commons.
  const items = await safe(() => wikidataNear(http, place.lat, place.lon, 1), [], log)
  const itemByFile = new Map(items.map((it) => [`File:${it.image}`, it]))

  const via = new Map<string, RawCandidate['via']>()
  for (const t of byName) via.set(t, 'search')
  for (const g of geo) via.set(g.title, 'geo')
  for (const t of itemByFile.keys()) via.set(t, 'wikidata')

  const files = await safe(() => commonsFiles(http, [...via.keys()]), [], log)
  const raw: RawCandidate[] = []
  for (const file of files) {
    const item = itemByFile.get(file.title) ?? null
    const c = fromCommons(
      file,
      via.get(file.title) ?? 'search',
      item?.label ?? null,
      item ?? undefined,
    )
    if (c) raw.push(c)
  }

  // 3. Openverse by name (keyless).
  if (name.length >= 3)
    raw.push(...(await safe(() => openverseSearch(http, `${name} Bali`), [], log)))

  let scored = score(place, raw)

  // 4. Unsplash: only with a key, only famous spots, only when the free
  //    sources found nothing convincing.
  const best = scored[0]
  if (
    options.unsplashKey &&
    name.length >= 3 &&
    (FAMOUS_CATEGORIES.has(place.categoryKey ?? '') || (place.priority ?? 0) > 0) &&
    (!best || (best.tier !== 'high' && best.tier !== 'good'))
  ) {
    const key = options.unsplashKey
    const more = await safe(() => unsplashSearch(http, key, `${name} Bali`), [], log)
    scored = [...scored, ...score(place, more)].sort(compareScored)
  }
  return scored.slice(0, options.keep ?? 12)
}

export function score(place: ScorePlace, raw: readonly RawCandidate[]): ScoredCandidate[] {
  const seen = new Set<string>()
  const out: ScoredCandidate[] = []
  for (const c of raw) {
    const key = `${c.source}:${c.externalId}`
    if (seen.has(key)) continue
    seen.add(key)
    const s = scoreCandidate(place, c)
    if (s.tier === 'reject') continue
    out.push({ ...c, ...s })
  }
  return out.sort(compareScored)
}
