import { describe, expect, it } from 'vitest'

import {
  FAMILY_4_DAYS_DAYS,
  FAMILY_4_DAYS_PRICE_MINOR,
  FAMILY_4_DAYS_PUBLIC,
  FAMILY_4_DAYS_WITH_MAP_TARGET_MINOR,
  matchCatalog,
  normalizeName,
  PRIVATE_TERMS,
} from './family-4-days'

const LOCALES = ['ar', 'en', 'id'] as const

function publicTexts(): string[] {
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

describe('family 4 days seed — public copy', () => {
  it('is complete in ar / en / id', () => {
    for (const text of publicTexts()) expect(text.trim()).not.toBe('')
    expect(FAMILY_4_DAYS_PUBLIC.faq).toHaveLength(7)
    expect(FAMILY_4_DAYS_PUBLIC.moods).toHaveLength(FAMILY_4_DAYS_DAYS.length)
  })

  it('never names a place, area or activity', () => {
    const joined = publicTexts().join('\n').toLowerCase()
    for (const term of PRIVATE_TERMS) expect(joined).not.toContain(term.toLowerCase())
    for (const day of FAMILY_4_DAYS_DAYS)
      for (const stop of day.stops) expect(joined).not.toContain(stop.name.toLowerCase())
  })

  it('never mentions how it was made', () => {
    expect(publicTexts().join(' ')).not.toMatch(/\b(AI|Claude)\b|ذكاء اصطناعي/i)
  })

  it('prices 149 SAR, 199 SAR with the map', () => {
    expect(FAMILY_4_DAYS_PRICE_MINOR).toBe(14_900)
    expect(FAMILY_4_DAYS_WITH_MAP_TARGET_MINOR).toBe(19_900)
  })
})

describe('catalog matching', () => {
  const rows = [
    { id: 'a', names: ['Kuber ATV Bali Adventure'] },
    { id: 'b', names: ['Tanjung Benoa Water Sports'] },
    { id: 'c', names: ['Milano Seminyak'] },
    { id: 'd', names: ['Milano Ubud'] },
  ]
  it('matches exact, then a single loose hit, and never guesses', () => {
    expect(normalizeName('KUBER ATV BALI')).toBe('kuberatv')
    expect(matchCatalog('Tanjung Benoa Water Sports', rows)).toEqual({ kind: 'found', id: 'b' })
    expect(matchCatalog('KUBER ATV BALI', rows)).toEqual({ kind: 'found', id: 'a' })
    expect(matchCatalog('Milano', rows).kind).not.toBe('found')
    expect(matchCatalog('Cretya Ubud', rows)).toEqual({ kind: 'missing' })
  })
})
