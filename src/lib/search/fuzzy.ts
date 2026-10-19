/**
 * Instant suggestions for the home hero search — runs in the browser over a
 * small index the page sends with the HTML (regions, map categories,
 * activities, free places), so a suggestion appears on the first key press
 * with no request per keystroke.
 *
 * Matching, best first (lower rank wins):
 *   0  the whole name                      "ubud"        → Ubud
 *   1  the start of the name               "او"          → أوبود
 *   2  the start of any word (ال / plural  "باتور"       → جبل باتور
 *      forms folded by `wordVariants`)
 *   3  anywhere inside a word (2+ letters) "شا"          → تشانغو
 *   4  a near miss: one typo (3–5 letters) "شانغو"/"ubdu" → تشانغو / Ubud
 *      or two (6+), against a word or the
 *      start of one, so it works mid-typing
 *
 * Every locale's name of an entry is searched, so "ubud" finds أوبود on the
 * Arabic page and the other way round. Pure and dependency-free: the same
 * code runs in tests.
 */

import { normalizeSearch } from './normalize'
import { wordVariants } from './query'

export type SuggestKind = 'region' | 'category' | 'activity' | 'place'

export interface SuggestEntry {
  id: string
  kind: SuggestKind
  /** Shown in the list, in the page's language. */
  label: string
  /** Second line (region, type…), or null. */
  sub: string | null
  /** Where choosing it goes (already localized). */
  href: string
  /** Every name to match, already normalized (`normalizeSearch`). */
  keys: string[]
}

export interface SuggestHit {
  entry: SuggestEntry
  rank: number
}

/** Regions and map types first on a tie: a destination is what "Where to?" asks. */
const KIND_ORDER: Record<SuggestKind, number> = { region: 0, category: 1, activity: 2, place: 3 }

export const MAX_HITS = 7

/** Normalized names for an entry: each locale's text plus the key with dashes as spaces. */
export function suggestKeys(names: readonly (string | null | undefined)[]): string[] {
  const out = new Set<string>()
  for (const name of names) {
    if (typeof name !== 'string') continue
    const normal = normalizeSearch(name.replace(/[-_]+/g, ' '))
    if (normal !== '') out.add(normal)
  }
  return [...out]
}

/**
 * Smallest edit distance (insert, delete, substitute, swap two neighbours)
 * between `needle` and any START of `word` — "ubu" is 0 from "ubud". Stops
 * early once every path is past `limit`; returns limit + 1 then.
 */
export function prefixDistance(needle: string, word: string, limit: number): number {
  const n = needle.length
  const m = word.length
  if (n === 0) return 0
  // rows[i][j]: distance between needle[0..i) and word[0..j)
  let prev2: number[] = []
  let prev: number[] = Array.from({ length: m + 1 }, (_, j) => j)
  for (let i = 1; i <= n; i++) {
    const row: number[] = [i]
    let rowMin = i
    for (let j = 1; j <= m; j++) {
      const cost = needle.charAt(i - 1) === word.charAt(j - 1) ? 0 : 1
      let value = Math.min(
        (prev[j] ?? Infinity) + 1,
        (row[j - 1] ?? Infinity) + 1,
        (prev[j - 1] ?? Infinity) + cost,
      )
      if (
        i > 1 &&
        j > 1 &&
        needle.charAt(i - 1) === word.charAt(j - 2) &&
        needle.charAt(i - 2) === word.charAt(j - 1)
      ) {
        value = Math.min(value, (prev2[j - 2] ?? Infinity) + 1)
      }
      row.push(value)
      if (value < rowMin) rowMin = value
    }
    if (rowMin > limit) return limit + 1
    prev2 = prev
    prev = row
  }
  return Math.min(...prev)
}

/** Typos allowed for a query of this many letters (none under 3: too noisy). */
function typoLimit(length: number): number {
  if (length < 3) return 0
  return length < 6 ? 1 : 2
}

/**
 * Letters Arabic writers swap for the same Bali sound — the hard "g" is
 * written غ, ج, ق, گ or ك (Canggu: تشانغو / تشانجو / تشانقو) — folded for the
 * near-miss step only, so they never cost a typo.
 */
