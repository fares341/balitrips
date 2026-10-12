'use server'

/**
 * Checkout server actions.
 *
 * Two of them:
 *
 *  - `beginSignInAction` records where to come back to and sends the visitor
 *    to sign in. The handoff dropped you back on the cart page with no
 *    pending-intent state, so after creating an account you had to find and
 *    press "complete booking" a second time. The intent is carried twice, in
 *    the `?next=` parameter and in an httpOnly cookie, so it survives whatever
 *    the auth screen does with the query string.
 *
 *  - `startCheckoutAction` is the real one. It re-reads the cart, compares the
 *    freshly computed total against the total the browser actually displayed,
 *    requires an explicit acceptance of the cancellation policy, and only then
 *    calls `checkout()`. Nothing about the amount comes from the form.
 *
 * `checkout()` deliberately leaves the order in `pending`; only a verified
 * webhook moves it to `paid`. So the last thing these actions do is follow the
 * provider's `nextAction` — a redirect for 3-D Secure — and let the
 * confirmation page wait for the webhook.
 */

import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { orders, payments } from '@/db/schema'
import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import {
  getCartWithTotals,
  getSessionUser,
  mergeAnonymousCartOnSignIn,
  setPendingCheckout,
} from '@/lib/cart'
import { isPlaceholderEmail } from '@/lib/auth/phone'
import { bookingsOpen } from '@/lib/bookings-open'
import { CheckoutError, checkout } from '@/lib/orders/checkout'

import {
  CHECKOUT_HREF,
  CONFIRMATION_HREF,
  SIGN_IN_HREF,
  SITE_URL,
  TERMS_VERSION,
  type CheckoutState,
} from './constants'
import { activeUserOrNull } from '@/lib/security/require'

function localeOf(value: FormDataEntryValue | null): Locale {
  return typeof value === 'string' && isLocale(value) ? value : defaultLocale
}

/**
 * Send the visitor to sign in, remembering that they were mid-checkout.
 *
 * A form action rather than a link precisely so the cookie is written: a
 * Server Component render cannot set cookies, and losing the intent is the
 * bug this exists to fix.
 */
export async function beginSignInAction(formData: FormData): Promise<never> {
  const locale = localeOf(formData.get('locale'))
  await setPendingCheckout(CHECKOUT_HREF)
  // `getPathname` is the only thing that knows how `localePrefix: 'as-needed'`
  // maps a route to a path, so the destination is built with it and handed to
  // the plain redirect — which is typed `never` and therefore terminates the
  // action for the compiler as well as at runtime.
  redirect(
    getPathname({ href: { pathname: SIGN_IN_HREF, query: { next: CHECKOUT_HREF } }, locale }),
  )
}

