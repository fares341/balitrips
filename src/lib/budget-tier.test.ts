import { describe, expect, it } from 'vitest'

import {
  BUDGET_TIER_THRESHOLDS,
  isBudgetTier,
  parseBudgetTier,
  tierForLegacyBudget,
  tierForPrice,
  tiersFromPrices,
} from './budget-tier'

describe('tierForPrice', () => {
  it('splits activities at the activity thresholds', () => {
    const [low, high] = BUDGET_TIER_THRESHOLDS.activity
    expect(tierForPrice((low - 1) * 100, 'SAR', 'activity')).toBe('economy')
    expect(tierForPrice(low * 100, 'SAR', 'activity')).toBe('mid')
    expect(tierForPrice((high - 1) * 100, 'sar', 'activity')).toBe('mid')
    expect(tierForPrice(high * 100, 'SAR', 'activity')).toBe('luxury')
  })

  it('uses each kind’s own scale', () => {
    expect(tierForPrice(221_25, 'SAR', 'itinerary')).toBe('economy')
    expect(tierForPrice(450_000, 'SAR', 'package')).toBe('mid')
    expect(tierForPrice(708_750, 'SAR', 'package')).toBe('luxury')
  })

  it('compares a per-guest package per person', () => {
    expect(tierForPrice(1875_00, 'SAR', 'package')).toBe('economy')
    expect(tierForPrice(1875_00, 'SAR', 'package', { perGuest: true })).toBe('mid')
  })

  it('never classifies a price it cannot judge', () => {
    expect(tierForPrice(0, 'SAR', 'activity')).toBeNull()
    expect(tierForPrice(1_000_000, 'IDR', 'activity')).toBeNull()
    expect(tierForPrice(Number.NaN, 'SAR', 'activity')).toBeNull()
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

describe('tiersFromPrices', () => {
  const usd = (minor: number) => ({ minor, currency: 'USD' })

  it('splits the six live packages into thirds instead of six economy ones', () => {
    const prices = [42000, 48000, 69000, 62000, 54000, 58000]
    expect(tiersFromPrices(prices, usd)).toEqual([
      'economy',
      'economy',
      'luxury',
      'luxury',
      'mid',
      'mid',
    ])
  })

  it('keeps equal prices together and an all-equal catalogue in mid-range', () => {
    expect(tiersFromPrices([5000, 5000, 9000], usd)).toEqual(['economy', 'economy', 'luxury'])
    expect(tiersFromPrices([5000, 5000], usd)).toEqual(['mid', 'mid'])
  })

  it('gives no tier to an item without a usable price', () => {
    expect(tiersFromPrices([0, 5000, 9000], usd)).toEqual([null, 'economy', 'mid'])
    expect(tiersFromPrices([1], () => null)).toEqual([null])
  })
})
