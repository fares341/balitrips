/**
 * Guest checkout identity.
 *
 * A traveller who checks out without an account is identified by an opaque,
 * httpOnly `bt_guest` cookie. Only its sha256 is stored on the order
 * (`orders.guest_token_hash`), so a database read never yields a usable
 * credential, and the order page opens for that browser alone. The
 * confirmation email carries the order details for any other device.
 */

import { createHash, randomBytes } from 'node:crypto'

import { cookies } from 'next/headers'

export const GUEST_COOKIE = 'bt_guest'

/** Six months: long enough to come back to an order before the trip. */
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 180

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Hash of this browser's guest token, or null when it has none. Read-only. */
export async function readGuestTokenHash(): Promise<string | null> {
  const store = await cookies()
  const token = store.get(GUEST_COOKIE)?.value
  if (token === undefined || token.length < 32 || token.length > 128) return null
  return hashGuestToken(token)
}

/**
 * The guest token's hash, minting the cookie first when there is none.
 * Writes a cookie, so it may only be called from a Server Action or a
 * Route Handler.
 */
export async function ensureGuestTokenHash(): Promise<string> {
  const existing = await readGuestTokenHash()
  if (existing !== null) return existing
  const token = randomBytes(32).toString('base64url')
  const store = await cookies()
  store.set(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GUEST_COOKIE_MAX_AGE,
  })
  return hashGuestToken(token)
}

/** Whether this visitor may open the order: its owner, or the guest browser that placed it. */
export function canViewOrder(
  order: { userId: string | null; guestTokenHash: string | null },
  viewer: { userId: string | null; guestTokenHash: string | null },
): boolean {
  if (order.userId !== null) return viewer.userId === order.userId
  return (
    order.guestTokenHash !== null &&
    viewer.guestTokenHash !== null &&
    order.guestTokenHash === viewer.guestTokenHash
  )
}
