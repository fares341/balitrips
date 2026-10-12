import { beforeAll, describe, expect, it } from 'vitest'

import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  normaliseRecoveryCode,
  openSecret,
  otpauthUri,
  recoveryCodeMatches,
  sealSecret,
  stepFor,
  totpCode,
  verifyTotp,
} from './totp'

/**
 * The RFC 6238 appendix-B vectors, which are the only meaningful test of a
 * TOTP implementation: they pin the HMAC input, the dynamic truncation and
 * the time-step arithmetic against the standard rather than against itself.
 *
 * The published values are eight digits; this implementation emits six, which
 * is the same number modulo 10^6 — so the expectation is the last six digits
 * of each published code.
 */
const RFC_SECRET = base32Encode(Uint8Array.from(Buffer.from('12345678901234567890', 'ascii')))

const RFC_VECTORS: { seconds: number; eightDigits: string }[] = [
  { seconds: 59, eightDigits: '94287082' },
  { seconds: 1111111109, eightDigits: '07081804' },
  { seconds: 1111111111, eightDigits: '14050471' },
  { seconds: 1234567890, eightDigits: '89005924' },
  { seconds: 2000000000, eightDigits: '69279037' },
]

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-for-sealing-only'
})

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    for (const length of [1, 2, 5, 10, 20, 32]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 31 + 7) % 256)
      expect(Array.from(base32Decode(base32Encode(bytes)))).toEqual(Array.from(bytes))
    }
  })

  it('emits the alphabet authenticator apps expect, unpadded', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
    expect(RFC_SECRET).not.toContain('=')
  })

  it('tolerates the spacing and case a user types back', () => {
    expect(Array.from(base32Decode('gezd gnbv gy3t-qojq'))).toEqual(
      Array.from(base32Decode('GEZDGNBVGY3TQOJQ')),
    )
  })

  it('rejects a secret that is not base32', () => {
    expect(() => base32Decode('not-valid-base32!')).toThrow()
  })
})

describe('totpCode', () => {
  it('matches the RFC 6238 test vectors', () => {
    for (const vector of RFC_VECTORS) {
      const step = stepFor(vector.seconds * 1000)
      expect(totpCode(RFC_SECRET, step)).toBe(vector.eightDigits.slice(-6))
    }
  })

  it('always emits six digits, zero padded', () => {
    for (let step = 0; step < 200; step++) {
      expect(totpCode(RFC_SECRET, step)).toMatch(/^\d{6}$/)
    }
  })
})

describe('verifyTotp', () => {
  const now = new Date('2026-08-07T10:00:00Z')

  it('accepts the current code and reports its step', () => {
    const step = stepFor(now)
    const result = verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), { now })
    expect(result).toEqual({ valid: true, step })
  })

  it('accepts one step of clock drift in either direction, and no more', () => {
    const step = stepFor(now)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), { now }).valid).toBe(true)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), { now }).valid).toBe(true)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), { now }).valid).toBe(false)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), { now }).valid).toBe(false)
  })

  it('ignores spaces the user typed but rejects the wrong length', () => {
    const code = totpCode(RFC_SECRET, stepFor(now))
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { now }).valid).toBe(true)
    expect(verifyTotp(RFC_SECRET, code.slice(0, 5), { now }).valid).toBe(false)
    expect(verifyTotp(RFC_SECRET, '', { now }).valid).toBe(false)
  })

  it('returns the step so the caller can refuse a replay', () => {
    const step = stepFor(now)
    const first = verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), { now })
    // A code stays valid for its whole period; the caller stores this step
    // and rejects a second use of it.
    expect(first.step).toBe(step)
  })
})

describe('secret sealing', () => {
  it('round-trips through AES-GCM', () => {
    const secret = generateSecret()
    const sealed = sealSecret(secret)

    expect(sealed).not.toContain(secret)
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(openSecret(sealed)).toBe(secret)
  })

  it('produces a different ciphertext each time', () => {
    const secret = generateSecret()
    expect(sealSecret(secret)).not.toBe(sealSecret(secret))
  })

  it('refuses a tampered payload rather than returning garbage', () => {
    const sealed = sealSecret(generateSecret())
    const parts = sealed.split('.')
    const flipped = `${parts[0]}.${parts[1]}.${parts[2]}.${Buffer.from('tampered').toString('base64url')}`
    expect(() => openSecret(flipped)).toThrow()
  })

  it('rejects a value from an unknown format version', () => {
    expect(() => openSecret('v9.a.b.c')).toThrow(/format this build understands/)
  })
})

describe('recovery codes', () => {
  it('generates ten unique codes with no ambiguous characters', () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const code of codes) {
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/)
      // 0/O and 1/I/L are the pairs people mistranscribe from a printout.
      expect(code).not.toMatch(/[01OIL]/)
    }
  })

  it('matches regardless of case, spacing or the hyphen', () => {
    const [code] = generateRecoveryCodes(1)
    if (code === undefined) throw new Error('no code generated')

    const hashes = [hashRecoveryCode(code)]
    expect(recoveryCodeMatches(code.toLowerCase().replace('-', ' '), hashes)).toBe(hashes[0])
    expect(normaliseRecoveryCode('ab cd-ef')).toBe('ABCDEF')
  })

  it('does not match a code that was not issued', () => {
    const hashes = generateRecoveryCodes().map(hashRecoveryCode)
    expect(recoveryCodeMatches('ZZZZZ-ZZZZZ', hashes)).toBeNull()
  })

  it('stores a hash, never the code', () => {
    const [code] = generateRecoveryCodes(1)
    if (code === undefined) throw new Error('no code generated')
    const hash = hashRecoveryCode(code)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(normaliseRecoveryCode(code))
  })
})

describe('otpauthUri', () => {
  it('carries the issuer in both places apps look for it', () => {
    const uri = otpauthUri({
      secret: RFC_SECRET,
      account: 'ops@balitrips.example',
      issuer: 'Bali Trips',
    })

    expect(uri.startsWith('otpauth://totp/Bali%20Trips:ops%40balitrips.example?')).toBe(true)
    expect(uri).toContain('issuer=Bali+Trips')
    expect(uri).toContain(`secret=${RFC_SECRET}`)
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
  })
})
