import { describe, expect, it } from 'vitest'

import type { Role } from '@/lib/auth/roles'

import { runTool } from './engine'
import {
  ACTION_CAPABILITY,
  STAFF_TOOLS,
  maskEmail,
  maskPhone,
  placeSlug,
  toolsFor,
  type StaffCtx,
  type StaffDeps,
} from './staff-tools'

/** A dependency object that records calls and fails loudly on anything unexpected. */
function deps(over: Partial<StaffDeps> = {}): StaffDeps & { calls: string[] } {
  const calls: string[] = []
  return new Proxy(over, {
    get(target, prop) {
      if (prop === 'calls') return calls
      if (typeof prop !== 'string' || prop === 'then') return undefined
      const value = target[prop as keyof StaffDeps]
      return (...args: unknown[]) => {
        calls.push(prop)
        if (value === undefined) throw new Error(`unexpected dependency call: ${prop}`)
        return (value as (...a: unknown[]) => unknown)(...args)
      }
    },
  }) as StaffDeps & { calls: string[] }
}

function ctx(role: Role, d: StaffDeps): StaffCtx {
  return {
    role,
    userId: 'staff-1',
    locale: 'en',
    conversationId: 'c-1',
    href: (p) => `/studio-x${p}`,
    deps: d,
  }
}

const run = (name: string, args: unknown, context: StaffCtx) =>
  runTool([...STAFF_TOOLS], { name, arguments: JSON.stringify(args) }, context)

const ORDER_ID = '33333333-3333-4333-8333-333333333333'
const ITEM_ID = '44444444-4444-4444-8444-444444444444'

describe('Studio tools enforce capabilities themselves', () => {
  it('a customer session gets "forbidden" from every tool, and no data is read', async () => {
    const d = deps()
    for (const tool of STAFF_TOOLS) {
      const result = await run(tool.name, {}, ctx('customer', d))
      // Either the capability gate or argument validation stops it; neither reads data.
      expect(JSON.stringify(result.data)).toMatch(/forbidden|invalid_arguments/)
    }
    expect(d.calls).toEqual([])
  })

  it('staff (no config.write) cannot read settings', async () => {
    const d = deps({ settings: async () => ({ secret: 'nope' }) })
    const result = await run('get_settings', {}, ctx('staff', d))
    expect(result.data).toEqual({ error: 'forbidden', needs: 'config.write' })
    expect(d.calls).toEqual([])
  })

  it('an admin can read settings', async () => {
    const d = deps({ settings: async () => ({ fees: {} }) })
    const result = await run('get_settings', {}, ctx('admin', d))
    expect(result.data).toMatchObject({ fees: {}, studio: '/studio-x/config' })
  })

  it('staff can read orders, but payment details only with payments.read', async () => {
    const d = deps({
      getOrder: async () => ({
        id: ORDER_ID,
        orderNumber: 'BT-1001',
        status: 'paid',
        totalMinor: 5000,
        currency: 'USD',
        customerName: 'Sara',
        customerEmail: 'sara@example.com',
        placedAt: '2026-10-15T01:00:00.000Z',
        items: [],
      }),
      orderPayments: async () => [],
    })
    const result = await run('get_order', { orderNumber: 'BT-1001' }, ctx('staff', d))
    expect(result.data).toMatchObject({
      found: true,
      orderNumber: 'BT-1001',
      email: 's***@example.com',
    })
    // staff hold payments.read, so payments were fetched
    expect(d.calls).toContain('orderPayments')
    expect(JSON.stringify(result.data)).not.toContain('sara@example.com')
  })

  it('only offers the model the tools this role may use', () => {
    const staff = toolsFor('staff').map((tool) => tool.name)
    expect(staff).toContain('list_orders')
    expect(staff).toContain('propose_booking_status')
    expect(staff).not.toContain('get_settings')
    expect(toolsFor('customer')).toEqual([])
    expect(toolsFor('admin').length).toBe(STAFF_TOOLS.length)
  })

  it('every write kind declares the capability it is re-checked against on Confirm', () => {
    for (const kind of [
      'booking_status',
      'content_status',
      'place_draft',
      'lead_status',
      'lead_note',
      'contact_status',
    ]) {
      expect(ACTION_CAPABILITY[kind]).toBeDefined()
    }
  })
})

