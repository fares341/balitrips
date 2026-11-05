import { describe, expect, it } from 'vitest'

import { canAutoApply, cleanTitle, scoreCandidate } from './score'

const place = { names: ['Pura Tanah Lot', 'معبد تانا لوت'], lat: -8.6212, lon: 115.0868 }

describe('scoreCandidate', () => {
  it('a geotagged, well-named photo nearby is high', () => {
    const s = scoreCandidate(place, {
      title: 'File:Pura Tanah Lot at sunset.jpg',
      lat: -8.6215,
      lon: 115.087,
      width: 3000,
      height: 2000,
      via: 'geo',
    })
    expect(s.tier).toBe('high')
    expect(s.distanceM).toBeLessThan(150)
    expect(s.score).toBeGreaterThan(0.8)
  })

  it('nearby but unrelated name is not high', () => {
    const s = scoreCandidate(place, {
      title: 'File:IMG 2034.jpg',
      lat: -8.6213,
      lon: 115.0869,
      width: 2000,
      height: 1500,
      via: 'geo',
    })
    expect(s.tier).toBe('fair')
  })

  it('a good name 400 m away is good, not high', () => {
    const s = scoreCandidate(place, {
      title: 'File:Tanah Lot temple.jpg',
      lat: -8.6248,
      lon: 115.0868,
      width: 1600,
      height: 1200,
      via: 'geo',
    })
    expect(s.tier).toBe('good')
  })

  it('rejects narrow images, maps and logos', () => {
    const base = { lat: -8.6213, lon: 115.0869, via: 'geo' as const, height: 600 }
    expect(
      scoreCandidate(place, { ...base, title: 'File:Pura Tanah Lot.jpg', width: 799 }).tier,
    ).toBe('reject')
    expect(
      scoreCandidate(place, { ...base, title: 'File:Tanah Lot location map.png', width: 1200 })
        .tier,
    ).toBe('reject')
    expect(
      scoreCandidate(place, { ...base, title: 'File:Pura Tanah Lot logo.png', width: 1200 }).tier,
    ).toBe('reject')
  })

  it('search hits without geotag need a strong name to be good, and are never high', () => {
    const s = scoreCandidate(place, {
      title: 'Pura Tanah Lot',
      width: 2000,
      height: 1300,
      via: 'openverse',
    })
    expect(s.distanceM).toBeNull()
    expect(s.tier).toBe('good')
    const weak = scoreCandidate(place, {
      title: 'Bali temple',
      width: 2000,
      height: 1300,
      via: 'openverse',
    })
    expect(weak.tier === 'fair' || weak.tier === 'reject').toBe(true)
  })

  it('a street view next to the place is never auto-applied', () => {
    const s = scoreCandidate(
      { names: ['Pantai Nunggalan'], lat: -8.83, lon: 115.1 },
      {
        title: 'File:Jl. Batu Nunggalan, Pecatu - panoramio.jpg',
        lat: -8.83,
        lon: 115.1,
        width: 2592,
        height: 1944,
        via: 'geo',
      },
    )
    expect(s.tier).toBe('good')
  })

  it('cleanTitle strips namespace, extension and camera numbers', () => {
    expect(cleanTitle('File:Pura_Ulun_Danu_DSC_0042.JPG')).toBe('Pura Ulun Danu')
  })
})

describe('canAutoApply', () => {
  it('only high tier and only without a unique own photo', () => {
    expect(canAutoApply({ tier: 'high', hasUniqueOwnPhoto: false })).toBe(true)
    expect(canAutoApply({ tier: 'high', hasUniqueOwnPhoto: true })).toBe(false)
    expect(canAutoApply({ tier: 'good', hasUniqueOwnPhoto: false })).toBe(false)
  })
})
