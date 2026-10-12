import { describe, expect, it } from 'vitest'

import { presignObjectUrl, signRequest, uriEncode } from './sigv4'

/**
 * AWS publishes a worked example for query-parameter authentication:
 * GET `test.txt` from `examplebucket`, us-east-1, 24-hour expiry, signed at
 * 2013-05-24T00:00:00Z with the documented example credentials.
 *
 * Pinning that exact signature is the whole point of these tests. A signer
 * that is subtly wrong does not fail loudly — it produces a URL that Spaces
 * answers with `SignatureDoesNotMatch`, at 02:00, from a background job, for
 * a customer trying to download something they paid for.
 */
const EXAMPLE_CREDENTIALS = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
}

const EXAMPLE_DATE = new Date('2013-05-24T00:00:00.000Z')

describe('uriEncode', () => {
  it('leaves the unreserved set alone', () => {
    expect(uriEncode('abcXYZ019-._~')).toBe('abcXYZ019-._~')
  })

  it('encodes the characters encodeURIComponent does not', () => {
    expect(uriEncode("!*'()")).toBe('%21%2A%27%28%29')
  })

  it('encodes a space as %20, never as +', () => {
    expect(uriEncode('a b')).toBe('a%20b')
  })

  it('encodes UTF-8 byte by byte', () => {
    // Arabic slugs reach object keys through itinerary names.
    expect(uriEncode('ب')).toBe('%D8%A8')
  })

  it('can keep slashes as path delimiters', () => {
    expect(uriEncode('a/b', false)).toBe('a/b')
    expect(uriEncode('a/b')).toBe('a%2Fb')
  })
})

describe('presignObjectUrl', () => {
  it("matches AWS's documented presigned-URL example", () => {
    const url = presignObjectUrl({
      endpoint: 'https://s3.amazonaws.com',
      bucket: 'examplebucket',
      key: 'test.txt',
      region: 'us-east-1',
      credentials: EXAMPLE_CREDENTIALS,
      expiresInSeconds: 86400,
      now: EXAMPLE_DATE,
    })

    expect(url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt' +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z' +
        '&X-Amz-Expires=86400' +
        '&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    )
  })

  it('signs response overrides, so a recipient cannot rewrite them', () => {
    const withDisposition = presignObjectUrl({
      endpoint: 'https://sgp1.digitaloceanspaces.com',
      bucket: 'bali-private',
      key: 'itineraries/abc/v3/ar.pdf',
      region: 'sgp1',
      credentials: EXAMPLE_CREDENTIALS,
      expiresInSeconds: 120,
      now: EXAMPLE_DATE,
      query: { 'response-content-disposition': 'attachment; filename="plan.pdf"' },
    })

    const plain = presignObjectUrl({
      endpoint: 'https://sgp1.digitaloceanspaces.com',
      bucket: 'bali-private',
      key: 'itineraries/abc/v3/ar.pdf',
      region: 'sgp1',
      credentials: EXAMPLE_CREDENTIALS,
      expiresInSeconds: 120,
      now: EXAMPLE_DATE,
    })

    expect(withDisposition).toContain('response-content-disposition=')
    expect(signatureOf(withDisposition)).not.toBe(signatureOf(plain))
  })

  it('uses virtual-hosted style by default and path style on request', () => {
    const options = {
      endpoint: 'https://sgp1.digitaloceanspaces.com',
      bucket: 'bali-private',
      key: 'a/b.pdf',
      region: 'sgp1',
      credentials: EXAMPLE_CREDENTIALS,
      expiresInSeconds: 60,
      now: EXAMPLE_DATE,
    }

    expect(presignObjectUrl(options)).toContain(
      'https://bali-private.sgp1.digitaloceanspaces.com/a/b.pdf?',
    )
    expect(presignObjectUrl({ ...options, forcePathStyle: true })).toContain(
      'https://sgp1.digitaloceanspaces.com/bali-private/a/b.pdf?',
    )
  })

  it('rounds a fractional expiry down and never below one second', () => {
    const url = presignObjectUrl({
      endpoint: 'https://s3.amazonaws.com',
      bucket: 'b',
      key: 'k',
      region: 'us-east-1',
      credentials: EXAMPLE_CREDENTIALS,
      expiresInSeconds: 0,
      now: EXAMPLE_DATE,
    })
    expect(url).toContain('X-Amz-Expires=1')
  })
})

describe('signRequest', () => {
  it('produces an Authorization header covering the payload', () => {
    const signed = signRequest({
      method: 'PUT',
      endpoint: 'https://sgp1.digitaloceanspaces.com',
      bucket: 'bali-private',
      key: 'itineraries/abc/v1/en.pdf',
      region: 'sgp1',
      credentials: EXAMPLE_CREDENTIALS,
      headers: { 'content-type': 'application/pdf', 'x-amz-acl': 'private' },
      body: new Uint8Array([1, 2, 3]),
      now: EXAMPLE_DATE,
    })

    expect(signed.url).toBe(
      'https://bali-private.sgp1.digitaloceanspaces.com/itineraries/abc/v1/en.pdf',
    )
    expect(signed.headers.authorization).toContain(
      'Credential=AKIAIOSFODNN7EXAMPLE/20130524/sgp1/s3/aws4_request',
    )
    expect(signed.headers.authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date',
    )
    // sha256 of the three bytes above.
    expect(signed.headers['x-amz-content-sha256']).toBe(
      '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    )
  })

  it('omits host, which fetch owns and refuses to let callers set', () => {
    const signed = signRequest({
      method: 'PUT',
      endpoint: 'https://sgp1.digitaloceanspaces.com',
      bucket: 'bali-public',
      key: 'x.png',
      region: 'sgp1',
      credentials: EXAMPLE_CREDENTIALS,
      body: '',
      now: EXAMPLE_DATE,
    })

    expect(Object.keys(signed.headers)).not.toContain('host')
    // …but it is still covered by the signature.
    expect(signed.headers.authorization).toContain('host')
  })

  it('changes the signature when the body changes', () => {
    const base = {
      method: 'PUT' as const,
      endpoint: 'https://sgp1.digitaloceanspaces.com',
      bucket: 'bali-private',
      key: 'k.pdf',
      region: 'sgp1',
      credentials: EXAMPLE_CREDENTIALS,
      now: EXAMPLE_DATE,
    }
    const a = signRequest({ ...base, body: 'one' })
    const b = signRequest({ ...base, body: 'two' })
    expect(a.headers.authorization).not.toBe(b.headers.authorization)
  })
})

function signatureOf(url: string): string {
  return new URL(url).searchParams.get('X-Amz-Signature') ?? ''
}
