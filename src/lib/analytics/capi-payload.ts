import { hashedEmail, hashedPhone, sha256Hex } from './hash'
import { toMajor } from './pixels'

/**
 * Server-API payloads for a purchase (Meta Conversions API, TikTok Events
 * API). Pure — tested. Only hashed identifiers, value, currency and the
 * shared event id; never a name or a plain email / phone.
 */

export interface Candidate {
  id: string
  eventId: string
  createdAt: Date
  valueMinor: number | null
  currency: string | null
  anonId: string | null
  orderId: string | null
  email: string | null
  phone: string | null
}

export function metaPayload(candidate: Candidate) {
  const userData: Record<string, string[]> = {}
  const em = hashedEmail(candidate.email)
  if (em) userData.em = [em]
  const ph = hashedPhone(candidate.phone)
  if (ph) userData.ph = [ph]
  if (candidate.anonId) userData.external_id = [sha256Hex(candidate.anonId)]
  return {
    event_name: 'Purchase',
    event_time: Math.floor(candidate.createdAt.getTime() / 1000),
    event_id: candidate.eventId,
    action_source: 'website',
    user_data: userData,
    custom_data:
      candidate.valueMinor !== null && candidate.currency
        ? {
            currency: candidate.currency,
            value: toMajor(candidate.valueMinor, candidate.currency),
          }
        : {},
  }
}

export function tiktokPayload(candidate: Candidate) {
  const user: Record<string, string> = {}
  const em = hashedEmail(candidate.email)
  if (em) user.email = em
  const ph = hashedPhone(candidate.phone)
  if (ph) user.phone = ph
  if (candidate.anonId) user.external_id = sha256Hex(candidate.anonId)
  return {
    event: 'CompletePayment',
    event_time: Math.floor(candidate.createdAt.getTime() / 1000),
    event_id: candidate.eventId,
    user,
    properties:
      candidate.valueMinor !== null && candidate.currency
        ? {
            currency: candidate.currency,
            value: toMajor(candidate.valueMinor, candidate.currency),
            content_type: 'product',
          }
        : {},
  }
}
