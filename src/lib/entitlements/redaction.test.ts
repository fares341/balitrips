import { describe, expect, it } from 'vitest'

import {
  buildMapPayload,
  emptyEntitlements,
  grants,
  makeEntitlementSet,
  redactPlace,
  type FullMapPlace,
} from './redaction'

function place(over: Partial<FullMapPlace> = {}): FullMapPlace {
  return {
    id: 'p1',
    slug: 'uluwatu-temple',
    name: { en: 'Uluwatu Temple', ar: 'معبد أولواتو', id: 'Pura Uluwatu' },
    category: { en: 'Temple', ar: 'معبد', id: 'Pura' },
    description: { en: 'Clifftop sea temple.', ar: '...', id: '...' },
    lat: -8.8291,
    lon: 115.0849,
    rating: 4.8,
    openingHours: '07:00 – 19:00',
    tags: ['Temples', 'Popular'],
    heroImageUrl: 'https://cdn.example.com/uluwatu.avif',
    activitySlug: 'uluwatu-sunset',
    isFree: false,
    requiredEntitlement: 'map_access',
    isHiddenGem: false,
    regionKey: 'south',
    regionLabel: { en: 'South Bali', ar: 'جنوب بالي', id: 'Bali Selatan' },
    categoryKey: null,
    categoryLabel: null,
    tagKeys: ['temples'],
    canFavorite: true,
    canAddToTrip: true,
    priority: 0,
    ...over,
  }
}

describe('entitlement implication', () => {
  it('makes VIP a superset of map access', () => {
    expect(grants('vip', 'map_access')).toBe(true)
    expect(grants('vip', 'vip')).toBe(true)
  })

  it('does not let map access reach VIP content', () => {
    // The prototype wired both the $19 and $39 tiers to one handler, so VIP
    // recorded nothing and gated nothing.
    expect(grants('map_access', 'vip')).toBe(false)
  })

  it('expands implications when building a set', () => {
    const held = makeEntitlementSet(['vip'])
    expect(held.has('map_access')).toBe(true)
    expect(held.has('vip')).toBe(true)
  })
})

describe('redaction', () => {
  it('leaks nothing about a locked place', () => {
    const result = redactPlace(place(), emptyEntitlements())
    expect(result.locked).toBe(true)

    // The whole point: assert the sensitive fields are ABSENT from the
    // object, not merely blurred or masked in the UI.
    const serialised = JSON.stringify(result)
    expect(serialised).not.toContain('Uluwatu')
    expect(serialised).not.toContain('أولواتو')
    expect(serialised).not.toContain('8.82')
    expect(serialised).not.toContain('115.08')
    expect(serialised).not.toContain('cdn.example.com')
    expect(serialised).not.toContain('uluwatu-sunset')
    expect(serialised).not.toContain('4.8')

    expect(Object.keys(result).sort()).toEqual(['id', 'locked', 'requiredEntitlement'])
  })

  it('returns free places in full to anonymous visitors', () => {
    const result = redactPlace(place({ isFree: true }), emptyEntitlements())
    expect(result.locked).toBe(false)
    expect(JSON.stringify(result)).toContain('Uluwatu')
  })

  it('returns locked places in full once entitled', () => {
    const result = redactPlace(place(), makeEntitlementSet(['map_access']))
    expect(result.locked).toBe(false)
    expect(JSON.stringify(result)).toContain('115.08')
  })

  it('still hides VIP places from a map-access holder', () => {
    const vipPlace = place({ requiredEntitlement: 'vip' })
    expect(redactPlace(vipPlace, makeEntitlementSet(['map_access'])).locked).toBe(true)
    expect(redactPlace(vipPlace, makeEntitlementSet(['vip'])).locked).toBe(false)
  })
})

describe('map payload', () => {
  // Distinct names so the leak assertions below can tell which place a
  // string came from. The free one is expected to appear in full.
  const named = (id: string, en: string, over: Partial<FullMapPlace> = {}) =>
    place({ id, name: { en, ar: en, id: en }, ...over })

  const places = [
    named('a', 'Free Beach', { isFree: true, lat: -8.1111, lon: 114.1111 }),
    named('b', 'Secret Waterfall'),
    named('c', 'Hidden Temple'),
    named('d', 'VIP Cliff Villa', { requiredEntitlement: 'vip' }),
  ]

  it('reports a locked count without revealing which places they are', () => {
    const payload = buildMapPayload(places, emptyEntitlements())
    expect(payload.lockedCount).toBe(3)
    expect(payload.unlocked).toBe(false)

    const serialised = JSON.stringify(payload)
    // The free place is legitimately visible to anonymous visitors...
    expect(serialised).toContain('Free Beach')
    // ...but nothing about the locked ones may reach the client.
    expect(serialised).not.toContain('Secret Waterfall')
    expect(serialised).not.toContain('Hidden Temple')
    expect(serialised).not.toContain('VIP Cliff Villa')
    expect(serialised).not.toContain('115.08')
  })

  it('unlocks the map tier but keeps VIP places hidden', () => {
    const payload = buildMapPayload(places, makeEntitlementSet(['map_access']))
    expect(payload.lockedCount).toBe(1)
    expect(payload.unlocked).toBe(true)
  })

  it('unlocks everything for VIP', () => {
    const payload = buildMapPayload(places, makeEntitlementSet(['vip']))
    expect(payload.lockedCount).toBe(0)
  })
})

describe('placeAccess (Hidden Gems)', async () => {
  const { placeAccess, canSeePlace, makeEntitlementSet } = await import('./redaction')

  it('forces Hidden Gems to VIP even when the row says free', () => {
    expect(
      placeAccess({ isFree: true, requiredEntitlement: 'map_access', isHiddenGem: true }),
    ).toEqual({
      isFree: false,
      requiredEntitlement: 'vip',
    })
  })
  it('keeps a Hidden Gem locked for map_access holders and open for VIP', () => {
    const gem = { isFree: false, requiredEntitlement: 'map_access', isHiddenGem: true }
    expect(canSeePlace(gem, makeEntitlementSet(['map_access']))).toBe(false)
    expect(canSeePlace(gem, makeEntitlementSet(['vip']))).toBe(true)
  })
  it('fails closed on an unknown requirement', () => {
    expect(placeAccess({ isFree: false, requiredEntitlement: 'gold' }).requiredEntitlement).toBe(
      'vip',
    )
  })
})
