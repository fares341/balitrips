import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Inbound supplier webhooks: the signature scheme we ask suppliers to use.
 *
 *   X-Bali-Timestamp: <unix seconds>
 *   X-Bali-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>">
 *   X-Bali-Event-Id:  <the supplier's unique id for this event>   (optional)
 *
 * The timestamp is inside the signed text and must be within five minutes,
 * so a captured request cannot be replayed later; the event id (or, without
 * one, the hash of the body) is unique per connection in `webhook_events`, so
 * a retried delivery is accepted once and acknowledged after that.
 *
 * A supplier whose platform signs differently gets its own `verifyWebhook` in
 * its adapter (docs/integrations.md); this is the default.
 */

export const SIGNATURE_HEADER = 'x-bali-signature'
export const TIMESTAMP_HEADER = 'x-bali-timestamp'
export const EVENT_ID_HEADER = 'x-bali-event-id'

/** How far the sender's clock may be from ours. */
export const TOLERANCE_SECONDS = 5 * 60

export type WebhookCheck =
  | { ok: true }
  | { ok: false; reason: 'missing_signature' | 'bad_timestamp' | 'stale' | 'mismatch' }

export function signWebhook(secret: string, timestamp: number, body: string): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return `sha256=${mac}`
}

export function verifyWebhookSignature(input: {
  secret: string
  body: string
  signature: string | null
  timestamp: string | null
  nowSeconds?: number
}): WebhookCheck {
  if (!input.signature) return { ok: false, reason: 'missing_signature' }
  if (!input.timestamp || !/^\d{9,11}$/.test(input.timestamp)) {
    return { ok: false, reason: 'bad_timestamp' }
  }
  const timestamp = Number(input.timestamp)
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > TOLERANCE_SECONDS) return { ok: false, reason: 'stale' }

  const expected = Buffer.from(signWebhook(input.secret, timestamp, input.body))
  const given = Buffer.from(input.signature.trim())
  // timingSafeEqual throws on different lengths; a length mismatch is a mismatch.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: 'mismatch' }
  }
  return { ok: true }
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/**
 * The idempotency key of one delivery: the supplier's event id when it sends
 * one, else the body's hash (the same body delivered twice is the same event).
 */
export function webhookEventKey(eventIdHeader: string | null, body: string): string {
  const id = eventIdHeader?.trim()
  if (id && /^[\w.:@-]{1,100}$/.test(id)) return `id:${id}`
  return `sha256:${sha256Hex(body)}`
}

/** A new signing secret: 32 random bytes, prefixed so it is recognisable. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`
}

/** `webhook_events.provider` for every supplier connection. */
export const WEBHOOK_PROVIDER = 'integration'

/**
 * `webhook_events.provider_event_id`: the connection plus the hashed event key
 * (fits the 128-character column whatever the supplier's id looks like).
 */
export function webhookEventRowId(integrationId: string, eventKey: string): string {
  return `${integrationId}:${sha256Hex(eventKey)}`
}
