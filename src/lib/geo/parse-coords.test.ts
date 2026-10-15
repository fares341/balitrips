import { describe, expect, it } from 'vitest'

import { parseCoordinateText } from './parse-coords'

describe('parseCoordinateText', () => {
  it('reads a plain decimal pair in the usual spellings', () => {
    expect(parseCoordinateText('-8.5069, 115.2625')).toEqual({
      lat: -8.5069,
      lon: 115.2625,
      source: 'pair',
    })
    expect(parseCoordinateText('-8.5069 115.2625')?.lon).toBe(115.2625)
    expect(parseCoordinateText('(-8.5069,115.2625)')?.lat).toBe(-8.5069)
  })

  it('prefers the dropped pin (!3d!4d) over the map centre (@)', () => {
    const url =
      'https://www.google.com/maps/place/Tegallalang/@-8.4300,115.2700,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-8.4312!4d115.2793!16s'
    expect(parseCoordinateText(url)).toEqual({ lat: -8.4312, lon: 115.2793, source: 'pin' })
  })

  it('reads the map centre from an @ link', () => {
    expect(
      parseCoordinateText('https://www.google.com/maps/@-8.6478,115.1385,15z?entry=ttu'),
    ).toEqual({ lat: -8.6478, lon: 115.1385, source: 'centre' })
  })

  it('reads ?q= / query= / destination= links, encoded or not', () => {
    expect(parseCoordinateText('https://maps.google.com/?q=-8.8291,115.0849')?.source).toBe('query')
    expect(
      parseCoordinateText('https://www.google.com/maps/search/?api=1&query=-8.8291%2C115.0849')
        ?.lat,
    ).toBe(-8.8291)
    expect(
      parseCoordinateText('https://www.google.com/maps/dir/?api=1&destination=-8.5,115.26')?.lon,
    ).toBe(115.26)
  })

  it('refuses what has no coordinates or impossible ones', () => {
    expect(parseCoordinateText('https://maps.app.goo.gl/AbCdEf123')).toBeNull()
    expect(parseCoordinateText('Ubud, Bali')).toBeNull()
    expect(parseCoordinateText('95, 200')).toBeNull()
    expect(parseCoordinateText('0, 0')).toBeNull()
    expect(parseCoordinateText('')).toBeNull()
  })
})
