/**
 * Restaurant sections importer — the pure half (owner, Nov 2026). Reads the
 * contractor CSV `restaurant-categories.csv`:
 *
 *   category_key,list_name,place_name,maps_link,lat,lon,slug,match
 *
 * and plans which (place, section) memberships to add (or, with `replace`,
 * remove). No database: `scripts/import-restaurant-sections.ts` feeds it the
 * live slugs, sections and memberships and applies the result.
 */

import { parseCsv } from '@/lib/integrations/csv'

import { isRestaurantSection, sectionCategoryKey } from './sections'

export const SECTION_CSV_COLUMNS = [
  'category_key',
  'list_name',
  'place_name',
  'maps_link',
  'lat',
  'lon',
  'slug',
  'match',
] as const

export const MATCH_KINDS = ['exact', 'branch', 'NEW', 'unsure'] as const
export type MatchKind = (typeof MATCH_KINDS)[number]

export interface SectionCsvRow {
  /** 1-based line in the file (header = 1). */
  line: number
  section: string
  listName: string
  placeName: string
  mapsLink: string
  lat: number | null
  lon: number | null
  slug: string
  match: MatchKind
}

export interface CsvProblem {
  line: number
  message: string
}

export function readSectionCsv(text: string): { rows: SectionCsvRow[]; problems: CsvProblem[] } {
  const table = parseCsv(text.replace(/^﻿/, ''))
  const problems: CsvProblem[] = []
  const rows: SectionCsvRow[] = []
  const header = (table[0] ?? []).map((cell) => cell.trim().toLowerCase())
  const index = new Map(header.map((name, i) => [name, i]))
  const missing = SECTION_CSV_COLUMNS.filter((name) => !index.has(name))
  if (missing.length > 0) {
    return { rows, problems: [{ line: 1, message: `missing column(s): ${missing.join(', ')}` }] }
  }
  const cell = (row: string[], name: string) => (row[index.get(name) ?? -1] ?? '').trim()
  const num = (raw: string) => {
    if (raw === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  table.slice(1).forEach((row, i) => {
    const line = i + 2
    if (row.every((one) => one.trim() === '')) return
    const section = cell(row, 'category_key').toLowerCase()
    const rawMatch = cell(row, 'match')
    const match = MATCH_KINDS.find((kind) => kind.toLowerCase() === rawMatch.toLowerCase())
    if (!isRestaurantSection(section)) {
      problems.push({ line, message: `unknown category_key «${section}»` })
      return
    }
    if (match === undefined) {
      problems.push({ line, message: `unknown match «${rawMatch}»` })
      return
    }
    rows.push({
      line,
      section,
      listName: cell(row, 'list_name'),
      placeName: cell(row, 'place_name'),
      mapsLink: cell(row, 'maps_link'),
      lat: num(cell(row, 'lat')),
      lon: num(cell(row, 'lon')),
      slug: cell(row, 'slug').toLowerCase(),
      match,
    })
  })
  return { rows, problems }
}

export interface SectionPlanInput {
  rows: readonly SectionCsvRow[]
  /** Live place slug → id. */
  places: ReadonlyMap<string, string>
  /** Section category key (`restaurants-arabic`) → id. */
  sections: ReadonlyMap<string, string>
  /** Current memberships as `placeId|categoryId`. */
  existing: ReadonlySet<string>
  includeUnsure: boolean
  /** Also remove section memberships the CSV does not list (for listed places only). */
  replace: boolean
}

export interface Membership {
  placeId: string
  categoryId: string
  slug: string
  sectionKey: string
}

export interface SectionPlan {
  add: Membership[]
  remove: Membership[]
  /** Already there: nothing to do. */
  kept: number
  /** `NEW` rows: places to add to the map first. */
  newPlaces: SectionCsvRow[]
  /** A slug the database does not have. */
  unknownSlugs: SectionCsvRow[]
  /** `unsure` rows left out (no --include-unsure). */
  skippedUnsure: SectionCsvRow[]
  /** A section the database does not have (migration 0054 not run?). */
  missingSections: string[]
}

export function planSections(input: SectionPlanInput): SectionPlan {
  const plan: SectionPlan = {
    add: [],
    remove: [],
    kept: 0,
    newPlaces: [],
    unknownSlugs: [],
    skippedUnsure: [],
    missingSections: [],
  }
  const wanted = new Map<string, Membership>()
  for (const row of input.rows) {
    if (row.match === 'NEW' || row.slug === 'new' || row.slug === '') {
      plan.newPlaces.push(row)
      continue
    }
    if (row.match === 'unsure' && !input.includeUnsure) {
      plan.skippedUnsure.push(row)
      continue
    }
    const sectionKey = sectionCategoryKey(row.section)
    const categoryId = input.sections.get(sectionKey)
    if (categoryId === undefined) {
      if (!plan.missingSections.includes(sectionKey)) plan.missingSections.push(sectionKey)
      continue
    }
    const placeId = input.places.get(row.slug)
    if (placeId === undefined) {
      plan.unknownSlugs.push(row)
      continue
    }
    wanted.set(`${placeId}|${categoryId}`, { placeId, categoryId, slug: row.slug, sectionKey })
  }
  for (const [id, one] of wanted) {
    if (input.existing.has(id)) plan.kept += 1
    else plan.add.push(one)
  }
  if (input.replace) {
    const listed = new Set([...wanted.values()].map((one) => one.placeId))
    const sectionIds = new Map([...input.sections].map(([key, id]) => [id, key]))
    const slugOf = new Map([...input.places].map(([slug, id]) => [id, slug]))
    for (const id of input.existing) {
      const [placeId = '', categoryId = ''] = id.split('|')
      if (!listed.has(placeId) || wanted.has(id) || !sectionIds.has(categoryId)) continue
      plan.remove.push({
        placeId,
        categoryId,
        slug: slugOf.get(placeId) ?? placeId,
        sectionKey: sectionIds.get(categoryId) ?? categoryId,
      })
    }
  }
  const order = (a: Membership, b: Membership) =>
    a.slug.localeCompare(b.slug) || a.sectionKey.localeCompare(b.sectionKey)
  plan.add.sort(order)
  plan.remove.sort(order)
  return plan
}