describe('Studio write tools only propose', () => {
  it('propose_booking_status stores a proposal with the before → after change, and changes nothing', async () => {
    const stored: unknown[] = []
    const d = deps({
      orderItemState: async () => ({
        orderId: ORDER_ID,
        name: 'Ubud swing',
        bookingStatus: 'created',
        orderStatus: 'paid',
      }),
      createAction: async (input) => {
        stored.push(input)
        return '55555555-5555-4555-8555-555555555555'
      },
    })
    const result = await run(
      'propose_booking_status',
      { orderNumber: 'BT-1001', orderItemId: ITEM_ID, status: 'confirmed' },
      ctx('staff', d),
    )
    expect(result.action).toMatchObject({
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'booking_status',
      summary: { order: 'BT-1001', item: 'Ubud swing', change: 'created → confirmed' },
    })
    expect(stored).toHaveLength(1)
    expect(d.calls).toEqual(['orderItemState', 'createAction'])
  })

  it('refuses an unknown status before reading anything', async () => {
    const d = deps()
    const result = await run(
      'propose_booking_status',
      { orderNumber: 'BT-1001', orderItemId: ITEM_ID, status: 'teleported' },
      ctx('admin', d),
    )
    expect(result.data).toMatchObject({ error: 'invalid_arguments' })
    expect(d.calls).toEqual([])
  })

  it('a place draft must be on Bali', async () => {
    const d = deps()
    const result = await run(
      'propose_place_draft',
      { slug: 'eiffel-tower', nameEn: 'Eiffel Tower', lat: 48.85, lon: 2.29 },
      ctx('admin', d),
    )
    expect(result.data).toMatchObject({ error: 'invalid_arguments' })
  })
})

