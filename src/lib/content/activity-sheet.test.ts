import { describe, expect, it } from 'vitest'

import {
  changedColumns,
  columnSpec,
  COLUMNS,
  csvColumns,
  gridToRows,
  joinList,
  mergeList,
  normalizeCell,
  planRows,
  splitList,
} from './activity-sheet'

const lookups = { regions: new Set(['ubud']), categories: new Set(['nature', 'water']) }
const spec = (key: string, sheet: 'activities' | 'packages' = 'activities') => {
  const found = columnSpec(sheet, key)
  if (!found) throw new Error(key)
  return found
}
const norm = (key: string, raw: string, currency = 'USD') =>
  normalizeCell(spec(key), raw, lookups, currency)

describe('normalizeCell', () => {
  it('is idempotent for every kind', () => {
    const samples: [string, string][] = [
      ['price', '45'],
      ['price', '١٢٥٫٥'],
      ['min_guests', '3.0'],
      ['lat', '-8.50'],
      ['instant_confirmation', 'نعم'],
      ['time_slots', '8:00, 14.30 | 08:00'],
      ['highlights_ar', 'a|b\nc'],
      ['status', 'منشور'],
      ['region', 'UBUD'],
      ['extra_categories', 'water | nature'],
      ['currency', 'usd'],
    ]
    for (const [key, raw] of samples) {
      const first = norm(key, raw)
      expect('value' in first, `${key} ${raw}`).toBe(true)
      if ('value' in first) expect(norm(key, first.value)).toEqual(first)
    }
  })

  it('reads owner input', () => {
    expect(norm('price', '١٢٥٫٥')).toEqual({ value: '125.50' })
    expect(norm('price', '1500', 'IDR')).toEqual({ value: '1500' })
    expect(norm('time_slots', '8:00, 14.30 | 08:00')).toEqual({ value: '08:00 | 14:30' })
    expect(norm('status', 'منشور')).toEqual({ value: 'published' })
    expect(norm('instant_confirmation', 'لا')).toEqual({ value: 'no' })
  })

  it('refuses bad values with a code', () => {
    expect(norm('price', 'abc')).toEqual({ error: 'money' })
    expect(norm('price', '-5')).toEqual({ error: 'negative' })
    expect(norm('min_guests', 'two')).toEqual({ error: 'int' })
    expect(norm('time_slots', '25:00')).toEqual({ error: 'time' })
    expect(norm('region', 'mars')).toEqual({ error: 'region' })
    expect(norm('status', 'live')).toEqual({ error: 'status' })
    expect(norm('instant_confirmation', 'maybe')).toEqual({ error: 'bool' })
    expect(norm('map_url', 'maps.google.com')).toEqual({ error: 'url' })
  })
})

describe('lists', () => {
  it('keeps positions so Arabic and English pair up', () => {
    expect(splitList('a |  | c')).toEqual(['a', '', 'c'])
    expect(joinList(['a', '', 'c', ''])).toBe('a |  | c')
    const merged = mergeList([{ ar: 'x', en: 'X', id: 'IX', hidden: true }], 'y | z', 'Y')
    expect(merged).toEqual([
      { ar: 'y', en: 'Y', id: 'IX', hidden: true },
      { ar: 'z', en: '', id: '' },
    ])
  })
})

describe('gridToRows + planRows', () => {
  const keys = COLUMNS.activities.map((c) => c.key)
  const labels = COLUMNS.activities.map((c) => c.ar)
  const rowOf = (values: Record<string, string>) => keys.map((k) => values[k] ?? '')

  it('skips the label row and example rows; plans new and existing', () => {
    const grid = [
      labels,
      keys,
      rowOf({ activity_slug: 'example-activity', name_ar: 'x' }),
      rowOf({ activity_slug: 'new-one', name_ar: 'جديد', region: 'ubud' }),
      rowOf({ activity_slug: 'old-one', name_en: 'Old', price: '10' }),
    ]
    const { rows, issues } = gridToRows(grid, 'activities')
    expect(issues).toEqual([])
    expect(rows.map((r) => r.line)).toEqual([4, 5])
    const plan = planRows(rows, lookups, new Map([['old-one', { currency: 'USD' }]]))
    expect(plan.issues).toEqual([])
    expect(plan.activities.map((a) => a.slug)).toEqual(['new-one', 'old-one'])
  })

  it('reports every bad row with its line', () => {
    const grid = [
      keys,
      rowOf({ activity_slug: 'Bad Slug', name_ar: 'x' }),
      rowOf({ activity_slug: 'no-name' }),
      rowOf({ activity_slug: 'dup', name_ar: 'x' }),
      rowOf({ activity_slug: 'dup', name_ar: 'y' }),
      rowOf({ activity_slug: 'people', name_ar: 'x', min_guests: '5', max_guests: '2' }),
    ]
    const plan = planRows(gridToRows(grid, 'activities').rows, lookups, new Map())
    expect(plan.issues.map((i) => [i.line, i.code])).toEqual([
      [2, 'slug'],
      [3, 'name'],
      [5, 'duplicate_slug'],
      [6, 'people'],
    ])
  })

  it('reads the single-file CSV form with a type column and the old column names', () => {
    const header = csvColumns()
    const grid = [
      header,
      header.map((k) => ({ type: 'activity', activity_slug: 'a-1', name_en: 'A' })[k] ?? ''),
      header.map(
        (k) =>
          ({
            type: 'package',
            activity_slug: 'a-1',
            package_key: 'basic',
            name_ar: 'ب',
            pricing: 'per_person',
          })[k] ?? '',
      ),
      header.map(
        (k) => ({ type: 'faq', activity_slug: 'a-1', question_ar: 'س؟', answer_ar: 'ج' })[k] ?? '',
      ),
    ]
    const { rows } = gridToRows(grid, null)
    const plan = planRows(rows, lookups, new Map())
    expect(plan.issues).toEqual([])
    expect(plan.activities[0]?.packages.length).toBe(1)
    expect(plan.activities[0]?.faq.length).toBe(1)
  })
})

describe('changedColumns', () => {
  it('compares only the columns the file has', () => {
    const stored = { activity_slug: 'a', name_ar: 'x', price: '10.00' }
    expect(
      changedColumns({ activity_slug: 'a', name_ar: 'x' }, ['activity_slug', 'name_ar'], stored),
    ).toEqual([])
    expect(
      changedColumns({ activity_slug: 'a', price: '11.00' }, ['activity_slug', 'price'], stored),
    ).toEqual(['price'])
    expect(
      changedColumns({ activity_slug: 'a', name_ar: '' }, ['activity_slug', 'name_ar'], null),
    ).toEqual([])
  })
})
