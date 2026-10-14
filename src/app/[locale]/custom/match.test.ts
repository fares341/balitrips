/**
 * The handoff's matcher used one of eight answers. These assert that the other
 * seven actually move the result — a test that would have failed against
 * `ACTIVITIES.filter(a => a.cats.some(c => ints.includes(c))).slice(0, 4)` for
 * every case below.
 */

import { describe, expect, it } from 'vitest'

import type { ActivitySummary } from '@/lib/content/types'

import {
  budgetScore,
  rankActivities,
  recommendationCount,
  scoreActivity,
  type MatchInput,
} from './match'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let counter = 0

/** All three locales, so the fixture satisfies `LocalizedText`. */
function label(value: string) {
  return { en: value, ar: value, id: value }
}

function activity(
  slug: string,
  categoryKeys: readonly string[],
  priceMinor: number,
  regionKey: string | null = 'south',
  rating: number | null = 4.5,
): ActivitySummary {
  counter += 1
  return {
    id: `id-${counter}`,
    slug,
    href: `/activities/${slug}`,
    name: label(slug),
    area: null,
    duration: null,
    region:
      regionKey === null ? null : { id: `r-${regionKey}`, key: regionKey, label: label(regionKey) },
    categories: categoryKeys.map((key) => ({
      id: `c-${key}`,
      key,
      label: label(key),
      icon: null,
    })),
    priceMinor,
    currency: 'USD',
    rating,
    reviewCount: 10,
    hero: null,
  }
}

function input(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    activities: [],
    interests: [],
    theme: 'family',
    travellers: 2,
    days: 4,
    budgetTier: 'mid',
    wantsDriver: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('recommendationCount', () => {
  it('scales with trip length instead of always returning four', () => {
    expect(recommendationCount(1)).toBe(3)
    expect(recommendationCount(5)).toBe(5)
    expect(recommendationCount(30)).toBe(8)
  })

  it('falls back to a usable count when the dates are incomplete', () => {
    expect(recommendationCount(null)).toBe(4)
  })
})

describe('budgetScore', () => {
  it('rewards the requested category and penalises dearer ones', () => {
    const economy = activity('economy', ['nature'], 2_000)
    const mid = activity('mid', ['nature'], 6_000)
    const luxury = activity('luxury', ['nature'], 15_000)
    expect(budgetScore(mid, 'mid')).toBeGreaterThan(budgetScore(economy, 'mid'))
    expect(budgetScore(economy, 'mid')).toBeGreaterThan(budgetScore(luxury, 'mid'))
    expect(budgetScore(luxury, 'economy')).toBeLessThan(budgetScore(luxury, 'mid'))
    expect(budgetScore(luxury, 'luxury')).toBeGreaterThan(budgetScore(economy, 'luxury'))
  })
})

describe('scoreActivity', () => {
  it('rewards a ticked interest', () => {
    const surf = activity('surf', ['beach'], 5_000)
    const withInterest = scoreActivity(surf, input({ interests: ['beach'] }))
    const without = scoreActivity(surf, input({ interests: ['culture'] }))
    expect(withInterest).toBeGreaterThan(without)
  })

  it('uses the theme even when nothing was ticked', () => {
    const spa = activity('spa', ['spa', 'romantic'], 5_000)
    expect(scoreActivity(spa, input({ theme: 'honey' }))).toBeGreaterThan(
      scoreActivity(spa, input({ theme: 'youth' })),
    )
  })

  it('prefers what fits the budget category', () => {
    const cheap = activity('cheap', ['nature'], 2_000)
    const dear = activity('dear', ['nature'], 90_000)
    const answers = input({ interests: ['nature'], budgetTier: 'economy', days: 4 })
    expect(scoreActivity(cheap, answers)).toBeGreaterThan(scoreActivity(dear, answers))
  })

  it('ignores price in another currency rather than comparing raw integers', () => {
    const foreign = { ...activity('foreign', ['nature'], 9_000_000), currency: 'IDR' }
    const local = activity('local', ['nature'], 9_000_000)
    const answers = input({ interests: ['nature'], budgetTier: 'economy' })
    // The local one is punished for being a luxury price on an economy
    // budget; the foreign one is not scored on budget at all.
    expect(scoreActivity(foreign, answers)).toBeGreaterThan(scoreActivity(local, answers))
  })

  it('reads party size: a large group is not booking a couples spa', () => {
    const spa = activity('spa', ['spa', 'romantic'], 5_000)
    expect(scoreActivity(spa, input({ travellers: 9 }))).toBeLessThan(
      scoreActivity(spa, input({ travellers: 2 })),
    )
  })

  it('reads party size: family activities rise for a large group', () => {
    const park = activity('park', ['family', 'kids'], 5_000)
    expect(scoreActivity(park, input({ travellers: 9 }))).toBeGreaterThan(
      scoreActivity(park, input({ travellers: 1 })),
    )
  })
})

describe('rankActivities', () => {
  /**
   * Ratings descend so the first pick is determined by merit rather than by
   * the slug tie-break — region shaping only has something to shape once the
   * seed is settled, which is also true of the real catalogue.
   */
  const catalogue = [
    activity('ubud-a', ['culture'], 4_000, 'ubud', 4.9),
    activity('ubud-b', ['culture'], 4_000, 'ubud', 4.8),
    activity('ubud-c', ['culture'], 4_000, 'ubud', 4.7),
    activity('north-a', ['culture'], 4_000, 'north', 4.6),
    activity('east-a', ['culture'], 4_000, 'east', 4.5),
  ]

  it('spreads across regions when a driver was requested', () => {
    const picked = rankActivities(
      input({
        activities: catalogue,
        interests: ['culture'],
        wantsDriver: true,
        days: 3,
      }),
      3,
    )
    const regions = new Set(picked.map((one) => one.region?.key))
    expect(regions.size).toBe(3)
  })

  it('clusters in one region when there is no driver', () => {
    const picked = rankActivities(
      input({ activities: catalogue, interests: ['culture'], wantsDriver: false, days: 3 }),
      3,
    )
    const regions = new Set(picked.map((one) => one.region?.key))
    expect(regions.size).toBe(1)
  })

  it('returns a stable order for identical input', () => {
    const answers = input({ activities: catalogue, interests: ['culture'], days: 4 })
    expect(rankActivities(answers).map((one) => one.slug)).toEqual(
      rankActivities(answers).map((one) => one.slug),
    )
  })

  it('never returns more than the catalogue holds', () => {
    expect(rankActivities(input({ activities: catalogue.slice(0, 2), days: 8 }))).toHaveLength(2)
  })

  it('lets the trip length decide how much is proposed', () => {
    const answers = { activities: catalogue, interests: ['culture'] }
    expect(rankActivities(input({ ...answers, days: 2 }))).toHaveLength(3)
    expect(rankActivities(input({ ...answers, days: 5 }))).toHaveLength(5)
  })
})