describe('Adding a map place from a location', () => {
  const TAXONOMY = {
    regions: [
      {
        key: 'central',
        label: { en: 'Central Bali', ar: 'وسط بالي' },
        parentKey: null,
        centerLat: -8.45,
        centerLon: 115.24,
        radiusKm: 20,
      },
      {
        key: 'ubud',
        label: { en: 'Ubud', ar: 'أوبود' },
        parentKey: 'central',
        centerLat: -8.5069,
        centerLon: 115.2625,
        radiusKm: 4,
      },
    ],
    categories: [
      { key: 'cafes', label: { en: 'Cafés', ar: 'مقاهٍ' } },
      { key: 'temples', label: { en: 'Temples', ar: 'معابد' } },
    ],
  }
  const REGION_ID = '66666666-6666-4666-8666-666666666666'
  const CATEGORY_ID = '77777777-7777-4777-8777-777777777777'

  function placeDeps(over: Partial<StaffDeps> = {}, stored: unknown[] = []) {
    return deps({
      locate: async () => ({
        kind: 'point',
        lat: -8.5069,
        lon: 115.2625,
        source: 'pin',
        label: null,
      }),
      inWater: async () => false,
      placesNear: async () => [],
      placeTaxonomy: async () => TAXONOMY,
      slugTaken: async () => false,
      regionId: async (key) => (key === 'ubud' ? REGION_ID : null),
      categoryId: async (key) => (key === 'cafes' ? CATEGORY_ID : null),
      createAction: async (input) => {
        stored.push(input)
        return '88888888-8888-4888-8888-888888888888'
      },
      ...over,
    })
  }

  it('find_location gives the spot, the area, no warnings and the categories', async () => {
    const d = placeDeps()
    const result = await run(
      'find_location',
      { text: 'https://maps.app.goo.gl/AbC123' },
      ctx('staff', d),
    )
    expect(result.data).toMatchObject({
      found: true,
      lat: -8.5069,
      lon: 115.2625,
      area: 'Ubud',
      regionKey: 'ubud',
      freeCategories: ['activities', 'sights', 'malls', 'hospital'],
      warnings: [],
      categories: [{ key: 'cafes' }, { key: 'temples' }],
    })
    expect(result.action).toBeUndefined()
    expect(d.calls).not.toContain('createAction')
  })

  it('find_location reports the editor’s warnings: water, a place within 50 m', async () => {
    const d = placeDeps({
      inWater: async () => true,
      placesNear: async () => [{ id: REGION_ID, name: 'Old café', lat: -8.5071, lon: 115.2625 }],
    })
    const result = await run('find_location', { text: '-8.5069, 115.2625' }, ctx('staff', d))
    expect(result.data).toMatchObject({
      found: true,
      warnings: ['in_water', 'near_existing'],
      nearbyPlaces: [{ name: 'Old café', studio: `/studio-x/places/${REGION_ID}` }],
    })
  })

  it('find_location asks politely for the full link when a short link cannot be opened', async () => {
    const d = placeDeps({ locate: async () => ({ kind: 'none', reason: 'short_link_failed' }) })
    const result = await run(
      'find_location',
      { text: 'https://maps.app.goo.gl/AbC123' },
      ctx('staff', d),
    )
    expect(result.data).toMatchObject({ found: false, reason: 'short_link_failed' })
    expect(JSON.stringify(result.data)).toMatch(/full link|coordinates/)
    expect(d.calls).toEqual(['locate'])
  })

  it('find_location offers choices when a name matches several places', async () => {
    const d = placeDeps({
      locate: async () => ({
        kind: 'choices',
        choices: [
          { name: 'Warung A', detail: 'Ubud', lat: -8.5, lon: 115.26 },
          { name: 'Warung B', detail: 'Canggu', lat: -8.65, lon: 115.13 },
        ],
      }),
    })
    const result = await run('find_location', { text: 'Warung' }, ctx('staff', d))
    expect(result.data).toMatchObject({ found: false, choices: [{ name: 'Warung A' }, {}] })
  })

  it('propose_place_draft only proposes: a draft with name, category, area and description', async () => {
    const stored: { kind: string; args: Record<string, unknown> }[] = []
    const d = placeDeps({}, stored)
    const result = await run(
      'propose_place_draft',
      {
        nameEn: 'Café Moka',
        nameAr: 'مقهى موكا',
        lat: -8.5069,
        lon: 115.2625,
        categoryKey: 'cafes',
        descriptionEn: 'A small coffee shop.',
        descriptionAr: 'مقهى صغير.',
      },
      ctx('staff', d),
    )
    expect(result.action).toMatchObject({
      kind: 'place_draft',
      summary: {
        place: 'Café Moka',
        placeAr: 'مقهى موكا',
        category: 'Cafés',
        region: 'Ubud',
        description: 'A small coffee shop.',
        slug: 'cafe-moka',
        status: 'draft',
        warnings: null,
      },
    })
    expect(stored[0]?.args).toMatchObject({
      slug: 'cafe-moka',
      regionId: REGION_ID,
      categoryId: CATEGORY_ID,
      categoryLabel: { en: 'Cafés', ar: 'مقاهٍ' },
      isFree: true,
    })
    // Nothing is written: the only "write" is the stored proposal.
    expect(d.calls.filter((c) => c === 'createAction')).toHaveLength(1)
  })

  it('propose_place_draft shows the checks as warnings on the card, in the staff member’s language', async () => {
    const d = placeDeps({
      inWater: async () => null,
      placesNear: async () => [{ id: 'x', name: 'مقهى قديم', lat: -8.5069, lon: 115.2627 }],
    })
    const arCtx = { ...ctx('staff', d), locale: 'ar' as const }
    const result = await run(
      'propose_place_draft',
      { nameEn: 'Cafe', lat: -8.5069, lon: 115.2625, categoryKey: 'cafes' },
      arCtx,
    )
    expect(result.action?.summary).toMatchObject({
      category: 'مقاهٍ',
      region: 'أوبود',
      warnings: ['water_unchecked', 'near_existing'],
    })
    expect(String(result.action?.summary.nearbyPlaces)).toMatch(/مقهى قديم \(\d+ m\)/)
  })

  it('a spot just outside Bali (e.g. Lombok) is a warning, far away is refused', async () => {
    const d = placeDeps({ regionId: async () => null })
    const lombok = await run(
      'propose_place_draft',
      { nameEn: 'Senggigi Beach', lat: -8.49, lon: 116.04 },
      ctx('admin', d),
    )
    expect(lombok.action?.summary).toMatchObject({ warnings: ['outside_bali'] })
    const paris = await run(
      'propose_place_draft',
      { nameEn: 'Eiffel Tower', lat: 48.85, lon: 2.29 },
      ctx('admin', d),
    )
    expect(paris.data).toMatchObject({ error: 'invalid_arguments' })
  })

  it('a taken slug gets a number; an unknown category is refused', async () => {
    const taken = new Set(['cafe-moka', 'cafe-moka-2'])
    const d = placeDeps({ slugTaken: async (slug) => taken.has(slug) })
    const result = await run(
      'propose_place_draft',
      { nameEn: 'Cafe Moka', lat: -8.5069, lon: 115.2625 },
      ctx('staff', d),
    )
    expect(result.action?.summary).toMatchObject({ slug: 'cafe-moka-3' })
    const bad = await run(
      'propose_place_draft',
      { nameEn: 'Cafe Moka', lat: -8.5069, lon: 115.2625, categoryKey: 'spaceports' },
      ctx('staff', d),
    )
    expect(bad.data).toMatchObject({ error: 'unknown_category' })
    expect(bad.action).toBeUndefined()
  })

  it('needs content.write: a customer gets forbidden and nothing is looked up', async () => {
    const d = placeDeps()
    const result = await run('find_location', { text: '-8.5, 115.2' }, ctx('customer', d))
    expect(result.data).toEqual({ error: 'forbidden', needs: 'content.write' })
    expect(d.calls).toEqual([])
  })

  it('makes slugs from names', () => {
    expect(placeSlug('Café Moka, Ubud!')).toBe('cafe-moka-ubud')
    expect(placeSlug('مقهى')).toBe('')
  })
})

describe('PII masking', () => {
  it('masks emails and phones', () => {
    expect(maskEmail('sara.k@example.com')).toBe('s***@example.com')
    expect(maskEmail(null)).toBeNull()
    expect(maskPhone('+62 812-3456-7890')).toBe('•••• 7890')
    expect(maskPhone('12')).toBe('••••')
  })
})
