import { describe, expect, it, vi } from 'vitest'

vi.mock('@/db', () => ({ db: {} }))

const { compareHits } = await import('./places')
const { combinePermissions, planExpiry } = await import('@/lib/entitlements/plans')

const base = { distanceKm: null, inRegion: false, priority: 0, visible: true, saves: 0, name: 'A' }

describe('result prioritisation (doc 2.4)', () => {
  it('nearest first when a location is known', () => {
    const near = { ...base, distanceKm: 1, priority: 0 }
    const far = { ...base, distanceKm: 4, priority: 99 }
    expect([far, near].sort(compareHits)[0]).toBe(near)
  })
  it('then inside the chosen area, then admin priority, then visible, then most saved', () => {
    const inside = { ...base, inRegion: true }
    const promoted = { ...base, priority: 5 }
    const locked = { ...base, visible: false, saves: 100 }
    const popular = { ...base, saves: 7 }
    const sorted = [locked, popular, promoted, inside].sort(compareHits)
    expect(sorted).toEqual([inside, promoted, popular, locked])
  })
})

describe('plans', () => {
  it('computes expiry from duration, null for lifetime', () => {
    const start = new Date('2026-10-12T00:00:00Z')
    expect(planExpiry(null, start)).toBeNull()
    expect(planExpiry(30, start)?.toISOString()).toBe('2026-11-11T00:00:00.000Z')
  })
  it('combines live grants: trip if any allows it; manual grants allow it', () => {
    expect(combinePermissions([]).canUseTrip).toBe(false)
    expect(combinePermissions([]).canSaveFavorites).toBe(true)
    expect(
      combinePermissions([{ kind: 'map_access', canUseTrip: false, canSaveFavorites: true }])
        .canUseTrip,
    ).toBe(false)
    expect(
      combinePermissions([{ kind: 'vip', canUseTrip: null, canSaveFavorites: null }]).canUseTrip,
    ).toBe(true)
    const both = combinePermissions([
      { kind: 'map_access', canUseTrip: false, canSaveFavorites: true },
      { kind: 'vip', canUseTrip: true, canSaveFavorites: true },
    ])
    expect(both.canUseTrip).toBe(true)
    expect(both.entitlements.has('vip')).toBe(true)
  })
})
