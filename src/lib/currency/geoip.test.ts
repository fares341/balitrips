import { describe, expect, it } from 'vitest'

import { countryForIp } from './geoip'
import { currencyForCountry } from './shared'

describe('countryForIp (offline NRO data)', () => {
  it.each([
    ['156.160.0.1', 'EG'], // TE Data, Egypt
    ['212.26.18.1', 'SA'], // Saudi Arabia
    ['36.66.0.1', 'ID'], // Telkom Indonesia
    ['8.8.8.8', 'US'],
    ['2001:4860:4860::8888', 'US'],
  ])('%s → %s', (ip, cc) => {
    expect(countryForIp(ip)).toBe(cc)
  })

  it.each([
    '10.0.0.1',
    '192.168.1.5',
    '127.0.0.1',
    '172.20.0.3',
    '100.64.1.1',
    '::1',
    'fd00::1',
    'nonsense',
    null,
  ])('private/invalid %s → null → SAR', (ip) => {
    expect(countryForIp(ip)).toBeNull()
    expect(currencyForCountry(countryForIp(ip))).toBe('SAR')
  })

  it('handles IPv4-mapped IPv6', () => {
    expect(countryForIp('::ffff:8.8.8.8')).toBe('US')
  })
})