const SOUND_FOLDS: readonly [RegExp, string][] = [
  [/[غقجگك]/g, 'ج'],
  [/ط/g, 'ت'],
  [/ص/g, 'س'],
  [/[ذظ]/g, 'ز'],
  [/ح/g, 'ه'],
  [/[ؤ]/g, 'و'],
  [/[ئ]/g, 'ي'],
]

function foldSounds(value: string): string {
  let out = value
  for (const [pattern, to] of SOUND_FOLDS) out = out.replace(pattern, to)
  return out
}

/** -1 when `key` does not match `needle`. */
export function matchRank(key: string, needle: string): number {
  if (needle === '') return -1
  if (key === needle) return 0
  if (key.startsWith(needle)) return 1

  const words = key.split(' ')
  if (words.some((word) => wordVariants(word).some((variant) => variant.startsWith(needle)))) {
    return 2
  }
  if (needle.length >= 2 && key.includes(needle)) return 3

  const limit = typoLimit(needle.length)
  if (limit > 0) {
    const compact = foldSounds(needle.replace(/ /g, ''))
    const candidates = [key.replace(/ /g, ''), ...words.flatMap((word) => wordVariants(word))].map(
      foldSounds,
    )
    const first = compact.charAt(0)
    for (const candidate of candidates) {
      if (candidate.length < 2) continue
      // Short queries: the first letter carries the intent ("اوبد" yes,
      // "سوبد" no); from four letters a skipped leading letter is forgiven
      // ("شانغو" → تشانغو).
      if (compact.length < 5 && candidate.charAt(0) !== first) {
        if (compact.length < 4 || candidate.charAt(1) !== first) continue
      }
      if (prefixDistance(compact, candidate, limit) <= limit) return 4
    }
  }
  return -1
}

/** The best matches for what was typed, best first, at most `max`. */
export function suggestFrom(
  entries: readonly SuggestEntry[],
  query: string,
  max = MAX_HITS,
): SuggestHit[] {
  const needle = normalizeSearch(query.slice(0, 60))
  if (needle === '') return []

  const hits: SuggestHit[] = []
  for (const entry of entries) {
    let best = -1
    for (const key of entry.keys) {
      const rank = matchRank(key, needle)
      if (rank >= 0 && (best < 0 || rank < best)) best = rank
      if (best === 0) break
    }
    // One letter: only names that start with it, or the list is the alphabet.
    if (best < 0 || (needle.length === 1 && best > 2)) continue
    hits.push({ entry, rank: best })
  }

  // "Where to?": an area that matches as typed (not only by a typo) leads,
  // so «شا» puts تشانغو above «شاطئ …» activities.
  const tier = (hit: SuggestHit) => (hit.entry.kind === 'region' && hit.rank <= 3 ? 0 : 1)
  const sorted = hits.sort(
    (a, b) =>
      tier(a) - tier(b) ||
      a.rank - b.rank ||
      KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] ||
      a.entry.label.length - b.entry.label.length,
  )

  // A place or type named exactly like a listed area adds nothing.
  const areaNames = new Set(
    sorted
      .filter((hit) => hit.entry.kind === 'region')
      .map((hit) => normalizeSearch(hit.entry.label)),
  )
  return sorted
    .filter(
      (hit) => hit.entry.kind === 'region' || !areaNames.has(normalizeSearch(hit.entry.label)),
    )
    .slice(0, max)
}

/**
 * Where the typed text sits inside the shown label, for bolding it: the
 * label's own [start, end) or null. Folding drops marks and changes some
 * letters, so the search runs on a folded copy whose positions map back.
 */
export function highlightRange(label: string, query: string): [number, number] | null {
  const needle = normalizeSearch(query)
  if (needle === '') return null
  let folded = ''
  const origin: number[] = []
  for (let index = 0; index < label.length; index++) {
    const piece =
      normalizeSearch(label.charAt(index)) || (/\s/.test(label.charAt(index)) ? ' ' : '')
    for (const ch of piece) {
      folded += ch
      origin.push(index)
    }
  }
  const at = folded.indexOf(needle)
  if (at < 0) return null
  const start = origin[at]
  const last = origin[at + needle.length - 1]
  if (start === undefined || last === undefined) return null
  return [start, last + 1]
}
