import { describe, expect, it } from 'vitest'

import { parseWeather, weatherKind } from './bali'

describe('Bali weather', () => {
  it('maps WMO codes to kinds', () => {
    expect(weatherKind(0)).toBe('clear')
    expect(weatherKind(2)).toBe('partly')
    expect(weatherKind(3)).toBe('cloudy')
    expect(weatherKind(45)).toBe('fog')
    expect(weatherKind(53)).toBe('drizzle')
    expect(weatherKind(63)).toBe('rain')
    expect(weatherKind(81)).toBe('rain')
    expect(weatherKind(95)).toBe('storm')
  })

  it('parses the current block and rounds the temperature', () => {
    expect(parseWeather({ current: { temperature_2m: 29.6, weather_code: 2 } })).toEqual({
      tempC: 30,
      kind: 'partly',
    })
  })

  it('returns null for anything unexpected', () => {
    expect(parseWeather(null)).toBeNull()
    expect(parseWeather({})).toBeNull()
    expect(parseWeather({ current: { temperature_2m: 'hot', weather_code: 1 } })).toBeNull()
    expect(parseWeather({ current: { temperature_2m: 28 } })).toBeNull()
  })
})
