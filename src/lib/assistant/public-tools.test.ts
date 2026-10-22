import { describe, expect, it } from 'vitest'

import {
  emptyEntitlements,
  makeEntitlementSet,
  type EntitlementSet,
  type FullMapPlace,
} from '@/lib/entitlements/redaction'
import type { PlaceSearchResult } from '@/lib/search/places'

import { runTool } from './engine'
import {
  PUBLIC_TOOLS,
  placeForModel,
  placesForModel,
  type OrderView,
  type PublicCtx,
  type PublicDeps,
} from './public-tools'

function place(over: Partial<FullMapPlace> = {}): FullMapPlace {
  return {
    id: 'p-secret',
    slug: 'secret-cove',
    name: { en: 'Secret Cove', ar: 'الخليج السري', id: 'Teluk Rahasia' },
    category: null,
    description: { en: 'A hidden beach', ar: 'شاطئ مخفي', id: 'Pantai tersembunyi' },
    lat: -8.8123,
    lon: 115.1234,
    rating: null,
    openingHours: null,
    tags: [],
    heroImageUrl: null,
    activitySlug: null,
    isFree: false,
    requiredEntitlement: 'map_access',
    isHiddenGem: false,
    regionKey: 'south',
    regionLabel: { en: 'South Bali', ar: 'جنوب بالي', id: 'Bali Selatan' },
    parentRegionKey: null,
    parentRegionLabel: null,
    categoryKey: null,
    categoryLabel: null,
    tagKeys: [],
    tagList: [],
    detailedDescription: null,
    videos: [],
    gallery: [],
    subCategoryKeys: [],
    canFavorite: true,
    canAddToTrip: true,
    priority: 0,
    ...over,
  }
}

const ORDERS: Record<string, OrderView[]> = {
  'user-alice': [
    {
      orderNumber: 'BT-ALICE-1',
      date: '2026-10-01',
      status: 'paid',
      totalMinor: 12000,
      currency: 'USD',
      items: [
        {
          name: { en: 'Ubud tour', ar: 'جولة أوبود', id: 'Tur Ubud' },
          kind: 'activity',
          bookingStatus: 'confirmed',
          travelDate: '2026-11-02',
        },
      ],
    },
  ],
  'user-bob': [
    {
      orderNumber: 'BT-BOB-9',
      date: '2026-10-02',
      status: 'paid',
      totalMinor: 99000,
      currency: 'USD',
      items: [],
    },
  ],
}

/** Every dependency throws unless the test provides it: nothing is reached by accident. */
function deps(over: Partial<PublicDeps> = {}): PublicDeps & { calls: string[] } {
  const calls: string[] = []
  const handler: ProxyHandler<Partial<PublicDeps>> = {
    get(target, prop) {
      const value = target[prop as keyof PublicDeps]
      if (typeof prop !== 'string' || prop === 'then') return undefined
      if (prop === 'calls') return calls
      if (value === undefined) {
        return () => {
          throw new Error(`unexpected dependency call: ${prop}`)
        }
      }
      return (...args: unknown[]) => {
        calls.push(prop)
        return (value as (...a: unknown[]) => unknown)(...args)
      }
    },
  }
  return new Proxy(over, handler) as PublicDeps & { calls: string[] }
}

function ctx(over: Partial<PublicCtx> & { deps: PublicDeps }): PublicCtx {
  return {
    locale: 'en',
    userId: null,
    held: emptyEntitlements(),
    conversationId: 'conv-1',
    ...over,
  }
}

const call = (name: string, args: unknown, context: PublicCtx) =>
  runTool(PUBLIC_TOOLS, { name, arguments: JSON.stringify(args) }, context)

describe('my_orders: a customer only ever sees their own orders', () => {
  it('reads the session user, ignoring any user id or order number the model sends', async () => {
    const seen: string[] = []
    const d = deps({
      myOrders: async (userId: string) => {
        seen.push(userId)
        return ORDERS[userId] ?? []
      },
    })
    const result = await call(
      'my_orders',
      { userId: 'user-bob', orderNumber: 'BT-BOB-9', email: 'bob@example.com' },
      ctx({ userId: 'user-alice', deps: d }),
    )
    expect(seen).toEqual(['user-alice'])
    const text = JSON.stringify(result.data)
    expect(text).toContain('BT-ALICE-1')
    expect(text).not.toContain('BT-BOB-9')
  })

  it('asks a signed-out visitor to sign in and reads nothing', async () => {
    const d = deps()
    const result = await call('my_orders', {}, ctx({ userId: null, deps: d }))
    expect(result.data).toEqual({ signedIn: false, signIn: '/account' })
    expect(d.calls).toEqual([])
  })
})

