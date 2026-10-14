import { describe, expect, it } from 'vitest'

import {
  BUDGET_TIER_THRESHOLDS,
  isBudgetTier,
  parseBudgetTier,
  tierForLegacyBudget,
  tierForPrice,
} from './budget-tier'

describe('tierForPrice', () => {
  it('splits activities at the activity thresholds', () => {
    const [low, high] = BUDGET_TIER_THRESHOLDS.activity
    expect(tierForPrice((low - 1) * 100, 'USD', 'activity')).toBe('economy')
    expect(tierForPrice(low * 100, 'USD', 'activity')).toBe('mid')
    expect(tierForPrice((high - 1) * 100, 'usd', 'activity')).toBe('mid')
    expect(tierForPrice(high * 100, 'USD', 'activity')).toBe('luxury')
  })

  it('uses each kind’s own scale', () => {
    expect(tierForPrice(59_00, 'USD', 'itinerary')).toBe('economy')
    expect(tierForPrice(120_000, 'USD', 'package')).toBe('mid')
    expect(tierForPrice(189_000, 'USD', 'package')).toBe('luxury')
  })

  it('compares a per-guest package per person', () => {
    expect(tierForPrice(500_00, 'USD', 'package')).toBe('economy')
    expect(tierForPrice(500_00, 'USD', 'package', { perGuest: true })).toBe('mid')
  })

  it('never classifies a price it cannot judge', () => {
    expect(tierForPrice(0, 'USD', 'activity')).toBeNull()
    expect(tierForPrice(1_000_000, 'IDR', 'activity')).toBeNull()
    expect(tierForPrice(Number.NaN, 'USD', 'activity')).toBeNull()
  })
})

describe('parseBudgetTier / isBudgetTier', () => {
  it('accepts only the three keys', () => {
    expect(parseBudgetTier('mid')).toBe('mid')
    expect(parseBudgetTier(['luxury', 'economy'])).toBe('luxury')
    expect(parseBudgetTier('cheap')).toBeNull()
    expect(parseBudgetTier(undefined)).toBeNull()
    expect(isBudgetTier('economy')).toBe(true)
    expect(isBudgetTier(3)).toBe(false)
  })
})

describe('tierForLegacyBudget', () => {
  it('maps the old per-person slider value onto a tier', () => {
    expect(tierForLegacyBudget(300_00, 'USD')).toBe('economy')
    expect(tierForLegacyBudget(800_00, 'USD')).toBe('mid')
    expect(tierForLegacyBudget(2_500_00, 'USD')).toBe('luxury')
    expect(tierForLegacyBudget(null, 'USD')).toBeNull()
    expect(tierForLegacyBudget(800_00, 'EUR')).toBeNull()
  })
})
