import { describe, expect, it } from 'vitest'

import {
  generateWebhookSecret,
  signWebhook,
  TOLERANCE_SECONDS,
  verifyWebhookSignature,
  webhookEventKey,
  webhookEventRowId,
} from './webhook'

const SECRET = 'whsec_test_secret_value'
const NOW = 1_800_000_000
const BODY = JSON.stringify({ type: 'availability.changed', product: 'KAY-01' })

function check(overrides: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) {
  return verifyWebhookSignature({
    secret: SECRET,
    body: BODY,
    signature: signWebhook(SECRET, NOW, BODY),
    timestamp: String(NOW),
    nowSeconds: NOW,
    ...overrides,
  })
}

describe('webhook HMAC verification', () => {
  it('accepts a correctly signed, fresh request', () => {
    expect(check()).toEqual({ ok: true })
    expect(signWebhook(SECRET, NOW, BODY)).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('refuses a missing signature or timestamp', () => {
    expect(check({ signature: null })).toEqual({ ok: false, reason: 'missing_signature' })
    expect(check({ timestamp: null })).toEqual({ ok: false, reason: 'bad_timestamp' })
    expect(check({ timestamp: 'yesterday' })).toEqual({ ok: false, reason: 'bad_timestamp' })
  })

  it('refuses a changed body, another secret, or a truncated signature', () => {
    expect(check({ body: `${BODY} ` })).toEqual({ ok: false, reason: 'mismatch' })
    expect(check({ secret: 'whsec_other' })).toEqual({ ok: false, reason: 'mismatch' })
    expect(check({ signature: signWebhook(SECRET, NOW, BODY).slice(0, 20) })).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })

  it('binds the timestamp into the signature (no replay with a new timestamp)', () => {
    const later = NOW + 60
    expect(
      check({
        timestamp: String(later),
        nowSeconds: later,
        signature: signWebhook(SECRET, NOW, BODY),
      }),
    ).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('refuses requests outside the five-minute window', () => {
    expect(check({ nowSeconds: NOW + TOLERANCE_SECONDS + 1 })).toEqual({
      ok: false,
      reason: 'stale',
    })
    expect(check({ nowSeconds: NOW - TOLERANCE_SECONDS - 1 })).toEqual({
      ok: false,
      reason: 'stale',
    })
    expect(check({ nowSeconds: NOW + TOLERANCE_SECONDS })).toEqual({ ok: true })
  })
})

describe('webhook idempotency key', () => {
  it('uses the supplier event id when given, so a redelivery is the same event', () => {
    expect(webhookEventKey('evt_123', BODY)).toBe('id:evt_123')
    expect(webhookEventKey('evt_123', `${BODY}x`)).toBe(webhookEventKey('evt_123', BODY))
  })

  it('falls back to the body hash, and ignores unusable ids', () => {
    const key = webhookEventKey(null, BODY)
    expect(key).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(webhookEventKey(null, BODY)).toBe(key)
    expect(webhookEventKey(null, `${BODY} `)).not.toBe(key)
    expect(webhookEventKey('bad id with spaces', BODY)).toBe(key)
    expect(webhookEventKey('', BODY)).toBe(key)
  })

  it('stores per connection, within the column width', () => {
    const a = '11111111-1111-4111-8111-111111111111'
    const b = '22222222-2222-4222-8222-222222222222'
    const key = webhookEventKey('x'.repeat(100), BODY)
    expect(webhookEventRowId(a, key).length).toBeLessThanOrEqual(128)
    expect(webhookEventRowId(a, key)).not.toBe(webhookEventRowId(b, key))
    expect(webhookEventRowId(a, key)).toBe(webhookEventRowId(a, key))
  })

  it('generates long, unique signing secrets', () => {
    const one = generateWebhookSecret()
    expect(one).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/)
    expect(generateWebhookSecret()).not.toBe(one)
  })
})
