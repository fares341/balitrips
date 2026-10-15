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
import { FEATURES } from '@/lib/features'
import {
  addDriverToBooking,
  addItem,
  clearCart,
  removeItem,
  updateQuantity,
  type AddItemInput,
} from '@/lib/cart'

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
  revalidatePath('/[locale]/my-trip', 'page')
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
  // The driver service is switched off on the public site (lib/features.ts).
  if (!FEATURES.driver && (input.kind === 'driver' || input.driver)) {
    return { ok: false, itemCount: 0 }
  }

  const result = await addItem(input)
  revalidateCartRoutes()
  return { ok: true, itemCount: result.itemCount }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DriversActionResult {
  ok: boolean
  itemCount: number
  /** Set when a car could not be added for at least one activity. */
  reason?: 'bookings_closed' | 'driver_full' | 'invalid'
}

/**
 * "Yes, add a driver" in the confirmation shown before payment: one linked
 * driver line per activity named, over that activity's own dates. The ids
 * are only a selection — `addDriverToBooking` re-reads each line from the
 * caller's own cart and prices nothing from the browser.
 */
export async function addDriversAction(itemIds: unknown): Promise<DriversActionResult> {
  if (!bookingsOpen()) return { ok: false, itemCount: 0, reason: 'bookings_closed' }
  if (!FEATURES.driver) return { ok: false, itemCount: 0, reason: 'invalid' }
  if (!Array.isArray(itemIds) || itemIds.length === 0 || itemIds.length > 20) {
    return { ok: false, itemCount: 0, reason: 'invalid' }
  }
  let itemCount = 0
  let full = false
  for (const id of itemIds) {
    if (typeof id !== 'string' || !UUID.test(id)) return { ok: false, itemCount, reason: 'invalid' }
    const result = await addDriverToBooking(id)
    if (result.ok) itemCount = result.itemCount
    else if (result.code === 'driver_full') full = true
  }
  revalidateCartRoutes()
  return full ? { ok: false, itemCount, reason: 'driver_full' } : { ok: true, itemCount }
}
