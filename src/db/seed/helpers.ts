/**
 * Seed helpers: slugs, deterministic ids, money and upsert plumbing.
 */

import { createHash } from 'node:crypto'

import { getTableColumns, sql, type SQL } from 'drizzle-orm'
import type { PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core'

import { BASE_CURRENCY, PEG_SAR_PER_USD, toSarMinor } from '@/lib/currency/fx'
import { minorUnitExponent } from '@/lib/money'

/**
 * The handoff priced everything in whole US dollars rendered with a
 * hard-coded "$". The site's one base currency is SAR (Nov 2026), so the
 * seed stores SAR halalas, converted from the handoff's dollars at the
 * official peg — the same rate migration 0043 uses when nothing else is set.
 */
export const SEED_CURRENCY = BASE_CURRENCY
const HANDOFF_CURRENCY = 'USD'

/** Whole handoff dollars -> SAR minor units (halalas), at 3.75. */
export function toMinor(whole: number): number {
  if (!Number.isInteger(whole) || whole < 0) {
    throw new Error(`price must be a non-negative integer, got ${whole}`)
  }
  const sar = toSarMinor(whole * 10 ** minorUnitExponent(HANDOFF_CURRENCY), HANDOFF_CURRENCY, {
    USD: 1 / PEG_SAR_PER_USD,
  })
  if (sar === null) throw new Error('no rate for the handoff currency')
  return sar
}

/**
 * URL-safe slug from an English title.
 *
 * Diacritics fold rather than vanish ("Crate Café" -> crate-cafe) and
 * apostrophes join rather than split ("Gates of Heaven" stays one word each
 * side), so slugs read the way a person would type them.
 */
export function slugify(value: string, maxLength = 128): string {
  const slug = value
    .normalize('NFKD')
    // Nonspacing combining marks left behind by NFKD: café -> cafe.
    .replace(/\p{Mn}/gu, '')
    // Apostrophes join rather than separate: "Gates of Heaven" keeps its words.
    .replace(/['‘’ʼ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (slug.length === 0) throw new Error(`"${value}" produced an empty slug`)
  if (slug.length <= maxLength) return slug
  return slug.slice(0, maxLength).replace(/-+[^-]*$/, '')
}

/**
 * Slugs for a whole set, keyed by handoff id and unique within the set.
 *
 * A duplicate English name falls back to the handoff id, and only then to a
 * counter — both deterministic, so re-running the seed produces the same
 * slugs and therefore updates the same rows rather than inserting new ones.
 */
export function assignSlugs<T>(
  items: readonly T[],
  english: (item: T) => string,
  legacyId: (item: T) => string,
  maxLength = 128,
): Map<string, string> {
  const taken = new Set<string>()
  const bySource = new Map<string, string>()

  for (const item of items) {
    const source = legacyId(item)
    if (bySource.has(source)) throw new Error(`duplicate handoff id "${source}"`)

    const base = slugify(english(item), maxLength)
    let slug = base
    if (taken.has(slug)) slug = slugify(`${base}-${source}`, maxLength)
    let counter = 2
    while (taken.has(slug)) {
      slug = slugify(`${base}-${counter}`, maxLength)
      counter++
    }
    taken.add(slug)
    bySource.set(source, slug)
  }
  return bySource
}

/** RFC 4122 namespace for every id this seed derives. Fixed, never regenerated. */
const SEED_NAMESPACE = '1b4d5a8e-6f2c-5a3b-9d71-0c9f4e2a7b83'

/**
 * Deterministic UUID v5.
 *
 * Used for rows that have no natural key to conflict on — reviews, whose only
 * identity is "this author, about this activity". Deriving the primary key
 * from that makes the insert idempotent without adding a unique index.
 */
export function deterministicId(name: string): string {
  const namespaceBytes = Buffer.from(SEED_NAMESPACE.replace(/-/g, ''), 'hex')
  const digest = createHash('sha1')
    .update(Buffer.concat([namespaceBytes, Buffer.from(name, 'utf8')]))
    .digest()

  const bytes = Buffer.from(digest.subarray(0, 16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50 // version 5
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80 // RFC 4122 variant

  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/**
 * `SET col = excluded.col` for the named columns, for ON CONFLICT DO UPDATE.
 *
 * Only handoff-derived columns are ever listed. Anything the handoff does not
 * carry — publish state, lead times, per-activity inclusions — is written once
 * at insert and then left alone, so re-running the seed cannot revert an
 * editor's work in the admin.
 */
export function overwrite<T extends PgTable>(
  table: T,
  columns: readonly (keyof T['_']['columns'] & string)[],
): PgUpdateSetSource<T> {
  const all = getTableColumns(table) as unknown as Record<string, { name: string } | undefined>
  const set: Record<string, SQL> = {}

  for (const key of columns) {
    const column = all[key]
    if (!column) throw new Error(`overwrite(): "${key}" is not a column of this table`)
    set[key] = sql.raw(`excluded."${column.name}"`)
  }
  if (all['updatedAt']) set['updatedAt'] = sql`now()`

  return set as unknown as PgUpdateSetSource<T>
}

/** Map lookup that fails loudly instead of writing a null foreign key. */
export function must<V>(map: ReadonlyMap<string, V>, key: string, what: string): V {
  const value = map.get(key)
  if (value === undefined) throw new Error(`${what}: nothing seeded for "${key}"`)
  return value
}
