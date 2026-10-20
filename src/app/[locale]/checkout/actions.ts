'use server'

/**
 * Checkout server actions.
 *
 *  - `beginSignInAction` records where to come back to and sends the visitor
 *    to sign in. The intent is carried twice, in the `?next=` parameter and in
 *    an httpOnly cookie, so it survives whatever the auth screen does with the
 *    query string.
 *
 *  - `startCheckoutAction` is the real one (v3 checkout, steps 1–3). It
 *    validates the lead traveller's contact details, re-reads the cart,
 *    compares the freshly computed total against the total the browser
 *    actually displayed, requires an explicit acceptance of the terms, and
 *    only then calls `checkout()`. Nothing about the amount comes from the
 *    form. A signed-out traveller may check out as a guest when the trip holds
 *    nothing that must live in an account (itinerary files, map access).
 *
 *  - `retryPaymentAction` pays an open order again after a failed attempt —
 *    the SAME order number, never a second order (v3 handoff).
 *
 * `checkout()` deliberately leaves the order in `pending`; only a verified
 * webhook moves it to `paid`. So the last thing these actions do is follow the
 * provider's `nextAction` — a redirect for 3-D Secure — and let the
 * confirmation page wait for the webhook.
 */

import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { formatPrice } from '@/components/bt/card'
import { db } from '@/db'
import { orders, payments, users } from '@/db/schema'
import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import {
  getCartWithTotals,
  getSessionUser,
  mergeAnonymousCartOnSignIn,
  setCartCouponCode,
  setPendingCheckout,
} from '@/lib/cart'
import { bookingsOpen } from '@/lib/bookings-open'
import { needsAccount } from '@/lib/packages/account'
import { CheckoutError, checkout } from '@/lib/orders/checkout'
import { validateContact } from '@/lib/orders/contact'
import { canViewOrder, ensureGuestTokenHash, readGuestTokenHash } from '@/lib/orders/guest'
import { RetryError, retryOrderPayment } from '@/lib/orders/retry'
import { findActiveBan } from '@/lib/security/bans'
import { clientIp } from '@/lib/security/ip'
import { activeUserOrNull } from '@/lib/security/require'

import {
  ACCOUNT_ONLY_KINDS,
  CHECKOUT_HREF,
  CONFIRMATION_HREF,
  SIGN_IN_HREF,
  SITE_URL,
  TERMS_VERSION,
  type CheckoutState,
} from './constants'

