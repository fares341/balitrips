import { describe, expect, it } from 'vitest'

import { deviceIdentity, parseUserAgent } from './fingerprint'

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
const CHROME_MAC_NEXT = CHROME_MAC.replace('129.0.0.0', '130.0.0.0')
const EDGE_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0'
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const FP = 'a'.repeat(64)

describe('parseUserAgent', () => {
  it('detects browser and OS, Edge before Chrome', () => {
    expect(parseUserAgent(CHROME_MAC)).toEqual({ browser: 'Chrome', os: 'macOS' })
    expect(parseUserAgent(EDGE_WIN)).toEqual({ browser: 'Edge', os: 'Windows' })
    expect(parseUserAgent(SAFARI_IPHONE)).toEqual({ browser: 'Safari', os: 'iOS' })
    expect(parseUserAgent(null)).toEqual({ browser: 'Unknown', os: 'Unknown' })
  })
})

describe('deviceIdentity', () => {
  it('is stable across a browser version update', () => {
    expect(deviceIdentity(FP, CHROME_MAC).fingerprintHash).toBe(
      deviceIdentity(FP, CHROME_MAC_NEXT).fingerprintHash,
    )
  })
  it('changes when the same client fingerprint is replayed from a different browser/OS', () => {
    expect(deviceIdentity(FP, CHROME_MAC).fingerprintHash).not.toBe(
      deviceIdentity(FP, EDGE_WIN).fingerprintHash,
    )
  })
  it('falls back to a weak, UA-based identity when the client value is missing or malformed', () => {
    const missing = deviceIdentity(null, CHROME_MAC)
    expect(missing.weak).toBe(true)
    expect(deviceIdentity('not-hex', CHROME_MAC).fingerprintHash).toBe(missing.fingerprintHash)
    expect(deviceIdentity(FP, CHROME_MAC).weak).toBe(false)
  })
  it('emits a 64-char hex hash', () => {
    expect(deviceIdentity(FP, CHROME_MAC).fingerprintHash).toMatch(/^[a-f0-9]{64}$/)
  })
})
