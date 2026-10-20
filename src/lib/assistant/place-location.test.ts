import { describe, expect, it } from 'vitest'

import type { ExpandResult } from './maps-link'
import {
  checkSpot,
  photonHits,
  photonSearch,
  resolveLocation,
  type LocationDeps,
  type SearchHit,
} from './place-location'

const TIRTA: SearchHit = { name: 'Tirta Empul', detail: 'Tampaksiring', lat: -8.415, lon: 115.315 }

function deps(
  over: { expand?: ExpandResult; hits?: SearchHit[] | null } = {},
): LocationDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    expand: async (url) => {
      calls.push(`expand ${url}`)
      return over.expand ?? { ok: false, reason: 'network' }
    },
    search: async (query) => {
      calls.push(`search ${query}`)
      return over.hits === undefined ? [TIRTA] : over.hits
    },
  }
}

describe('resolveLocation', () => {
  it('reads typed coordinates without any network', async () => {
    const d = deps()
    expect(await resolveLocation('-8.5069, 115.2625', d)).toMatchObject({
      kind: 'point',
      lat: -8.5069,
      lon: 115.2625,
      source: 'pair',
    })
    expect(await resolveLocation(`8°30'24.8"S 115°15'45.0"E`, d)).toMatchObject({
      kind: 'point',
      lat: -8.506889,
    })
    expect(await resolveLocation('-٨٫٥٠٦٩، ١١٥٫٢٦٢٥', d)).toMatchObject({ lat: -8.5069 })
    expect(d.calls).toEqual([])
  })

  it('reads the "my current location" message in either language', async () => {
    const d = deps()
    expect(
      await resolveLocation(
        'Add a map place at my current location: -8.506900, 115.262500 (accurate to about 12 m)',
        d,
      ),
    ).toMatchObject({ kind: 'point', lat: -8.5069, lon: 115.2625 })
    expect(
      await resolveLocation(
        'أضف مكاناً على الخريطة في موقعي الحالي: -8.506900, 115.262500 (بدقة 12 م تقريباً)',
        d,
      ),
    ).toMatchObject({ kind: 'point', lat: -8.5069 })
    expect(d.calls).toEqual([])
  })

  it('reads full Google Maps links: pin, centre, query', async () => {
    const d = deps()
    expect(
      await resolveLocation(
        'https://www.google.com/maps/place/X/@-8.43,115.27,17z/data=!3d-8.4312!4d115.2793',
        d,
      ),
    ).toMatchObject({ lat: -8.4312, lon: 115.2793, source: 'pin' })
    expect(
      await resolveLocation('https://www.google.com/maps/@-8.6478,115.1385,15z', d),
    ).toMatchObject({ source: 'centre' })
    expect(
      await resolveLocation('https://maps.google.com/?q=-8.8291,115.0849 please', d),
    ).toMatchObject({ source: 'query', lat: -8.8291 })
    expect(d.calls).toEqual([])
  })

  it('follows a short link on the server', async () => {
    const d = deps({
      expand: {
        ok: true,
        url: 'https://www.google.com/maps/@-8.5,115.2,15z',
        coords: { lat: -8.5, lon: 115.2, source: 'centre' },
      },
    })
    expect(await resolveLocation('here: https://maps.app.goo.gl/AbC123', d)).toMatchObject({
      kind: 'point',
      lat: -8.5,
    })
    expect(d.calls).toEqual(['expand https://maps.app.goo.gl/AbC123'])
  })

  it('a short link that cannot be opened asks for the full link (no guessing)', async () => {
    const d = deps({ expand: { ok: false, reason: 'timeout' } })
    expect(await resolveLocation('https://maps.app.goo.gl/AbC123', d)).toEqual({
      kind: 'none',
      reason: 'short_link_failed',
    })
    expect(d.calls).toHaveLength(1)
  })

  it('a link naming a place without a position searches that name in Bali', async () => {
    const d = deps({
      expand: { ok: true, url: 'https://www.google.com/maps/place/Tirta+Empul/', coords: null },
    })
    expect(await resolveLocation('https://maps.app.goo.gl/name', d)).toMatchObject({
      kind: 'point',
      source: 'search',
      label: 'Tirta Empul, Tampaksiring',
    })
    expect(d.calls[1]).toBe('search Tirta Empul')
  })

  it("reads Google's consent page's continue address", async () => {
    const inner = 'https://www.google.com/maps/place/Tirta+Empul/'
    const d = deps({
      expand: {
        ok: true,
        url: `https://consent.google.com/m?continue=${encodeURIComponent(inner)}`,
        coords: null,
      },
    })
    expect(await resolveLocation('https://maps.app.goo.gl/c', d)).toMatchObject({
      source: 'search',
    })
  })

  it('refuses links that are not Google Maps', async () => {
    const d = deps()
    expect(await resolveLocation('https://example.com/place?q=-8.5,115.2', d)).toEqual({
      kind: 'none',
      reason: 'not_a_maps_link',
    })
    expect(d.calls).toEqual([])
  })

  it('searches a name: one hit is the spot, several are choices, none is not found', async () => {
    expect(await resolveLocation('Tirta Empul', deps())).toMatchObject({
      kind: 'point',
      source: 'search',
    })
    const many = Array.from({ length: 8 }, (_, i) => ({ ...TIRTA, name: `Place ${i}` }))
    const choices = await resolveLocation('Warung', deps({ hits: many }))
    expect(choices.kind).toBe('choices')
    expect(choices.kind === 'choices' && choices.choices.length).toBe(5)
    expect(await resolveLocation('Nowhere', deps({ hits: [] }))).toEqual({
      kind: 'none',
      reason: 'not_found',
    })
    expect(await resolveLocation('Somewhere', deps({ hits: null }))).toEqual({
      kind: 'none',
      reason: 'search_failed',
    })
    expect(await resolveLocation('  ', deps())).toEqual({ kind: 'none', reason: 'empty' })
  })
})

