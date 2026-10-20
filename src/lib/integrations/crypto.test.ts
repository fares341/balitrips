import { inspect } from 'node:util'

import { describe, expect, it } from 'vitest'

import {
  integrationsKeyStatus,
  lastFour,
  openJson,
  openString,
  sealJson,
  sealString,
  SecretBag,
} from './crypto'

const KEY_HEX = 'a'.repeat(64)
const ENV = { INTEGRATIONS_KEY: KEY_HEX }
const OTHER = { INTEGRATIONS_KEY: 'b'.repeat(64) }

describe('INTEGRATIONS_KEY', () => {
  it('accepts 64 hex characters or base64 of 32 bytes, and nothing else', () => {
    expect(integrationsKeyStatus(ENV)).toBe('ok')
    expect(
      integrationsKeyStatus({ INTEGRATIONS_KEY: Buffer.alloc(32, 7).toString('base64') }),
    ).toBe('ok')
    expect(integrationsKeyStatus({})).toBe('missing')
    expect(integrationsKeyStatus({ INTEGRATIONS_KEY: '  ' })).toBe('missing')
    expect(integrationsKeyStatus({ INTEGRATIONS_KEY: 'short' })).toBe('invalid')
    expect(integrationsKeyStatus({ INTEGRATIONS_KEY: 'a'.repeat(63) })).toBe('invalid')
  })

  it('refuses to seal anything without a key', () => {
    expect(() => sealJson({ api_key: 'x' }, {})).toThrow(/INTEGRATIONS_KEY/)
  })
})

describe('credential encryption', () => {
  it('round-trips an object of keys', () => {
    const sealed = sealJson({ api_key: 'sk_live_1234567890', account: 'ACME' }, ENV)
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(sealed).not.toContain('sk_live')
    expect(openJson(sealed, ENV)).toEqual({ api_key: 'sk_live_1234567890', account: 'ACME' })
    expect(openString(sealString('whsec_abc', ENV), ENV)).toBe('whsec_abc')
  })

  it('uses a fresh IV every time', () => {
    expect(sealJson({ a: 'b' }, ENV)).not.toBe(sealJson({ a: 'b' }, ENV))
  })

  it('cannot be opened with another key, or after tampering', () => {
    const sealed = sealJson({ api_key: 'secret-value' }, ENV)
    expect(() => openJson(sealed, OTHER)).toThrow()
    const parts = sealed.split('.')
    const data = Buffer.from(parts[3] ?? '', 'base64url')
    data[0] = (data[0] ?? 0) ^ 1
    const tampered = [parts[0], parts[1], parts[2], data.toString('base64url')].join('.')
    expect(() => openJson(tampered, ENV)).toThrow()
    expect(() => openJson('v0.x.y.z', ENV)).toThrow()
  })

  it('keeps only the last four characters readable', () => {
    expect(lastFour('sk_live_ABCD1234')).toBe('1234')
    expect(lastFour('abc')).toBe('••••')
  })
})

describe('SecretBag never serialises its values', () => {
  const bag = new SecretBag({ api_key: 'sk_live_TOPSECRET', password: 'hunter2' })

  it('reads values only through get()', () => {
    expect(bag.get('api_key')).toBe('sk_live_TOPSECRET')
    expect(bag.get('missing')).toBeNull()
    expect(bag.names()).toEqual(['api_key', 'password'])
  })

  it('shows [redacted] to JSON, strings, template literals and console inspection', () => {
    const outputs = [
      JSON.stringify(bag),
      JSON.stringify({ nested: { bag } }),
      String(bag),
      `${bag}`,
      inspect(bag),
      inspect({ bag }, { depth: 5 }),
    ]
    for (const output of outputs) {
      expect(output).not.toContain('TOPSECRET')
      expect(output).not.toContain('hunter2')
    }
    expect(JSON.stringify(bag)).toBe('"[redacted]"')
    expect(Object.keys(bag)).toEqual([])
  })
})
