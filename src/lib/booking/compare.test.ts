import { describe, expect, it } from 'vitest'

import { compareRows, normalizeFeature, withoutRepeats } from './compare'

const addons = [
  { id: 'para', name: 'الطيران بالمظلة البحرية' },
  { id: 'fish', name: 'السمكة الطائرة' },
  { id: 'jet', name: 'دراجة مائية مع مرشد (15 دقيقة)' },
  { id: 'jet-solo', name: 'دراجة مائية بدون مرشد – فردي' },
]

describe('normalizeFeature', () => {
  it('drops quantities, brackets, diacritics and the article', () => {
    expect(normalizeFeature('الطيران بالمظلة 5 دقائق')).toBe(normalizeFeature('الطيران بالمظلة'))
    expect(normalizeFeature('دراجة مائية مع مرشد (15 دقيقة)')).toBe(
      normalizeFeature('دراجة مائية مع مرشد ١٥ دقيقة'),
    )
    expect(normalizeFeature('قارب الموز مجانًا')).toBe(normalizeFeature('قارب الموز'))
    expect(normalizeFeature('Parasailing (5 minutes)')).toBe('parasailing')
    expect(normalizeFeature('التأمين')).toBe(normalizeFeature('تأمين'))
  })
})

describe('compareRows', () => {
  const packages = [
    {
      id: 'a',
      includes: ['السمكة الطائرة جولتان', 'الطيران بالمظلة البحرية 5 دقائق', 'التأمين', 'مرشد'],
      includesAddons: ['para', 'fish'],
    },
    {
      id: 'b',
      includes: ['دراجة مائية مع مرشد 15 دقيقة', 'الطيران بالمظلة 5 دقائق'],
      includesAddons: ['fish'],
    },
    { id: 'premium', includes: [], includesAddons: ['para', 'fish', 'jet'] },
  ]
  const general = ['مرشد', 'التأمين حسب شروط المورد', 'معدات السلامة']
  const rows = compareRows(packages, addons, general)
  const row = (label: string) => rows.find((r) => r.label === label)

  it('ticks a general line for every package, once', () => {
    expect(row('مرشد')?.has).toEqual([true, true, true])
    expect(row('التأمين حسب شروط المورد')?.has).toEqual([true, true, true])
    expect(row('معدات السلامة')?.has).toEqual([true, true, true])
    expect(rows.filter((r) => r.label.includes('أمين'))).toHaveLength(1)
  })

  it('merges a typed line with the extra it names', () => {
    // «5 minutes» typed two ways, and ticked as an extra: one row.
    expect(rows.filter((r) => r.label.includes('المظلة'))).toHaveLength(1)
    expect(row('الطيران بالمظلة البحرية')?.has).toEqual([true, true, true])
    expect(row('السمكة الطائرة')?.has).toEqual([true, true, true])
    expect(row('دراجة مائية مع مرشد (15 دقيقة)')?.has).toEqual([false, true, true])
  })

  it('puts the rows that differ first', () => {
    expect(rows[0]?.differs).toBe(true)
    expect(rows[rows.length - 1]?.differs).toBe(false)
  })

  it('has no duplicate keys and never an all-empty row', () => {
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
    expect(rows.every((r) => r.has.some(Boolean))).toBe(true)
  })

  it('keeps a longer package line beside a general one (it may be an upgrade)', () => {
    const out = compareRows(
      [
        { id: 'a', includes: [], includesAddons: [] },
        { id: 'b', includes: ['مرشد خاص باللغة العربية'], includesAddons: [] },
      ],
      [],
      ['مرشد'],
    )
    expect(out.map((r) => r.has)).toEqual([
      [false, true],
      [true, true],
    ])
  })

  it('does not guess between two extras a short line could mean', () => {
    const out = compareRows([{ id: 'a', includes: ['دراجة مائية'], includesAddons: [] }], addons)
    expect(out).toHaveLength(1)
    expect(out[0]?.key.startsWith('t:')).toBe(true)
  })
})

describe('withoutRepeats', () => {
  it('drops extras the package text already lists', () => {
    expect(
      withoutRepeats(['الطيران بالمظلة البحرية', 'قارب الدونات'], ['الطيران بالمظلة 5 دقائق']),
    ).toEqual(['قارب الدونات'])
  })
})
