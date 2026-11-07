import { describe, expect, it } from 'vitest'

import { normalisePageContent } from '../page-content'
import { FAMILY_4_DAYS_DAYS, FAMILY_4_DAYS_PUBLIC, PRIVATE_TERMS } from './family-4-days'
import {
  hasSellablePrice,
  ITINERARY_SEEDS,
  mapsUrlIssue,
  pageContentFor,
  privateDayText,
  seedBySlug,
} from './index'
import { publicTextsOf, PUBLIC_BANNED_TERMS } from './shared'

const LOCALES = ['ar', 'en', 'id'] as const

function family4PublicTexts(): string[] {
  const p = FAMILY_4_DAYS_PUBLIC
  const all = [
    p.name,
    p.blurb,
    p.intro,
    p.tripType,
    p.seoTitle,
    p.seoDescription,
    ...p.audience,
    ...p.moods,
  ]
  const out = all.flatMap((one) => LOCALES.map((l) => one[l]))
  for (const stat of p.stats) out.push(stat.value, ...LOCALES.map((l) => stat.label[l]))
  for (const row of p.faq)
    out.push(...LOCALES.map((l) => row.q[l]), ...LOCALES.map((l) => row.a[l]))
  return out
}

/** Every stop name of all seven programmes. */
const ALL_STOP_NAMES = [
  ...FAMILY_4_DAYS_DAYS.flatMap((d) => d.stops.map((s) => s.name)),
  ...ITINERARY_SEEDS.flatMap((seed) => seed.days.flatMap((d) => d.stops.map((s) => s.name))),
]
const BANNED = [...new Set([...PUBLIC_BANNED_TERMS, ...PRIVATE_TERMS, ...ALL_STOP_NAMES])]

const SEVEN: { slug: string; texts: string[] }[] = [
  { slug: 'bali-4d-family', texts: family4PublicTexts() },
  ...ITINERARY_SEEDS.map((seed) => ({
    slug: seed.slug,
    texts: [
      ...publicTextsOf(seed.public),
      // What the seed writes into the page-content document is public too.
      JSON.stringify(pageContentFor(seed)),
    ],
  })),
]

describe('itinerary seeds — public copy never leaks the plan', () => {
  it('covers all seven programmes', () => {
    expect(SEVEN).toHaveLength(7)
    expect(new Set(SEVEN.map((s) => s.slug)).size).toBe(7)
  })

  for (const { slug, texts } of SEVEN) {
    it(`${slug}: no place, area, city or activity name`, () => {
      const joined = texts.join('\n').toLowerCase()
      for (const term of BANNED)
        expect(joined, `«${term}» in ${slug}`).not.toContain(term.toLowerCase())
    })
    it(`${slug}: never mentions how it was made`, () => {
      expect(texts.join(' ')).not.toMatch(/\b(AI|Claude)\b|ذكاء اصطناعي/i)
    })
  }
})

describe('itinerary seeds — content', () => {
  for (const seed of ITINERARY_SEEDS) {
    describe(seed.slug, () => {
      const p = seed.public
      it('is complete in ar / en / id', () => {
        for (const text of publicTextsOf(p)) expect(text.trim()).not.toBe('')
        for (const day of seed.days) {
          for (const l of LOCALES) {
            expect(day.title[l].trim()).not.toBe('')
            expect(day.description[l].trim()).not.toBe('')
            for (const stop of day.stops) expect(stop.note[l].trim()).not.toBe('')
          }
        }
      })
      it('has the right shape', () => {
        const days = Number(/(\d)d/.exec(seed.slug)![1])
        expect(seed.days.map((d) => d.dayNumber)).toEqual(
          Array.from({ length: days }, (_, i) => i + 1),
        )
        expect(p.moods).toHaveLength(days)
        expect(p.moodLines).toHaveLength(days)
        expect(p.benefits.length).toBeGreaterThanOrEqual(4)
        expect(p.benefits.length).toBeLessThanOrEqual(6)
        expect(p.how).toHaveLength(3)
        expect(p.faq.length).toBeGreaterThanOrEqual(5)
        expect(p.faq.length).toBeLessThanOrEqual(8)
      })
      it('has no invented price and well-formed links', () => {
        expect(seed.priceMinor).toBeNull()
        expect(hasSellablePrice(seed.priceMinor)).toBe(false)
        for (const day of seed.days) {
          // The day's places table allows a place once per day.
          expect(new Set(day.stops.map((s) => s.name)).size).toBe(day.stops.length)
          for (const stop of day.stops) {
            expect(stop.mapsUrl).toMatch(/^https:\/\/maps\.app\.goo\.gl\//)
          }
        }
      })
      it('keeps every stop and link in the private day text', () => {
        for (const day of seed.days) {
          const text = privateDayText(day, 'ar')
          for (const stop of day.stops) {
            expect(text).toContain(stop.name)
            expect(text).toContain(stop.mapsUrl!)
          }
        }
      })
      it('writes page content that survives the Studio cleaner', () => {
        const doc = pageContentFor(seed)
        const again = normalisePageContent(doc)
        expect(again.benefits).toHaveLength(p.benefits.length)
        expect(again.how).toHaveLength(3)
        expect(again.sections.find((s) => s.key === 'custom')?.hidden).toBe(true)
      })
    })
  }

  it('programmes stay distinct', () => {
    const fingerprints = ITINERARY_SEEDS.map((seed) =>
      seed.days.map((d) => d.stops.map((s) => s.mapsUrl).join(',')).join('|'),
    )
    expect(new Set(fingerprints).size).toBe(ITINERARY_SEEDS.length)
  })

  it('finds seeds by slug', () => {
    expect(seedBySlug('bali-8d-family')?.days).toHaveLength(8)
    expect(seedBySlug('nope')).toBeUndefined()
  })
})

describe('price guard', () => {
  it('never treats zero or missing as sellable', () => {
    expect(hasSellablePrice(0)).toBe(false)
    expect(hasSellablePrice(null)).toBe(false)
    expect(hasSellablePrice(0, { economy: 0 })).toBe(false)
    expect(hasSellablePrice(14_900)).toBe(true)
    expect(hasSellablePrice(0, { mid: 9_900 })).toBe(true)
  })
  it('checks map link format only', () => {
    expect(mapsUrlIssue('https://maps.app.goo.gl/16PfsAu94SXS4VXk9?g_st=ic')).toBeNull()
    expect(mapsUrlIssue('https://maps.app.goo.gl/JUsnRmnidHKLyC3y7?')).toBe('unusual format')
    expect(mapsUrlIssue(null)).toBe('missing')
  })
})
