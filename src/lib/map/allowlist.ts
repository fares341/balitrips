/**
 * Map allow-list (owner, Nov 2026: "the map must show only the places I
 * chose"). Pure helpers for `scripts/hide-places-not-in-allowlist.ts`.
 *
 * The allow-list is a CSV with a `slug` column — the map inventory CSV works
 * as is. When it also has a `keep` column, only rows marked yes (yes / y /
 * 1 / true / نعم / ya) count, so the owner can tick the inventory instead of
 * deleting lines. A file without a header row is read as one slug per line.
 */

export interface AllowList {
  slugs: Set<string>
  /** Lines that were not a usable slug (shown in the dry run). */
  skipped: string[]
}

const YES = new Set(['yes', 'y', '1', 'true', 'نعم', 'ya', 'keep', '✓', 'x'])
const SLUG = /^[a-z0-9][a-z0-9-]*$/

/** Split one CSV line (RFC 4180 quotes). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cell)
      cell = ''
    } else cell += ch
  }
  out.push(cell)
  return out.map((one) => one.trim())
}

export function parseAllowList(text: string): AllowList {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
  const slugs = new Set<string>()
  const skipped: string[] = []
  if (lines.length === 0) return { slugs, skipped }

  const header = splitCsvLine(lines[0]!).map((one) => one.toLowerCase())
  const slugCol = header.indexOf('slug')
  const keepCol = header.indexOf('keep')
  const rows = slugCol >= 0 ? lines.slice(1) : lines

  for (const line of rows) {
    const cells = splitCsvLine(line)
    const slug = (slugCol >= 0 ? cells[slugCol] : cells[0])?.toLowerCase() ?? ''
    if (!SLUG.test(slug)) {
      skipped.push(line)
      continue
    }
    if (keepCol >= 0 && !YES.has((cells[keepCol] ?? '').toLowerCase())) continue
    slugs.add(slug)
  }
  return { slugs, skipped }
}

export interface PlaceRow {
  id: string
  slug: string
  categoryKey: string | null
  isHidden: boolean
}

export interface HidePlan {
  hide: PlaceRow[]
  keep: PlaceRow[]
  alreadyHidden: PlaceRow[]
  /** Allow-list slugs that match no place (typos, deleted places). */
  unknown: string[]
}

/**
 * Which visible places to hide: every one whose slug is not allowed and whose
 * category is not kept whole. Already-hidden places are left as they are.
 */
export function planHide(
  places: readonly PlaceRow[],
  allow: ReadonlySet<string>,
  keepCategories: ReadonlySet<string> = new Set(),
): HidePlan {
  const plan: HidePlan = { hide: [], keep: [], alreadyHidden: [], unknown: [] }
  const known = new Set(places.map((one) => one.slug))
  for (const place of places) {
    if (place.isHidden) plan.alreadyHidden.push(place)
    else if (allow.has(place.slug) || keepCategories.has(place.categoryKey ?? ''))
      plan.keep.push(place)
    else plan.hide.push(place)
  }
  plan.unknown = [...allow].filter((slug) => !known.has(slug)).sort()
  return plan
}
