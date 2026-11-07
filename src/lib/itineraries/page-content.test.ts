import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { deliveredPdf } from './delivered-pdf'
import { PAGE_SECTION_KEYS, normalisePageContent, pageText, visibleSections } from './page-content'

const ROOT = join(__dirname, '..', '..', '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('itinerary page content (Studio «محتوى الصفحة»)', () => {
  it('empty / null = the site defaults, every section shown in the old order', () => {
    const content = normalisePageContent(null)
    expect(content.texts).toEqual({})
    expect(content.benefits).toBeNull()
    expect(content.how).toBeNull()
    expect(visibleSections(content)).toEqual([...PAGE_SECTION_KEYS])
  })

  it('the 0049 backfill renders exactly what the page rendered before', () => {
    const sql = read('drizzle/0049_itinerary_page_content.sql')
    const json = /'(\{.*\})'::jsonb/.exec(sql)?.[1]
    expect(json).toBeDefined()
    expect(normalisePageContent(JSON.parse(json ?? '{}'))).toEqual(normalisePageContent(null))
  })

  it('is an allow-list: unknown keys, languages and day content never survive', () => {
    const content = normalisePageContent({
      texts: { daysTitle: { ar: ' أيامك ', fr: 'x' }, secret: { ar: 'no' } },
      days: [{ title: { ar: 'Day 1: Tanah Lot' } }],
      linkedPlaceIds: ['p1'],
      benefits: [
        { icon: 'pin', label: { ar: 'خريطة' }, text: { ar: 'نص' }, placeId: 'x' },
        { icon: 'not-an-icon', label: { en: 'Tips' } },
        { icon: 'pin', label: {} },
      ],
      sections: [{ key: 'faq', hidden: true }, { key: 'faq' }, { key: 'evil' }, { key: 'get' }],
    })
    const json = JSON.stringify(content)
    for (const word of ['secret', 'Tanah Lot', 'linkedPlaceIds', 'placeId', '"fr"', 'evil']) {
      expect(json).not.toContain(word)
    }
    expect(content.texts.daysTitle).toEqual({ ar: 'أيامك' })
    expect(content.benefits).toEqual([
      { icon: 'pin', label: { ar: 'خريطة' }, text: { ar: 'نص' } },
      { icon: 'tip', label: { en: 'Tips' }, text: {} },
    ])
    expect(content.sections[0]).toEqual({ key: 'faq', hidden: true })
    expect(content.sections[1]).toEqual({ key: 'get', hidden: false })
    expect(content.sections).toHaveLength(PAGE_SECTION_KEYS.length)
    expect(visibleSections(content)).not.toContain('faq')
  })

  it('a text falls back across languages, and is null when never typed', () => {
    const content = normalisePageContent({ texts: { customCta: { ar: 'خصّص' } } })
    expect(pageText(content, 'customCta', 'en')).toBe('خصّص')
    expect(pageText(content, 'customTitle', 'ar')).toBeNull()
  })

  it('the public page reads every block from Studio with a translation fallback', () => {
    const page = read('src/app/[locale]/itineraries/[slug]/page.tsx')
    for (const key of ['heroFrom', 'getTitle', 'daysTitle', 'customCta', 'boxTitle', 'trustPay']) {
      expect(page).toContain(`text('${key}'`)
    }
    expect(page).toContain('visibleSections(page)')
  })
})

describe('which PDF the buyer receives', () => {
  const generated = [
    { locale: 'ar', objectKey: 'gen/ar.pdf' },
    { locale: 'en', objectKey: 'gen/en.pdf' },
  ]

  it('an uploaded file for the language wins over the generated one', () => {
    expect(deliveredPdf({ locale: 'ar', uploadedKeys: { ar: 'up/ar.pdf' }, generated })).toEqual({
      kind: 'uploaded',
      locale: 'ar',
      objectKey: 'up/ar.pdf',
    })
  })

  it('no upload in the language: the uploaded fallback-language file', () => {
    expect(
      deliveredPdf({
        locale: 'id',
        uploadedKeys: { en: 'up/en.pdf' },
        generated,
        fallbackLocale: 'en',
      }),
    ).toEqual({ kind: 'uploaded', locale: 'en', objectKey: 'up/en.pdf' })
  })

  it('an upload in another language only does not hide the generated file', () => {
    expect(
      deliveredPdf({
        locale: 'en',
        uploadedKeys: { ar: 'up/ar.pdf' },
        generated,
        fallbackLocale: 'en',
      }),
    ).toEqual({ kind: 'generated', locale: 'en', objectKey: 'gen/en.pdf' })
  })

  it('nothing uploaded: the generated file, then the fallback language, then none', () => {
    expect(deliveredPdf({ locale: 'ar', uploadedKeys: null, generated })).toMatchObject({
      kind: 'generated',
      locale: 'ar',
    })
    expect(
      deliveredPdf({ locale: 'id', uploadedKeys: {}, generated, fallbackLocale: 'en' }),
    ).toMatchObject({ kind: 'generated', locale: 'en' })
    expect(deliveredPdf({ locale: 'id', uploadedKeys: {}, generated: [] })).toEqual({
      kind: 'none',
    })
  })

  it('delivery uses this same rule', () => {
    expect(read('src/app/[locale]/account/_lib/queries.ts')).toContain('deliveredPdf({')
  })
})
