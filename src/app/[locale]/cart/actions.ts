'use server'

/**
 * Cart mutations, as Server Actions.
 *
 * Thin by design: every one of them validates its input, calls the service in
 * `@/lib/cart` and revalidates. No pricing, no totals and no trust in what the
 * browser sent — the service resolves the caller's own cart from the session
 * or the anonymous cookie and refuses to touch a row that does not belong to
 * it, so an item id from a hostile client is a no-op rather than a lever.
 *
 * Actions return a plain result object instead of throwing, because a thrown
 * error in an action surfaces as a generic digest in production and tells the
 * traveller nothing.
 */

import { revalidatePath } from 'next/cache'

import { bookingsOpen } from '@/lib/bookings-open'
import { addItem, clearCart, removeItem, updateQuantity, type AddItemInput } from '@/lib/cart'

export interface CartActionResult {
  ok: boolean
  itemCount: number
  /** Set when the refusal has a reason worth showing the traveller. */
  reason?: 'bookings_closed'
}

/**
 * The cart page and the checkout page both read the cart on every request, so
 * they are dynamic; revalidating clears the client Router Cache entry, which
 * is what would otherwise show a stale trip after a back navigation.
 */
function revalidateCartRoutes(): void {
  revalidatePath('/[locale]/cart', 'page')
  revalidatePath('/[locale]/checkout', 'page')
}

export async function updateQuantityAction(
  itemId: string,
  quantity: number,
): Promise<CartActionResult> {
  if (typeof itemId !== 'string' || itemId === '') return { ok: false, itemCount: 0 }
  if (!Number.isFinite(quantity)) return { ok: false, itemCount: 0 }

  const result = await updateQuantity(itemId, Math.trunc(quantity))
  revalidateCartRoutes()
  return { ok: true, itemCount: result.itemCount }
}

export async function removeItemAction(itemId: string): Promise<CartActionResult> {
  if (typeof itemId !== 'string' || itemId === '') return { ok: false, itemCount: 0 }

  const result = await removeItem(itemId)
  revalidateCartRoutes()
  return { ok: true, itemCount: result.itemCount }
}

export async function clearCartAction(): Promise<CartActionResult> {
  const result = await clearCart()
  revalidateCartRoutes()
  return { ok: true, itemCount: result.itemCount }
}

/**
 * Add to the trip.
 *
 * Exposed here so the product pages have one entry point rather than each
 * inventing its own. Pass `driver` to sell a private car alongside an
 * activity — that is the only supported way to do it, and it is what links
 * the two lines so removing the activity cannot leave the car behind.
 */
export async function addToCartAction(input: AddItemInput): Promise<CartActionResult> {
  // addItem() throws as well; this returns instead, because a thrown error in
  // an action is an opaque digest in production. Deliberately NOT applied to
  // updateQuantity/removeItem/clearCart: a traveller whose trip is stranded by
  // the freeze must still be able to empty it.
  if (!bookingsOpen()) return { ok: false, itemCount: 0, reason: 'bookings_closed' }

  const result = await addItem(input)
  revalidateCartRoutes()
  return { ok: true, itemCount: result.itemCount }
}
