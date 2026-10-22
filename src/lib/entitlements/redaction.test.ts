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
    parentRegionKey: null,
    parentRegionLabel: null,
    categoryKey: null,
    categoryLabel: null,
    tagKeys: ['temples'],
    tagList: [{ key: 'temples', label: { en: 'Temples', ar: 'المعابد', id: 'Pura' } }],
    detailedDescription: { en: 'Secret cove access', ar: 'مدخل سري', id: 'Akses rahasia' },
    videos: ['https://www.youtube.com/watch?v=abc'],
    gallery: ['https://cdn.example.com/uluwatu-2.avif'],
    subCategoryKeys: ['sights'],
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
    expect(serialised).not.toContain('Secret cove')
    expect(serialised).not.toContain('youtube')

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

  it('keeps Hidden Gems locked even when the row says free', () => {
    expect(
      placeAccess({ isFree: true, requiredEntitlement: 'map_access', isHiddenGem: true }),
    ).toEqual({
      isFree: false,
      requiredEntitlement: 'map_access',
    })
  })
  it('two levels: the map plan (VIP subscription) opens every locked place, gems included', () => {
    const gem = { isFree: false, requiredEntitlement: 'map_access', isHiddenGem: true }
    const oldVip = { isFree: false, requiredEntitlement: 'vip' }
    expect(canSeePlace(gem, makeEntitlementSet(['map_access']))).toBe(true)
    expect(canSeePlace(oldVip, makeEntitlementSet(['map_access']))).toBe(true)
    expect(canSeePlace(gem, makeEntitlementSet(['vip']))).toBe(true)
    expect(canSeePlace(gem, makeEntitlementSet([]))).toBe(false)
  })
  it('an unknown requirement still needs the plan', () => {
    expect(placeAccess({ isFree: false, requiredEntitlement: 'gold' }).requiredEntitlement).toBe(
      'map_access',
    )
  })
})

describe('basic (PDF-only plan)', () => {
  const places = [
    place({ id: 'a', isFree: true }),
    place({ id: 'b' }),
    place({ id: 'c', requiredEntitlement: 'vip' }),
    place({ id: 'd', isHiddenGem: true }),
  ]

  it('implies nothing on the map', () => {
    expect(grants('basic', 'map_access')).toBe(false)
    expect(grants('basic', 'vip')).toBe(false)
    const held = makeEntitlementSet(['basic'])
    expect(held.has('map_access')).toBe(false)
    expect(held.has('vip')).toBe(false)
    expect(held.has('basic')).toBe(false)
    expect(held.kinds.size).toBe(0)
  })

  it('never unlocks a map place', () => {
    const payload = buildMapPayload(places, makeEntitlementSet(['basic']))
    expect(payload.unlocked).toBe(false)
    expect(payload.lockedCount).toBe(3)
    expect(redactPlace(place(), makeEntitlementSet(['basic'])).locked).toBe(true)
  })

  it('treats a place row requiring "basic" as locked, not as open to basic holders', async () => {
    const { placeAccess, canSeePlace } = await import('./redaction')
    expect(placeAccess({ isFree: false, requiredEntitlement: 'basic' }).requiredEntitlement).toBe(
      'map_access',
    )
    expect(
      canSeePlace({ isFree: false, requiredEntitlement: 'basic' }, makeEntitlementSet(['basic'])),
    ).toBe(false)
  })

  it('adds nothing when combined with map access', () => {
    const held = makeEntitlementSet(['basic', 'map_access'])
    expect(held.has('map_access')).toBe(true)
    expect(held.has('vip')).toBe(false)
  })
})
