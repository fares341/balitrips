/**
 * Who is asking.
 *
 * The cart is server-owned, so every mutation has to be scoped to *someone*:
 * a signed-in user, or an anonymous browser holding a cart token. This module
 * answers the first half of that question.
 *
 * It is a thin adapter over `@/lib/auth/session`, which owns session
 * resolution for the whole app. Reading the session cookie a second time here
 * would be a second implementation of "is this person signed in" — and the two
 * would eventually disagree about a revoked session or a soft-deleted account,
 * which is the kind of disagreement that lets someone check out as a user who
 * no longer exists.
 *
 * The narrower shape is deliberate: the cart has no business knowing about
 * roles or capabilities, and nothing here should be able to make an
 * authorization decision by accident.
 */

import type { Locale } from '@/i18n/config'
import { getUser } from '@/lib/auth/session'

export interface CartSessionUser {
  id: string
  email: string
  name: string | null
  phone: string | null
  country: string | null
  locale: Locale
}

/**
 * The signed-in user, or null.
 *
 * Reading the session reads headers, which makes the calling route dynamic.
 * That is correct here and nowhere else: the cart and checkout are inherently
 * per-visitor, while the catalogue pages stay statically renderable precisely
 * because they never call this.
 */
export async function getSessionUser(): Promise<CartSessionUser | null> {
  const user = await getUser()
  if (!user) return null

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    country: user.country,
    locale: user.locale,
  }
}
