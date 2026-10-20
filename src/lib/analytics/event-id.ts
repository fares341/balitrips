import { createHash } from 'node:crypto'

import type { EventName } from './events'

/**
 * Deterministic event ids for server events.
 *
 * The same fact always gets the same id: `purchase` of order X is
 * `serverEventId('purchase', X)` whether the webhook, the reconcile sweep, the
 * worker's sync or the confirmation page computes it. That one property is
 * what makes duplicates impossible:
 *
 *  - in our own table, `analytics_events.event_id` is unique, so the second
 *    insert is a no-op;
 *  - at Meta and TikTok, the browser pixel and the server API send the same
 *    `event_id`, which both platforms use to drop the duplicate.
 *
 * Shaped as an RFC 4122 UUID (version 5 bits, SHA-256 based) so it fits the
 * `uuid` column and is accepted everywhere a UUID is.
 */
const NAMESPACE = 'balitrips:analytics:v1'

export function serverEventId(name: EventName, key: string): string {
  const hex = createHash('sha256').update(`${NAMESPACE}:${name}:${key}`).digest('hex').slice(0, 32)
  const bytes = hex.split('')
  // version 5
  bytes[12] = '5'
  // variant 10xx
  bytes[16] = ((parseInt(bytes[16] ?? '0', 16) & 0x3) | 0x8).toString(16)
  const s = bytes.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}
