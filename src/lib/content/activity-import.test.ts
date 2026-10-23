import { describe, expect, it } from 'vitest'

import { IMPORT_COLUMNS, parseCsv, validateImport } from './activity-import'
import { templateFill } from './activity-templates'

const known = {
  slugs: new Set(['already-there']),
  regions: new Set(['ubud']),
  categories: new Set(['nature']),
}

const csv = (rows: Record<string, string>[]) =>
  '﻿' +
  [
    IMPORT_COLUMNS.join(','),
    ...rows.map((row) =>
      IMPORT_COLUMNS.map((column) => `"${(row[column] ?? '').replace(/"/g, '""')}"`).join(','),
    ),
  ].join('\r\n')

const activity = {
  type: 'activity',
  activity_slug: 'swing-ubud',
  name_ar: 'أرجوحة أوبود',
  name_en: 'Ubud swing',
  region: 'ubud',
  category: 'nature',
  min_guests: '1',
  max_guests: '10',
}

describe('CSV parsing', () => {
  it('handles quotes, commas, new lines and the BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
    ])
  })
})

describe('import validation', () => {
  it('accepts a complete activity with a couples package, an add-on and a question', () => {
    const result = validateImport(
      csv([
        activity,
        {
          type: 'package',
          activity_slug: 'swing-ubud',
          package_key: 'couples',
          name_ar: 'باقة الأزواج',
          name_en: 'Couples',
          price: '180',
          pricing: 'per_couple',
          includes_ar: 'دخول|تصوير',
          includes_en: 'Entry|Photos',
        },
        {
          type: 'addon',
          activity_slug: 'swing-ubud',
          name_en: 'Lunch',
          price: '15',
          pricing: 'per_person',
        },
        { type: 'faq', activity_slug: 'swing-ubud', question_en: 'Q?', answer_en: 'A' },
      ]),
      known,
    )
    expect(result.errors).toEqual([])
    const [one] = result.activities
    expect(one?.packages[0]).toMatchObject({
      key: 'couples',
      priceMinor: 18000,
      pricing: 'per_couple',
    })
    expect(one?.packages[0]?.includes).toHaveLength(2)
    expect(one?.addons[0]).toMatchObject({ priceMinor: 1500, pricing: 'per_person' })
    expect(one?.faq).toHaveLength(1)
  })

  it('reports every problem with its line before anything is written', () => {
    const result = validateImport(
      csv([
        activity,
        { ...activity },
        { ...activity, activity_slug: 'already-there' },
        { ...activity, activity_slug: 'bad-people', min_guests: '5', max_guests: '2' },
        { type: 'package', activity_slug: 'nowhere', package_key: 'x', name_en: 'X', price: '1' },
        {
          type: 'package',
          activity_slug: 'swing-ubud',
          package_key: 'neg',
          name_en: 'N',
          price: '-5',
        },
        { type: 'addon', activity_slug: 'swing-ubud', name_en: 'Drone', price: '40' },
        { type: 'addon', activity_slug: 'swing-ubud', name_en: 'Drone', price: '40' },
        { ...activity, activity_slug: 'no-name', name_ar: '', region: 'mars' },
      ]),
      known,
    )
    expect(result.errors.map((e) => [e.line, e.code])).toEqual([
      [3, 'duplicate_slug'],
      [4, 'exists'],
      [5, 'people'],
      [6, 'unknown_activity'],
      [7, 'negative'],
      [9, 'duplicate_addon'],
      [10, 'name'],
      [10, 'region'],
    ])
  })

  it('refuses a file without the template columns', () => {
    expect(validateImport('name,price\nx,1', known).errors).toEqual([{ line: 1, code: 'columns' }])
  })
})

describe('content templates', () => {
  it('fill only the lists that are empty', () => {
    const fill = templateFill('sea', {
      whatToBring: [{ ar: 'x', en: 'x', id: '' }],
      importantNotes: null,
      ageConditions: [],
      suitableFor: null,
      faq: null,
    })
    expect(fill.whatToBring).toBeUndefined()
    expect(fill.importantNotes?.length).toBeGreaterThan(0)
    expect(fill.faq?.length).toBeGreaterThan(0)
  })
})