function localeOf(value: FormDataEntryValue | null): Locale {
  return typeof value === 'string' && isLocale(value) ? value : defaultLocale
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

/** Absolute return URL for a payment attempt, keyed by its idempotency key. */
function returnUrlFor(locale: Locale, key: string): string {
  return `${SITE_URL}${getPathname({ href: '/checkout/return', locale })}?k=${encodeURIComponent(key)}`
}

/**
 * Follow the provider. Every intent requires 3-D Secure by contract, so the
 * redirect branch is the normal one — the others exist so a provider that
 * settles in-page, or one that needs no step-up, does not fall through to a
 * blank screen.
 */
function followProvider(nextAction: unknown, locale: Locale, orderNumber: string): never {
  if (nextAction !== null && typeof nextAction === 'object' && 'type' in nextAction) {
    const action = nextAction as { type: string; url?: string }
    if (action.type === 'redirect' && typeof action.url === 'string') {
      // Absolute, provider-owned URL: the plain Next redirect, not the
      // locale-aware one, which would try to prefix it.
      redirect(action.url)
    }
  }
  redirect(getPathname({ href: `${CONFIRMATION_HREF}/${orderNumber}`, locale }))
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

  // Step 1, checked again here: the browser's checks are a courtesy.
  const contact = validateContact({
    name: text(formData, 'name'),
    email: text(formData, 'email'),
    dialCode: text(formData, 'dialCode'),
    phone: text(formData, 'phone'),
    notes: text(formData, 'notes'),
  })
  if (!contact.ok) return { error: 'contact', fields: contact.errors }

  // The terms must be accepted explicitly, every time. An unchecked box is
  // not consent, and a pre-checked one is not evidence.
  if (formData.get('terms') !== 'on') return { error: 'terms' }

  const user = await getSessionUser()
  if (user) {
    // جهاز مُزال أو IP/جهاز محظور لا يشتري — نفس فحص المحتوى المدفوع.
    if ((await activeUserOrNull('checkout')) === null) return { error: 'sign_in' }
    // Signing up mid-flow is the normal path; fold the anonymous trip in
    // before pricing it, or the account checks out with an empty cart.
    await mergeAnonymousCartOnSignIn(user.id)
  } else {
    // A guest is still subject to an IP ban.
    const ip = clientIp(await headers())
    if ((await findActiveBan({ userId: null, fingerprintHash: null, ip })) !== null) {
      return { error: 'sign_in' }
    }
  }

  const cart = await getCartWithTotals()
  if (cart === null || cart.itemCount === 0) return { error: 'empty' }
  if (!cart.ok) return { error: 'invalid_cart' }

  if (!user) {
    // Phase 3: a package that comes with an itinerary or VIP counts too.
    const accountOnly = await needsAccount(
      cart.groups.flatMap((group) => group.lines),
      ACCOUNT_ONLY_KINDS,
    )
    if (accountOnly) return { error: 'sign_in' }
  }

  /**
   * What the browser displayed must equal what the server just computed.
   * `checkout()` performs the same comparison against the catalogue, but this
   * one catches the case that matters to the customer: an admin changed a
   * price between the page rendering and the button being pressed.
   */
  const displayed = Number(formData.get('expectedTotalMinor'))
  if (!Number.isInteger(displayed) || displayed !== cart.totalMinor) {
    return {
      error: 'price_changed',
      newTotalMinor: cart.totalMinor,
      currency: cart.currency,
      newTotalLabel: formatPrice(cart.totalMinor, cart.currency, locale),
    }
  }

  const rawKey = formData.get('idempotencyKey')
  const idempotencyKey = typeof rawKey === 'string' && rawKey !== '' ? rawKey : randomUUID()

  /**
   * A repeat submission of the same form must not buy the trip twice: the
   * duplicate press lands on the order the first one created.
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

  const guestTokenHash = user ? null : await ensureGuestTokenHash()
  const { name, email, phone, notes } = contact.value

  // Phase 4: "send me offers" is opt-in. A tick records consent on the
  // account; no tick never withdraws one given elsewhere.
  const marketingConsent = formData.get('marketingConsent') === 'on'
  if (user && marketingConsent) {
    await db
      .update(users)
      .set({
        marketingConsent: true,
        marketingConsentAt: new Date(),
        marketingConsentSource: 'checkout',
      })
      .where(eq(users.id, user.id))
  }

  let result
  try {
    result = await checkout({
      cartId: cart.cartId,
      userId: user?.id ?? null,
      guestTokenHash,
      expectedTotalMinor: cart.totalMinor,
      customer: {
        email,
        name,
        phone,
        ...(user?.country ? { country: user.country } : {}),
        locale,
        ...(notes === null ? {} : { notes }),
        ...(marketingConsent ? { marketingConsent: true } : {}),
      },
      termsVersion: TERMS_VERSION,
      returnUrl: returnUrlFor(locale, idempotencyKey),
      idempotencyKey,
    })
  } catch (error) {
    // Matched by name, not instanceof: the guard module and this action can
    // land in different bundles, where instanceof fails across the boundary.
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
            newTotalLabel: formatPrice(
              error.quote?.totalMinor ?? cart.totalMinor,
              error.quote?.currency ?? cart.currency,
              locale,
            ),
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

  followProvider(result.payment.nextAction, locale, result.orderNumber)
}

/**
 * "Try again" on a failed payment. Opens a new attempt on the SAME order —
 * same number, same frozen lines and total — and sends the traveller to the
 * provider. Refusals come back to the order page as `?retry=<reason>`.
 */
export async function retryPaymentAction(formData: FormData): Promise<never> {
  const locale = localeOf(formData.get('locale'))
  const orderNumber = text(formData, 'orderNumber')
  const back: (reason: string) => never = (reason) =>
    redirect(
      getPathname({
        href: { pathname: `${CONFIRMATION_HREF}/${orderNumber}`, query: { retry: reason } },
        locale,
      }),
    )

  if (!bookingsOpen()) back('closed')

  const [order] = await db
    .select({ id: orders.id, userId: orders.userId, guestTokenHash: orders.guestTokenHash })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1)
  const user = await getSessionUser()
  const viewer = { userId: user?.id ?? null, guestTokenHash: await readGuestTokenHash() }
  if (!order || !canViewOrder(order, viewer)) back('not_found')
  if (user && (await activeUserOrNull('checkout')) === null) back('not_found')

  let next: unknown
  try {
    const result = await retryOrderPayment({
      orderId: order.id,
      returnUrlFor: (key) => returnUrlFor(locale, key),
    })
    next = result.nextAction
  } catch (error) {
    if (error instanceof RetryError) back(error.code)
    if (error instanceof Error && error.name === 'BookingsClosedError') back('closed')
    if (error instanceof Error && error.name === 'PaymentProviderError') back('payment')
    console.error('[retryPaymentAction]', error)
    back('error')
  }
  followProvider(next, locale, orderNumber)
}

/**
 * Phase 4: put a discount code on the trip (or take it off). Only the code is
 * stored; the page re-prices the trip and says whether it applies. The price
 * the traveller then sees is the one checkout compares against.
 */
export async function applyCouponAction(formData: FormData): Promise<never> {
  const locale = localeOf(formData.get('locale'))
  const intent = text(formData, 'intent')
  const code = text(formData, 'code').trim()
  await setCartCouponCode(intent === 'remove' || code === '' ? null : code)
  redirect(getPathname({ href: CHECKOUT_HREF, locale }))
}
