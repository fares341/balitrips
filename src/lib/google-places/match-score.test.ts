import { describe, expect, it } from 'vitest'

import {
  decideMatch,
  distanceScore,
  nameSimilarity,
  nameTokens,
  normalizeName,
  searchQuery,
  typeScore,
} from './match-score'

describe('normalizeName', () => {
  it('folds English case, accents, punctuation and stopwords', () => {
    expect(normalizeName('The Café  Batu-Bolong, Bali!')).toBe('cafe batu bolong')
    expect(normalizeName('Tegenungan Waterfall')).toBe('tegenungan waterfall')
  })

  it('folds Indonesian generic words onto the same tokens as English', () => {
    expect(normalizeName('Pantai Kuta')).toBe('beach kuta')
    expect(normalizeName('Kuta Beach')).toBe('kuta beach')
    expect(normalizeName('Air Terjun Tegenungan')).toBe('waterfall tegenungan')
    expect(normalizeName('Pura Tanah Lot')).toBe('temple tanah lot')
    expect(normalizeName('Rumah Sakit Siloam')).toBe('hospital siloam')
    expect(normalizeName('Danau Beratan di Bali')).toBe('lake beratan')
  })

  it('folds Arabic diacritics, letter variants, tatweel and the article', () => {
    expect(normalizeName('شَاطِئ كوتا')).toBe(normalizeName('شاطئ كوتا'))
    expect(normalizeName('الشاطئ')).toBe('beach')
    expect(normalizeName('شلالات تيجينونجان')).toBe('waterfall تيجينونجان')
    expect(normalizeName('معبد تانـــاه لوت')).toBe('temple تاناه لوت')
    expect(normalizeName('بحيرة براتان في بالي')).toBe('lake براتان')
    expect(normalizeName('مستشفى سيلوام')).toBe('hospital سيلوام')
  })

  it('returns no tokens for empty input', () => {
    expect(nameTokens(null)).toEqual([])
    expect(nameTokens('  ')).toEqual([])
  })
})

describe('nameSimilarity', () => {
  it('matches the same place across languages and word order', () => {
    expect(nameSimilarity('Kuta Beach', 'Pantai Kuta')).toBe(1)
    expect(nameSimilarity('Tegenungan Waterfall', 'Air Terjun Tegenungan')).toBe(1)
    expect(nameSimilarity('Tegenungan', 'Tegenungan Waterfall')).toBeGreaterThanOrEqual(0.9)
  })

  it('tolerates small spelling differences', () => {
    expect(nameSimilarity('Uluwatu Temple', 'Pura Luhur Uluwatu')).toBeGreaterThanOrEqual(0.6)
    expect(nameSimilarity('Batu Bolong Beach', 'Batubolong Beach')).toBeGreaterThan(0.8)
  })

  it('does not match two places that only share a generic word', () => {
    expect(nameSimilarity('Kuta Beach', 'Sanur Beach')).toBeLessThan(0.5)
    expect(nameSimilarity('Pantai', 'Beach Club')).toBeLessThanOrEqual(0.5)
  })

  it('is 0 for empty names', () => {
    expect(nameSimilarity('', 'Kuta')).toBe(0)
  })
})

describe('distance and type scores', () => {
  it('scores distance from 1 (≤50 m) down to 0 (≥1.5 km)', () => {
    expect(distanceScore(10)).toBe(1)
    expect(distanceScore(775)).toBeCloseTo(0.5, 2)
    expect(distanceScore(2000)).toBe(0)
    expect(distanceScore(Number.NaN)).toBe(0)
  })

  it('scores type compatibility, neutral when unknown', () => {
    expect(typeScore('beaches', ['beach', 'natural_feature'])).toBe(1)
    expect(typeScore('beaches', ['restaurant'])).toBe(0.2)
    expect(typeScore(null, ['restaurant'])).toBe(0.5)
    expect(typeScore('cafes', [])).toBe(0.5)
  })
})

describe('decideMatch', () => {
  // Kuta Beach, roughly.
  const ours = {
    names: ['Kuta Beach', 'شاطئ كوتا', 'Pantai Kuta'],
    lat: -8.7177,
    lon: 115.1686,
    categoryKey: 'beaches',
  }

  it('auto-accepts a close, well-named, type-compatible candidate', () => {
    const decision = decideMatch(ours, [
      {
        id: 'ChIJ_kuta_beach_01',
        name: 'Pantai Kuta',
        lat: -8.718,
        lon: 115.169,
        types: ['beach'],
      },
      {
        id: 'ChIJ_kuta_mall_002',
        name: 'Beachwalk Shopping Center',
        lat: -8.7175,
        lon: 115.1692,
        types: ['shopping_mall'],
      },
    ])
    expect(decision.status).toBe('auto')
    expect(decision.best?.id).toBe('ChIJ_kuta_beach_01')
  })

  it('sends a good name that is too far away to review', () => {
    const decision = decideMatch(ours, [
      {
        id: 'ChIJ_kuta_far_0001',
        name: 'Kuta Beach',
        lat: -8.723,
        lon: 115.1686,
        types: ['beach'],
      },
    ])
    expect(decision.best!.distanceM).toBeGreaterThan(150)
    expect(decision.status).toBe('review')
  })

  it('sends two equally good candidates to review instead of guessing', () => {
    const decision = decideMatch(ours, [
      {
        id: 'ChIJ_kuta_beach_a1',
        name: 'Kuta Beach',
        lat: -8.7178,
        lon: 115.1687,
        types: ['beach'],
      },
      {
        id: 'ChIJ_kuta_beach_b2',
        name: 'Kuta Beach',
        lat: -8.7179,
        lon: 115.1687,
        types: ['beach'],
      },
    ])
    expect(decision.status).toBe('review')
  })

  it('reports no match for unrelated or absent candidates', () => {
    expect(decideMatch(ours, []).status).toBe('none')
    expect(
      decideMatch(ours, [
        {
          id: 'ChIJ_other_place01',
          name: 'Warung Made',
          lat: -8.73,
          lon: 115.18,
          types: ['restaurant'],
        },
      ]).status,
    ).toBe('none')
  })
})

describe('searchQuery', () => {
  it('adds the area and Bali once', () => {
    expect(searchQuery('Tegenungan Waterfall', 'Gianyar')).toBe('Tegenungan Waterfall Gianyar Bali')
    expect(searchQuery('Bali Zoo', null)).toBe('Bali Zoo')
  })
})
