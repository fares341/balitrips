import { describe, expect, it } from 'vitest'

import { describeThrown, errorFingerprint, scrubPath, scrubText, topFrame } from './scrub'

describe('scrubText', () => {
  it('removes e-mails, phone numbers, card numbers, tokens and secrets', () => {
    const text = [
      'Key (email)=(sara.ahmed@example.com) already exists',
      'call +62 812-3456-7890',
      'card 4242 4242 4242 4242',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
      'password=hunter2&token=abc123',
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
      'digest 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      'from 203.0.113.9',
    ].join(' | ')
    const clean = scrubText(text)
    for (const secret of [
      'sara.ahmed@example.com',
      '812-3456',
      '4242 4242',
      'abcdefghijklmnopqrstuvwxyz012345',
      'hunter2',
      'abc123',
      'eyJhbGciOiJIUzI1NiJ9',
      '9f86d081884c',
      '203.0.113.9',
    ]) {
      expect(clean).not.toContain(secret)
    }
    expect(clean).toContain('[email]')
    expect(clean).toContain('already exists')
  })

  it('caps the length', () => {
    expect(scrubText('x'.repeat(5000), 100).length).toBeLessThanOrEqual(101)
  })

  it('drops the query string from paths', () => {
    expect(scrubPath('/reset-password?token=abc&email=a@b.co')).toBe('/reset-password')
    expect(scrubPath(null)).toBeNull()
  })
})

describe('errorFingerprint', () => {
  const stack = (line: number) =>
    `Error: boom\n    at loadOrder (/app/src/lib/orders.ts:${line}:7)\n    at node:internal/process`

  it('groups the same error across different ids, people and line numbers', () => {
    const one = errorFingerprint({
      source: 'route',
      name: 'Error',
      message: 'Order 2b0e6c1e-1111-4111-8111-111111111111 for sara@example.com not found',
      stack: stack(10),
    })
    const two = errorFingerprint({
      source: 'route',
      name: 'Error',
      message: 'Order 9f3a2c1e-2222-4222-8222-222222222222 for omar@example.org not found',
      stack: stack(42),
    })
    expect(one).toBe(two)
    expect(one).toMatch(/^[0-9a-f]{64}$/)
  })

  it('separates different errors and different sources', () => {
    const base = { name: 'Error', message: 'boom', stack: stack(1) }
    expect(errorFingerprint({ ...base, source: 'route' })).not.toBe(
      errorFingerprint({ ...base, source: 'worker' }),
    )
    expect(errorFingerprint({ ...base, source: 'route' })).not.toBe(
      errorFingerprint({ ...base, source: 'route', message: 'other' }),
    )
  })

  it('takes the first frame of our own code', () => {
    const trace =
      'TypeError: x\n    at Object.<anonymous> (/app/node_modules/pkg/index.js:1:1)\n    at run (/app/src/worker/index.ts:20:5)'
    expect(topFrame(trace)).toBe('at run (/app/src/worker/index.ts')
  })
})

describe('describeThrown', () => {
  it('describes any thrown value without trusting its shape', () => {
    expect(describeThrown(new TypeError('bad'))).toMatchObject({
      name: 'TypeError',
      message: 'bad',
    })
    expect(describeThrown('plain')).toMatchObject({ name: 'NonError', message: 'plain' })
    expect(describeThrown({ message: 'obj', digest: 'D1' })).toMatchObject({
      message: 'obj',
      digest: 'D1',
    })
    expect(describeThrown(null)).toMatchObject({ message: 'null' })
  })
})
