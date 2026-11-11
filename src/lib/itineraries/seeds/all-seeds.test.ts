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
import { areaName, areasLine, normaliseAreas } from '../areas'
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

/** Every stop name of all nine programmes. */
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
  it('covers all nine programmes', () => {
    expect(SEVEN).toHaveLength(9)
    expect(new Set(SEVEN.map((s) => s.slug)).size).toBe(9)
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
        const days = Number(/(\d+)d/.exec(seed.slug)![1])
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
      it('has the owner price and well-formed links', () => {
        const expected = { 6: 10_000, 8: 15_000, 10: 18_000 }[seed.days.length]
        expect(seed.priceMinor).toBe(expected)
        expect(hasSellablePrice(seed.priceMinor)).toBe(true)
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
    expect(seedBySlug('bali-10d-youth')?.days).toHaveLength(10)
    expect(seedBySlug('bali-10d-honeymoon')?.days).toHaveLength(10)
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

/*
 * Areas (client, Nov 2026): the ONE public field that may name places — and
 * only areas from the region taxonomy. Everything else stays forbidden above.
 */
const ALLOWED_AREA_KEYS = new Set(['seminyak', 'ubud', 'uluwatu'])
const STOP_NAMES_LOWER = ALL_STOP_NAMES.map((name) => name.toLowerCase())

describe('itinerary seeds — areas', () => {
  for (const seed of ITINERARY_SEEDS) {
    it(`${seed.slug}: areas are region keys whose nights add up to the stay`, () => {
      expect(seed.areas.length).toBeGreaterThan(0)
      for (const area of seed.areas) expect(ALLOWED_AREA_KEYS.has(area.key)).toBe(true)
      const nights = seed.areas.reduce((n, a) => n + (a.nights ?? 0), 0)
      expect(nights).toBe(seed.days.length)
      // Order follows the days: each area's first day comes after the previous one's.
      const firstDay = seed.areas.map((a) =>
        seed.days.findIndex((d) => d.area.en.toLowerCase() === a.key),
      )
      expect(firstDay.every((v) => v >= 0)).toBe(true)
      expect([...firstDay].sort((a, b) => a - b)).toEqual(firstDay)
    })
    it(`${seed.slug}: the rendered areas line names areas only, nights hidden by default`, () => {
      const doc = normaliseAreas({ showNights: false, items: seed.areas })
      for (const locale of LOCALES) {
        const line = areasLine(doc, locale)
        expect(line).not.toMatch(/\d/)
        for (const part of line.split(' · ')) {
          expect(STOP_NAMES_LOWER).not.toContain(part.toLowerCase())
          expect(seed.areas.map((a) => areaName(a.key, locale))).toContain(part)
        }
      }
      // The area names stay out of every other public field.
      const texts = [...publicTextsOf(seed.public), JSON.stringify(pageContentFor(seed))]
        .join('\n')
        .toLowerCase()
      for (const area of seed.areas)
        for (const locale of LOCALES)
          expect(texts).not.toContain(areaName(area.key, locale).toLowerCase())
    })
  }
  it('10-day seeds: Seminyak 4, Ubud 4, Uluwatu 2', () => {
    for (const slug of ['bali-10d-youth', 'bali-10d-honeymoon'])
      expect(seedBySlug(slug)?.areas).toEqual([
        { key: 'seminyak', nights: 4 },
        { key: 'ubud', nights: 4 },
        { key: 'uluwatu', nights: 2 },
      ])
  })
})
