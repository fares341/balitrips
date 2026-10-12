import { describe, expect, it } from 'vitest'

import { deviceIdentity, parseDeviceType, parseUserAgent, sameAgentFamily } from './fingerprint'

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

const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
const ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'

describe('parseDeviceType', () => {
  it('tells phones, tablets and desktops apart', () => {
    expect(parseDeviceType(SAFARI_IPHONE)).toBe('mobile')
    expect(parseDeviceType(ANDROID_PHONE)).toBe('mobile')
    expect(parseDeviceType(ANDROID_TABLET)).toBe('tablet')
    expect(parseDeviceType(CHROME_MAC)).toBe('desktop')
    expect(parseDeviceType(null)).toBe('desktop')
  })
})

describe('sameAgentFamily', () => {
  it('ignores version updates but not a different browser or OS', () => {
    expect(sameAgentFamily(CHROME_MAC, CHROME_MAC_NEXT)).toBe(true)
    expect(sameAgentFamily(CHROME_MAC, EDGE_WIN)).toBe(false)
    expect(sameAgentFamily(CHROME_MAC, SAFARI_IPHONE)).toBe(false)
  })
  it('treats "request desktop site" as the same device family', () => {
    const SAFARI_IPAD_DESKTOP =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
    const CHROME_ANDROID =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
    const CHROME_ANDROID_DESKTOP =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
    expect(sameAgentFamily(SAFARI_IPHONE, SAFARI_IPAD_DESKTOP)).toBe(true)
    expect(sameAgentFamily(CHROME_ANDROID, CHROME_ANDROID_DESKTOP)).toBe(true)
    expect(sameAgentFamily(CHROME_ANDROID, CHROME_MAC)).toBe(false)
  })
  it('does not judge what it cannot parse', () => {
    expect(sameAgentFamily(null, CHROME_MAC)).toBe(true)
    expect(sameAgentFamily(CHROME_MAC, 'curl/8.0')).toBe(true)
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
