/**
 * Scoring free photo candidates for one map place. Pure and client-safe.
 *
 *   distance   Commons geotag (or the matched Wikidata item) vs our pin
 *   name       our names (en/ar/id) vs the file title / description
 *   resolution at least 800px wide; wider is a little better
 *
 * Tiers:
 *   high  geotag ≤ 150 m AND a name match (≥ 0.7): may be auto-applied, but
 *         only to places with no photo or only a shared/duplicate one
 *   good  a convincing match a person would accept
 *   fair  plausible; shown for review only
 */

import { nameSimilarity } from '@/lib/google-places/match-score'
import { distanceMetres } from '@/lib/places-audit/detectors'

export type PhotoSource = 'commons' | 'openverse' | 'unsplash'
/** How the candidate was found. */
export type FoundVia = 'geo' | 'search' | 'wikidata' | 'openverse' | 'unsplash'

export const MIN_WIDTH = 800
export const AUTO_MAX_DISTANCE_M = 150
export const AUTO_MIN_NAME = 0.7

export interface ScorePlace {
  names: string[]
  lat: number
  lon: number
}

export interface ScoreInput {
  title: string
  description?: string | null
  /** Geotag of the photo, or of the Wikidata item it illustrates. */
  lat?: number | null
  lon?: number | null
  /** Wikidata item label, when found via P18. */
  itemLabel?: string | null
  width: number
  height: number
  via: FoundVia
}

export type Tier = 'high' | 'good' | 'fair' | 'reject'

export interface Scored {
  distanceM: number | null
  nameScore: number
  resScore: number
  score: number
  tier: Tier
}

/** «File:Pura_Tanah_Lot_2019-05.jpg» → «Pura Tanah Lot». */
export function cleanTitle(title: string): string {
  return title
    .replace(/^file:/i, '')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\b(img|dsc|dscn|dsc_|p|pxl)[ _-]?\d+\b/gi, ' ')
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Files that are not photographs of a place. */
export const NOT_A_PHOTO =
  /\b(map|locator|location map|logo|flag|coat of arms|emblem|diagram|icon|seal|svg|chart|plan|sign(board)?)\b/i

export function distanceScore(m: number | null): number {
  if (m === null || !Number.isFinite(m)) return 0
  if (m <= 50) return 1
  if (m >= 1000) return 0
  return 1 - (m - 50) / 950
}

export function resolutionScore(width: number): number {
  if (width < MIN_WIDTH) return 0
  return 0.5 + 0.5 * Math.min(1, (width - MIN_WIDTH) / 1200)
}

function bestName(names: readonly string[], texts: readonly (string | null | undefined)[]): number {
  let best = 0
  for (const n of names) for (const t of texts) if (t) best = Math.max(best, nameSimilarity(n, t))
  return Math.round(best * 1000) / 1000
}

export function scoreCandidate(place: ScorePlace, c: ScoreInput): Scored {
  const hasCoords = typeof c.lat === 'number' && typeof c.lon === 'number'
  const distanceM = hasCoords
    ? Math.round(distanceMetres(place, { lat: c.lat as number, lon: c.lon as number }))
    : null
  const title = cleanTitle(c.title)
  const nameScore = bestName(place.names, [title, c.itemLabel, c.description?.slice(0, 200)])
  const resScore = resolutionScore(c.width)
  const dist = distanceScore(distanceM)
  const score = Math.round((0.45 * dist + 0.4 * nameScore + 0.15 * resScore) * 1000) / 1000

  let tier: Tier = 'fair'
  const aspect = c.height > 0 ? c.width / c.height : 0
  if (c.width < MIN_WIDTH || aspect > 3.2 || aspect < 0.5 || NOT_A_PHOTO.test(title))
    tier = 'reject'
  else if (
    c.via !== 'openverse' &&
    c.via !== 'unsplash' &&
    distanceM !== null &&
    distanceM <= AUTO_MAX_DISTANCE_M &&
    nameScore >= AUTO_MIN_NAME
  )
    tier = 'high'
  else if (
    (distanceM !== null && distanceM <= 600 && nameScore >= 0.6) ||
    (distanceM === null && nameScore >= 0.85)
  )
    tier = 'good'
  else if (score < 0.3 && nameScore < 0.5) tier = 'reject'
  return { distanceM, nameScore, resScore, score, tier }
}

const TIER_RANK: Record<Tier, number> = { high: 3, good: 2, fair: 1, reject: 0 }

/** Best first: tier, then score. */
export function compareScored(a: Scored, b: Scored): number {
  return TIER_RANK[b.tier] - TIER_RANK[a.tier] || b.score - a.score
}

/** A place may be auto-filled only when it has no unique photo of its own. */
export function canAutoApply(input: { tier: Tier; hasUniqueOwnPhoto: boolean }): boolean {
  return input.tier === 'high' && !input.hasUniqueOwnPhoto
}