describe('map places: locked places stay redacted', () => {
  const locked = place()
  const free = place({
    id: 'p-free',
    slug: 'tanah-lot',
    name: { en: 'Tanah Lot', ar: 'تانا لوت', id: 'Tanah Lot' },
    isFree: true,
    lat: -8.621,
    lon: 115.0868,
  })
  const gem = place({
    id: 'p-gem',
    slug: 'gem-falls',
    name: { en: 'Gem Falls', ar: 'شلال', id: 'Air Terjun' },
    isFree: true,
    isHiddenGem: true,
  })

  it('a locked place and a missing place get the same answer (no name, no coordinates)', () => {
    const lockedAnswer = placeForModel(locked, emptyEntitlements(), 'en')
    const missingAnswer = placeForModel(null, emptyEntitlements(), 'en')
    expect(lockedAnswer).toEqual(missingAnswer)
    const text = JSON.stringify(lockedAnswer)
    for (const leak of ['Secret Cove', 'secret-cove', '-8.81', '115.12', 'hidden beach']) {
      expect(text).not.toContain(leak)
    }
  })

  it('a hidden gem stays locked even when marked free, until the viewer holds the plan', () => {
    expect(placeForModel(gem, emptyEntitlements(), 'en')).toMatchObject({
      available: false,
    })
    expect(placeForModel(gem, makeEntitlementSet(['map_access']), 'en')).toMatchObject({
      available: true,
    })
    expect(placeForModel(gem, makeEntitlementSet(['vip']), 'en')).toMatchObject({
      available: true,
      name: 'Gem Falls',
    })
  })

  it('an entitled viewer sees the place', () => {
    expect(placeForModel(locked, makeEntitlementSet(['map_access']), 'en')).toMatchObject({
      available: true,
      name: 'Secret Cove',
    })
    expect(placeForModel(free, emptyEntitlements(), 'en')).toMatchObject({
      available: true,
      name: 'Tanah Lot',
    })
  })

  it('get_place uses the session entitlements, not anything the model claims', async () => {
    const d = deps({ findPlace: async () => locked })
    const result = await call(
      'get_place',
      { slug: 'secret-cove', entitlement: 'vip', held: ['vip', 'map_access'] },
      ctx({ held: emptyEntitlements(), deps: d }),
    )
    expect(JSON.stringify(result.data)).not.toContain('Secret Cove')
    expect(result.data).toMatchObject({ available: false })
  })

  it('search_places passes the session entitlements through and returns locked places only as a count', async () => {
    const received: EntitlementSet[] = []
    const result: PlaceSearchResult = {
      hits: [
        {
          locked: false,
          id: free.id,
          slug: free.slug,
          name: 'Tanah Lot',
          category: 'Temple',
          region: 'West',
          heroImageUrl: null,
          isHiddenGem: false,
          isVip: false,
          isFree: true,
          requiredEntitlement: 'map_access',
          distanceKm: null,
          lat: free.lat,
          lon: free.lon,
          canFavorite: true,
          canAddToTrip: true,
        },
      ],
      lockedCount: 7,
      lockedRequires: 'map_access',
      usedLocation: false,
      nearMe: false,
      region: null,
    }
    const held = emptyEntitlements()
    const d = deps({
      searchPlaces: async (_input, viewerHeld) => {
        received.push(viewerHeld)
        return result
      },
    })
    const out = await call(
      'search_places',
      { query: 'beach', held: ['vip'] },
      ctx({ held, deps: d }),
    )
    expect(received).toHaveLength(1)
    expect(received[0]).toBe(held)
    expect(out.data).toMatchObject({
      lockedCount: 7,
      places: [{ name: 'Tanah Lot', slug: 'tanah-lot' }],
    })
  })

  it('placesForModel never lists anything but unlocked hits', () => {
    const out = placesForModel({
      hits: [],
      lockedCount: 3,
      lockedRequires: 'vip',
      usedLocation: false,
      nearMe: false,
      region: null,
    })
    expect(out.places).toEqual([])
    expect(out.lockedCount).toBe(3)
  })
})

describe('proposals never act on their own', () => {
  it('propose_add_to_trip only stores the proposal (no cart write) and returns a card', async () => {
    const stored: { kind: string; args: Record<string, unknown> }[] = []
    const d = deps({
      getActivity: async () =>
        ({
          id: '11111111-1111-4111-8111-111111111111',
          slug: 'ubud-swing',
          href: '/activities/ubud-swing',
          name: { en: 'Ubud swing', ar: 'أرجوحة أوبود', id: 'Ayunan Ubud' },
          tiers: [],
          addons: [],
        }) as never,
      quote: async () => ({
        ok: true,
        totalMinor: 9000,
        currency: 'USD',
        issues: [],
        lines: [{ kind: 'package', refId: null, totalMinor: 9000, currency: 'USD', quantity: 2 }],
      }),
      createAction: async (input) => {
        stored.push({ kind: input.kind, args: input.args })
        return '22222222-2222-4222-8222-222222222222'
      },
    })
    const result = await call(
      'propose_add_to_trip',
      { activitySlug: 'ubud-swing', date: '2026-12-01', people: 2 },
      ctx({ deps: d }),
    )
    expect(stored).toHaveLength(1)
    expect(stored[0]?.kind).toBe('add_to_trip')
    expect(result.action?.id).toBe('22222222-2222-4222-8222-222222222222')
    expect(result.action?.summary).toMatchObject({
      activity: 'Ubud swing',
      people: 2,
      total: '$90.00',
    })
    expect(d.calls).not.toContain('myTrip')
  })

  it('a booking the server cannot price is not proposed', async () => {
    const d = deps({
      getActivity: async () =>
        ({
          id: 'a',
          slug: 'x',
          href: '/activities/x',
          name: { en: 'X', ar: 'X', id: 'X' },
          tiers: [],
          addons: [],
        }) as never,
      quote: async () => ({
        ok: false,
        totalMinor: 0,
        currency: 'USD',
        issues: [{ code: 'date_in_past' }],
        lines: [],
      }),
    })
    const result = await call(
      'propose_add_to_trip',
      { activitySlug: 'x', date: '2020-01-01', people: 2 },
      ctx({ deps: d }),
    )
    expect(result.action).toBeUndefined()
    expect(result.data).toMatchObject({ priced: false, problems: ['date_in_past'] })
  })

  it('refuses malformed arguments before reaching any data', async () => {
    const d = deps()
    const result = await call(
      'propose_add_to_trip',
      { activitySlug: 'x', date: 'tomorrow', people: 0 },
      ctx({ deps: d }),
    )
    expect(result.data).toMatchObject({ error: 'invalid_arguments' })
    expect(d.calls).toEqual([])
  })
})