export async function startCheckoutAction(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  // Nothing is read from the form when bookings are closed. This is the
  // user-facing half only; the enforcement is the throw at the top of
  // checkout(), which this cannot be relied upon to replace -- a server action
  // is a POST endpoint and is invocable whatever the page renders.
  if (!bookingsOpen()) return { error: 'bookings_closed' }

  const locale = localeOf(formData.get('locale'))

  // The cancellation ladder must be accepted explicitly, every time. An
  // unchecked box is not consent, and a pre-checked one is not evidence.
  if (formData.get('terms') !== 'on') return { error: 'terms' }

  const user = await getSessionUser()
  if (!user) return { error: 'sign_in' }
  // جهاز مُزال أو IP/جهاز محظور لا يشتري — نفس فحص المحتوى المدفوع.
  if ((await activeUserOrNull('checkout')) === null) return { error: 'sign_in' }

  // Signing up mid-flow is the normal path; fold the anonymous trip in before
  // pricing it, or the account checks out with an empty cart.
  await mergeAnonymousCartOnSignIn(user.id)

  const cart = await getCartWithTotals()
  if (cart === null || cart.itemCount === 0) return { error: 'empty' }
  if (!cart.ok) return { error: 'invalid_cart' }

  /**
   * What the browser displayed must equal what the server just computed.
   *
   * `checkout()` performs the same comparison against the catalogue, but this
   * one catches the case that matters to the customer: an admin changed a
   * price between the page rendering and the button being pressed. Charging a
   * total the customer never saw is the one outcome worth aborting for.
   */
  const displayed = Number(formData.get('expectedTotalMinor'))
  if (!Number.isInteger(displayed) || displayed !== cart.totalMinor) {
    return { error: 'price_changed', newTotalMinor: cart.totalMinor, currency: cart.currency }
  }

  const rawKey = formData.get('idempotencyKey')
  const idempotencyKey = typeof rawKey === 'string' && rawKey !== '' ? rawKey : randomUUID()

  /**
   * A repeat submission of the same form must not buy the trip twice.
   *
   * The unique index on `payments.idempotency_key` would reject the second
   * insert, but only after `checkout()` had already written a second order and
   * held capacity for it. Catching it here means the duplicate press simply
   * lands on the order it already created.
   */
  const existing = await db
    .select({ orderNumber: orders.orderNumber })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(eq(payments.idempotencyKey, idempotencyKey))
    .limit(1)

  const alreadyPlaced = existing[0]
  if (alreadyPlaced) {
    redirect(getPathname({ href: `${CONFIRMATION_HREF}/${alreadyPlaced.orderNumber}`, locale }))
  }

  const returnUrl = `${SITE_URL}${getPathname({ href: '/checkout/return', locale })}?k=${encodeURIComponent(idempotencyKey)}`

  let result
  try {
    result = await checkout({
      cartId: cart.cartId,
      userId: user.id,
      expectedTotalMinor: cart.totalMinor,
      customer: {
        email: user.email,
        name: user.name ?? (isPlaceholderEmail(user.email) ? (user.phone ?? '') : user.email),
        ...(user.phone === null ? {} : { phone: user.phone }),
        ...(user.country === null ? {} : { country: user.country }),
        locale,
      },
      termsVersion: TERMS_VERSION,
      returnUrl,
      idempotencyKey,
    })
  } catch (error) {
    // Backstop for a flag flipped between the check above and the call.
    // Matched by name, not instanceof: the guard module and this action can
    // land in different bundles, where instanceof fails across the boundary.
    // Without this the refusal falls through to `unknown` and the traveller
    // is told "Something went wrong" instead of the real reason.
    if (error instanceof Error && error.name === 'BookingsClosedError') {
      return { error: 'bookings_closed' }
    }

    if (error instanceof CheckoutError && error.code === 'duplicate') {
      // ضغطة ثانية متزامنة بنفس المفتاح: الأولى أنشأت الطلب — نذهب إليه.
      const [placed] = await db
        .select({ orderNumber: orders.orderNumber })
        .from(payments)
        .innerJoin(orders, eq(orders.id, payments.orderId))
        .where(eq(payments.idempotencyKey, idempotencyKey))
        .limit(1)
      if (placed) {
        redirect(getPathname({ href: `${CONFIRMATION_HREF}/${placed.orderNumber}`, locale }))
      }
      return { error: 'unknown' }
    }
    if (error instanceof CheckoutError) {
      switch (error.code) {
        case 'empty_cart':
          return { error: 'empty' }
        case 'invalid_cart':
          return { error: 'invalid_cart' }
        case 'price_changed':
          return {
            error: 'price_changed',
            newTotalMinor: error.quote?.totalMinor ?? cart.totalMinor,
            currency: error.quote?.currency ?? cart.currency,
          }
        default:
          return { error: 'unknown' }
      }
    }
    // A capacity clash is someone else taking the last van for that date
    // while this checkout was in flight; it is not a payment failure.
    if (error instanceof Error && error.name === 'CapacityError') return { error: 'capacity' }
    if (error instanceof Error && error.name === 'PaymentProviderError') return { error: 'payment' }
    return { error: 'unknown' }
  }

  /**
   * Follow the provider. Every intent requires 3-D Secure by contract, so the
   * redirect branch is the normal one — the others exist so a provider that
   * settles in-page, or one that needs no step-up, does not fall through to a
   * blank screen.
   */
  const next = result.payment.nextAction
  if (next !== null && typeof next === 'object' && 'type' in next) {
    const action = next as { type: string; url?: string }
    if (action.type === 'redirect' && typeof action.url === 'string') {
      // Absolute, provider-owned URL: the plain Next redirect, not the
      // locale-aware one, which would try to prefix it.
      redirect(action.url)
    }
  }

  redirect(getPathname({ href: `${CONFIRMATION_HREF}/${result.orderNumber}`, locale }))
}