describe('checkSpot — the place editor’s checks', () => {
  const ubud = { lat: -8.5069, lon: 115.2625 }

  it('a clean spot on land in Bali has no warnings', () => {
    expect(checkSpot(ubud, { inWater: false, existing: [] })).toEqual({
      warnings: [],
      nearby: [],
    })
  })

  it('outside Bali, in water, and could-not-check are warnings', () => {
    expect(checkSpot({ lat: -8.58, lon: 116.1 }, { inWater: true, existing: [] }).warnings).toEqual(
      ['outside_bali', 'in_water'],
    )
    expect(checkSpot(ubud, { inWater: null, existing: [] }).warnings).toEqual(['water_unchecked'])
  })

  it('another place within 50 m is a possible duplicate; 80 m away is not', () => {
    const near = { id: 'a', name: 'Near', lat: ubud.lat + 0.0003, lon: ubud.lon } // ~33 m
    const far = { id: 'b', name: 'Far', lat: ubud.lat + 0.00072, lon: ubud.lon } // ~80 m
    const result = checkSpot(ubud, { inWater: false, existing: [far, near] })
    expect(result.warnings).toEqual(['near_existing'])
    expect(result.nearby.map((p) => p.name)).toEqual(['Near'])
    expect(result.nearby[0]?.meters).toBeGreaterThan(25)
    expect(result.nearby[0]?.meters).toBeLessThan(50)
  })
})

describe('Photon search (server side)', () => {
  it('turns features into hits and drops duplicates and broken ones', () => {
    const hits = photonHits({
      features: [
        {
          geometry: { coordinates: [115.315, -8.415] },
          properties: { name: 'Tirta Empul', city: 'Tampaksiring', county: 'Gianyar' },
        },
        {
          geometry: { coordinates: [115.315, -8.415] },
          properties: { name: 'Tirta Empul', city: 'Tampaksiring' },
        },
        { geometry: {}, properties: { name: 'Broken' } },
      ],
    })
    expect(hits).toEqual([
      { name: 'Tirta Empul', detail: 'Tampaksiring, Gianyar', lat: -8.415, lon: 115.315 },
    ])
    expect(photonHits(null)).toEqual([])
  })

  it('asks Photon for Bali only, and returns null on failure', async () => {
    const urls: string[] = []
    const ok = (async (url: string) => {
      urls.push(url)
      return Response.json({ features: [] })
    }) as unknown as typeof fetch
    expect(await photonSearch('Ubud', { fetchImpl: ok })).toEqual([])
    expect(urls[0]).toContain('bbox=114.40,-8.95,115.75,-8.00')
    const bad = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
    expect(await photonSearch('Ubud', { fetchImpl: bad })).toBeNull()
  })
})
