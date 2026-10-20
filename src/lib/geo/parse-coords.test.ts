import { describe, expect, it } from 'vitest'

import { normalizeDigits, parseCoordinateText, parseDms } from './parse-coords'

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

  it('reads Arabic-Indic and Persian digits and the Arabic comma', () => {
    expect(normalizeDigits('-٨٫٥٠٦٩، ١١٥٫٢٦٢٥')).toBe('-8.5069, 115.2625')
    expect(parseCoordinateText('-٨٫٥٠٦٩، ١١٥٫٢٦٢٥')).toEqual({
      lat: -8.5069,
      lon: 115.2625,
      source: 'pair',
    })
    expect(parseCoordinateText('−۸.۵, ۱۱۵.۲')).toMatchObject({ lat: -8.5, lon: 115.2 })
  })
})

describe('degrees, minutes, seconds', () => {
  const ubud = { lat: -8.506889, lon: 115.2625, source: 'pair' }

  it('reads the form Google Maps shows for a dropped pin', () => {
    expect(parseCoordinateText(`8°30'24.8"S 115°15'45.0"E`)).toEqual(ubud)
  })

  it('accepts the usual spellings', () => {
    for (const text of [
      `8°30′24.8″S 115°15′45.0″E`,
      `8°30'24.8''S, 115°15'45''E`,
      `S 8° 30' 24.8" E 115° 15' 45"`,
      `115°15'45"E 8°30'24.8"S`,
      `-8° 30' 24.8", 115° 15' 45"`,
      `(8º30'24.8"S; 115º15'45"E)`,
    ]) {
      expect(parseCoordinateText(text)).toEqual(ubud)
    }
    expect(parseCoordinateText(`8°30.4133'S 115°15.75'E`)).toMatchObject({ lon: 115.2625 })
    expect(parseCoordinateText(`8.5069° S, 115.2625° E`)).toEqual({
      lat: -8.5069,
      lon: 115.2625,
      source: 'pair',
    })
  })

  it('refuses what is not two clean parts', () => {
    expect(parseDms(`8°30'24.8"N 8°30'24.8"S`)).toBeNull() // two latitudes
    expect(parseDms(`8°75'S 115°E`)).toBeNull() // 75 minutes
    expect(parseDms(`8°S`)).toBeNull()
    expect(parseDms(`near 8° 115°`)).toBeNull()
    expect(parseDms(`-8°30'S 115°E`)).toBeNull() // minus and S together
    expect(parseDms(`8°30'24"S 115°15'45"E 7°`)).toBeNull()
  })
})
