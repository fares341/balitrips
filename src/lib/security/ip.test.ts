import { afterEach, describe, expect, it, vi } from 'vitest'

import { clientIp, normalizeIp, requestCity, requestCountry } from './ip'

const bag = (values: Record<string, string>) => new Headers(values)

describe('normalizeIp', () => {
  it('accepts IPv4 and strips a port', () => {
    expect(normalizeIp('203.0.113.7')).toBe('203.0.113.7')
    expect(normalizeIp(' 203.0.113.7:4431 ')).toBe('203.0.113.7')
  })
  it('unwraps IPv4-mapped IPv6 and bracketed IPv6', () => {
    expect(normalizeIp('::ffff:198.51.100.2')).toBe('198.51.100.2')
    expect(normalizeIp('[2001:DB8::1]:443')).toBe('2001:db8::1')
  })
  it('rejects garbage and out-of-range octets', () => {
    expect(normalizeIp('not-an-ip')).toBeNull()
    expect(normalizeIp('300.1.1.1')).toBeNull()
    expect(normalizeIp('')).toBeNull()
    expect(normalizeIp(undefined)).toBeNull()
  })
})

describe('clientIp', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses the LAST x-forwarded-for hop (the one Caddy wrote), not the client-supplied first', () => {
    expect(clientIp(bag({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }))).toBe('203.0.113.7')
  })
  it('prefers TRUSTED_IP_HEADER when configured', () => {
    vi.stubEnv('TRUSTED_IP_HEADER', 'cf-connecting-ip')
    expect(
      clientIp(bag({ 'cf-connecting-ip': '198.51.100.9', 'x-forwarded-for': '172.70.0.1' })),
    ).toBe('198.51.100.9')
  })
  it('falls back to x-real-ip, then null', () => {
    expect(clientIp(bag({ 'x-real-ip': '198.51.100.3' }))).toBe('198.51.100.3')
    expect(clientIp(bag({}))).toBeNull()
  })
})

describe('requestCountry', () => {
  it('reads the CDN country header and ignores unknowns', () => {
    expect(requestCountry(new Headers({ 'cf-ipcountry': 'ae' }))).toBe('AE')
    expect(requestCountry(new Headers({ 'cf-ipcountry': 'XX' }))).toBeNull()
    expect(requestCountry(new Headers({ 'cf-ipcountry': 'not-a-country' }))).toBeNull()
    expect(requestCountry(new Headers())).toBeNull()
  })
})

describe('requestCity', () => {
  it('reads, decodes and sanitises the CDN city header', () => {
    expect(requestCity(new Headers({ 'cf-ipcity': 'Denpasar' }))).toBe('Denpasar')
    expect(requestCity(new Headers({ 'cf-ipcity': 'S%C3%A3o%20Paulo' }))).toBe('São Paulo')
    expect(requestCity(new Headers({ 'cf-ipcity': '<script>' }))).toBe('script')
    expect(requestCity(new Headers({ 'cf-ipcity': '%E0%A4%A' }))).toBeNull()
    expect(requestCity(new Headers())).toBeNull()
  })
})
