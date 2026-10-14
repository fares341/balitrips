/**
 * Checkout constants.
 *
 * Kept out of `actions.ts` because a `'use server'` module may only export
 * async functions — a plain constant there is a build error.
 */

/**
 * Version of the cancellation ladder the customer is accepting.
 *
 * Stored on the order as `terms_version` alongside `terms_accepted_at`. The
 * schema comment says why this matters: it is the compelling evidence that
 * wins "services not rendered" disputes, and the dispute window on
 * future-dated travel runs up to about 540 days — so knowing *which* wording
 * was on screen is as important as knowing that it was accepted.
 *
 * Bump this whenever the copy on /refund or /terms changes materially.
 */
export const TERMS_VERSION = 'cancellation-2026-01'

export const CHECKOUT_HREF = '/checkout'
export const CART_RETURN_HREF = '/my-trip'
export const CHECKOUT_RETURN_HREF = '/checkout/return'
export const CONFIRMATION_HREF = '/checkout/confirmation'

/** Where an unauthenticated visitor is sent to sign in. */
export const SIGN_IN_HREF = '/account'

/** Public origin, no trailing slash. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
)

/** Result of the checkout action, rendered by the form. */
export type CheckoutErrorCode =
  /** ALLOW_BOOKINGS is not 'true'. No order can be created at all. */
  | 'bookings_closed'
  /** Step 1: a contact field is invalid; see `fields`. */
  | 'contact'
  | 'terms'
  | 'sign_in'
  | 'empty'
  | 'invalid_cart'
  | 'price_changed'
  | 'capacity'
  | 'payment'
  | 'unknown'

export interface CheckoutState {
  error: CheckoutErrorCode | null
  /** Message keys per contact field, on `contact`. */
  fields?: Partial<Record<'name' | 'email' | 'phone' | 'notes', string>>
  /** Set on `price_changed`, so the page can say what the total is now. */
  newTotalMinor?: number
  currency?: string
  /** `newTotalMinor` formatted for the page. */
  newTotalLabel?: string
}

export const INITIAL_CHECKOUT_STATE: CheckoutState = { error: null }

/**
 * Cart kinds that need an account: the itinerary file and map access are
 * delivered to an account, and a custom itinerary belongs to its requester.
 * A trip without them can be booked as a guest.
 */
export const ACCOUNT_ONLY_KINDS: readonly string[] = ['itinerary', 'plan', 'custom']
