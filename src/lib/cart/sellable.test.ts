import { describe, expect, it } from 'vitest'

import { isSellable } from './sellable'

describe('isSellable', () => {
  it('refuses a sold product with no price', () => {
    for (const kind of ['activity', 'activity_tier', 'itinerary', 'package', 'plan']) {
      expect(isSellable(kind, 0)).toBe(false)
      expect(isSellable(kind, -100)).toBe(false)
      expect(isSellable(kind, Number.NaN)).toBe(false)
      expect(isSellable(kind, 2500)).toBe(true)
    }
  })

  it('leaves lines that are free or priced elsewhere alone', () => {
    // A saved place costs nothing; a driver is priced from its dates.
    expect(isSellable('place', 0)).toBe(true)
    expect(isSellable('driver', 0)).toBe(true)
    expect(isSellable('custom', 0)).toBe(true)
  })
})
