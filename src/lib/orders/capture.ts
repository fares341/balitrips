/**
 * Pay only after the supplier confirms (client, Oct 2026) — pure.
 *
 * An order with anything a supplier must run (activities, packages, drivers)
 * is only AUTHORISED at checkout: the card is held, not charged. Staff
 * confirm with the supplier and capture it from Studio; a refusal, or six
 * days without confirmation, releases the hold and nothing is charged.
 * Digital products (itineraries, VIP plans, custom plans) are charged at once.
 *
 * Stripe keeps a card authorisation for about 7 days, which is why the
 * sweep releases at 6: a capture after expiry would fail.
 */

import { isDigitalKind } from './booking-status'

export const CAPTURE_MODES = ['automatic', 'manual'] as const
export type CaptureMode = (typeof CAPTURE_MODES)[number]

/** Days an authorisation may wait for the supplier before it is released. */
export const AUTHORIZATION_DAYS = 6

/** Line kinds that carry no service (price adjustments). */
const NON_SERVICE = new Set(['discount', 'fee', 'tax'])

export function captureModeFor(kinds: readonly string[]): CaptureMode {
  return kinds.some((kind) => !NON_SERVICE.has(kind) && !isDigitalKind(kind))
    ? 'manual'
    : 'automatic'
}

/** Has an authorisation waited too long for the supplier? */
export function authorizationExpired(
  authorizedAt: Date,
  now: Date,
  days: number = AUTHORIZATION_DAYS,
): boolean {
  return now.getTime() - authorizedAt.getTime() >= days * 24 * 60 * 60 * 1000
}
