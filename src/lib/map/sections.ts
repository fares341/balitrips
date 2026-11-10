/**
 * Restaurant sections (owner, Nov 2026) — the pure half. The 11 lists the
 * client keeps in Google Maps are child categories of `restaurants`
 * (`categories.parent_id`, migration 0054); a place can be in several
 * (`map_place_subcategories`). No database, no React: unit-tested in
 * `sections.test.ts`.
 */

/** The parent category the sections were seeded under. */
export const RESTAURANTS_KEY = 'restaurants'

/** The client's sections, in his order (unprefixed keys, as in the CSV). */
export const RESTAURANT_SECTIONS = [
  'arabic',
  'burgers',
  'italian',
  'greek',
  'mexican',
  'indian',
  'japanese',
  'indonesian',
  'seafood',
  'steak',
  'fine-dining',
] as const

export type RestaurantSection = (typeof RESTAURANT_SECTIONS)[number]

/** `arabic` → `restaurants-arabic` (the stored category key). */
export function sectionCategoryKey(section: string): string {
  return `${RESTAURANTS_KEY}-${section}`
}

export function isRestaurantSection(value: string): value is RestaurantSection {
  return (RESTAURANT_SECTIONS as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Public map
// ---------------------------------------------------------------------------

/** One section as the map receives it. */
export interface SectionItem {
  key: string
  parentKey: string
  label: string
}

const SAFE_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/

/** `?sec=` against the known section keys; anything else = no section. */
export function parseSection(
  raw: string | null | undefined,
  known: ReadonlySet<string>,
): string | null {
  const key = (raw ?? '').trim().toLowerCase()
  return SAFE_KEY.test(key) && known.has(key) ? key : null
}

/**
 * The section row shows under exactly one selected category that has
 * sections (picking Restaurants alone). With several categories the row
 * would filter only part of the results, so it stays hidden.
 */
export function sectionParentFor(
  selected: readonly string[],
  sections: readonly SectionItem[],
): string | null {
  if (selected.length !== 1) return null
  const only = selected[0]
  return sections.some((one) => one.parentKey === only) ? (only ?? null) : null
}

/** The sections of `parentKey` that hold at least one of these places, in order. */
export function sectionsWithPlaces(
  sections: readonly SectionItem[],
  parentKey: string,
  places: readonly { sections?: readonly string[] }[],
): SectionItem[] {
  const used = new Set<string>()
  for (const place of places) for (const key of place.sections ?? []) used.add(key)
  return sections.filter((one) => one.parentKey === parentKey && used.has(one.key))
}

/** Adds `sec=` to a map query string (`''` or `?…`). */
export function withSection(query: string, section: string | null): string {
  if (section === null) return query
  const part = `sec=${encodeURIComponent(section)}`
  return query === '' ? `?${part}` : `${query}&${part}`
}

/** Places in `section` (null = all of them). */
export function filterBySection<T extends { sections?: readonly string[] }>(
  places: readonly T[],
  section: string | null,
): T[] {
  if (section === null) return [...places]
  return places.filter((place) => (place.sections ?? []).includes(section))
}

// ---------------------------------------------------------------------------
// Studio
// ---------------------------------------------------------------------------

export type ParentProblem = 'self' | 'not_top_level' | 'has_children' | null

/**
 * One level only: a parent must be top-level, a category is not its own
 * parent, and a category with sections cannot itself become a section.
 */
export function checkCategoryParent(input: {
  id: string | null
  parentId: string | null
  /** The chosen parent's own parent (null = top-level). */
  parentOfParent: string | null
  hasChildren: boolean
}): ParentProblem {
  if (input.parentId === null) return null
  if (input.id !== null && input.parentId === input.id) return 'self'
  if (input.parentOfParent !== null) return 'not_top_level'
  if (input.hasChildren) return 'has_children'
  return null
}

/** Submitted section ids, kept only when they are sections of the place's category. */
export function cleanSectionIds(
  submitted: readonly string[],
  allowed: readonly string[],
): string[] {
  const ok = new Set(allowed)
  const out: string[] = []
  for (const id of submitted) if (ok.has(id) && !out.includes(id)) out.push(id)
  return out
}
