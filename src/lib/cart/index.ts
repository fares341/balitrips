/**
 * The server-owned cart.
 *
 * The prototype kept the cart in React state, carried a `price` on every item
 * and summed it in the browser — which means anyone could have booked a $500
 * package for $1, and closing the tab threw the trip away. This is that cart
 * moved to Postgres, with three rules that hold without exception:
 *
 *  1. **The client sends WHAT, never HOW MUCH.** Ids, quantities and dates
 *     come from the browser; every amount is recomputed here by `buildQuote`
 *     from catalogue rows. `cart_items.unit_price_minor` is a display
 *     snapshot and is never summed into a total.
 *  2. **Every mutation is scoped to the caller's own cart.** An item id alone
 *     is never enough — the row must belong to the cart resolved from the
 *     session or the anonymous cookie, or the call is a no-op.
 *  3. **A driver sold alongside an activity is linked to it.** The handoff
 *     created two unrelated lines, so removing the activity left a driver
 *     charge with nothing to drive to. `parentItemId` makes that impossible:
 *     removing a parent removes its add-ons in the same statement.
 *
 * ## Merging
 *
 * `mergeAnonymousCart` is the single most important function in this file.
 * The checkout gate signs people up *mid-flow*: they build a trip signed out,
 * press "complete booking", and are asked to create an account. Without the
 * merge, the cart is destroyed at exactly the moment it is most valuable.
 * Call it from the sign-in and sign-up handlers; `mergeAnonymousCartOnSignIn`
 * reads the cookie for you.
 *
 * ## The badge
 *
 * Every mutation rewrites `CART_COUNT_COOKIE` so the header badge updates
 * without any route having to call `cookies()` — which would opt the whole
 * site out of static rendering for a number that is decorative until someone
 * opens the cart. Client callers should dispatch `CART_CHANGED_EVENT` on
 * `window` afterwards so the badge re-reads it without a reload.
 *
 * Server-only. Nothing here may be imported into a Client Component.
 */

import { randomBytes } from 'node:crypto'

import { and, asc, eq, isNull, or, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'

import { db } from '@/db'
import { cartItems, carts } from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'
import { CART_CHANGED_EVENT, CART_COUNT_COOKIE } from '@/components/layout/routes'
import { vehicleForPassengers, type VehicleClass } from '@/lib/booking-rules'
import { assertBookingsOpen } from '@/lib/bookings-open'
import { loadEntitlements } from '@/lib/entitlements'
import {
  buildQuote,
  type CartItemKind,
  type QuoteIssue,
  type QuoteRequestItem,
} from '@/lib/pricing/quote'

import { displayKey, loadCartCatalog, snapshotUnitPrice } from './catalog'
import { getSessionUser } from './session'

export { CART_CHANGED_EVENT, CART_COUNT_COOKIE }
export { getSessionUser, type CartSessionUser } from './session'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Anonymous cart token.
 *
 * httpOnly, unlike the count cookie: this one *identifies* a cart, so a script
 * that could read it could read someone's trip. The count is a display hint
 * and is deliberately readable.
 */
export const CART_TOKEN_COOKIE = 'bt_cart_token'

/**
 * Where to come back to after signing in mid-checkout.
 *
 * The handoff dropped you back on the cart page with no pending-intent state,
 * so you had to press "complete booking" a second time. This survives the
 * round trip through whatever auth screen the visitor is sent to.
 */
export const PENDING_CHECKOUT_COOKIE = 'bt_checkout_next'

/** 60 days. Long enough that a trip planned over several sessions survives. */
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 60

/**
 * Absolute ceiling on a line quantity.
 *
 * Per-item limits come from the catalogue (`activities.max_guests`) and are
 * lower in practice; this is the backstop for a kind that declares none.
 */
export const CART_MAX_QUANTITY = 30

/** Currency a brand-new, still-empty cart is created in. */
const DEFAULT_CURRENCY = process.env.NEXT_PUBLIC_DEFAULT_CURRENCY ?? 'USD'

/** Group order on the cart page, matching the handoff's `groups` array. */
export const CART_KIND_ORDER: readonly CartItemKind[] = [
  'activity',
  'driver',
  'itinerary',
  'package',
  'plan',
  'place',
]

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

/**
 * Write a cookie, tolerating a read-only store.
 *
 * `cookies()` is writable in Server Actions and Route Handlers and read-only
 * while a Server Component renders. Both call into this module, and a render
 * that merely *reads* a cart must not crash because it also tried to refresh
 * a display hint.
 */
async function setCookieIfWritable(
  name: string,
  value: string,
  options: { httpOnly: boolean; maxAge?: number },
): Promise<void> {
  try {
    const store = await cookies()
    store.set(name, value, {
      path: '/',
      sameSite: 'lax',
      httpOnly: options.httpOnly,
      secure: process.env.NODE_ENV === 'production',
      maxAge: options.maxAge ?? CART_COOKIE_MAX_AGE,
    })
  } catch {
    // Read-only cookie store: nothing to do. The authoritative cart is in
    // Postgres; the cookie is a hint and will be rewritten by the next
    // mutation, which always runs in an action or a route handler.
  }
}

async function deleteCookieIfWritable(name: string): Promise<void> {
  try {
    const store = await cookies()
    store.delete(name)
  } catch {
    // See above.
  }
}

async function readAnonymousToken(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(CART_TOKEN_COOKIE)?.value
  return value === undefined || value === '' ? null : value
}

/** Refresh the header badge's cookie. Called after every mutation. */
async function writeCartCount(cartId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cartItems)
    .where(eq(cartItems.cartId, cartId))

  const count = rows[0]?.count ?? 0
  await setCookieIfWritable(CART_COUNT_COOKIE, String(count), { httpOnly: false })
  return count
}

/** Remember where to return after an interstitial sign-in. */
export async function setPendingCheckout(path: string): Promise<void> {
  // 30 minutes: long enough to create an account and verify an email, short
  // enough that it cannot resurrect an intent from last week.
  await setCookieIfWritable(PENDING_CHECKOUT_COOKIE, path, { httpOnly: true, maxAge: 60 * 30 })
}

/** Read and consume the pending checkout intent. */
export async function takePendingCheckout(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(PENDING_CHECKOUT_COOKIE)?.value ?? null
  if (value !== null) await deleteCookieIfWritable(PENDING_CHECKOUT_COOKIE)
  // Only ever an internal path — never send a visitor somewhere a cookie told
  // us to if it does not look like one of our own routes.
  return value !== null && value.startsWith('/') && !value.startsWith('//') ? value : null
}

// ---------------------------------------------------------------------------
// Resolving a cart
// ---------------------------------------------------------------------------

export interface CartRef {
  id: string
  userId: string | null
  anonymousToken: string | null
  currency: string
}

async function selectCartByUser(userId: string): Promise<CartRef | null> {
  const rows = await db
    .select({
      id: carts.id,
      userId: carts.userId,
      anonymousToken: carts.anonymousToken,
      currency: carts.currency,
    })
    .from(carts)
    .where(eq(carts.userId, userId))
    .orderBy(asc(carts.createdAt))
    .limit(1)
  return rows[0] ?? null
}

async function selectCartByToken(token: string): Promise<CartRef | null> {
  const rows = await db
    .select({
      id: carts.id,
      userId: carts.userId,
      anonymousToken: carts.anonymousToken,
      currency: carts.currency,
    })
    .from(carts)
    .where(eq(carts.anonymousToken, token))
    .limit(1)
  return rows[0] ?? null
}

/**
 * The caller's cart, without creating one.
 *
 * Rendering the cart page must not have the side effect of inserting a row
 * for every crawler that hits `/cart`.
 */
export async function findCart(): Promise<CartRef | null> {
  const user = await getSessionUser()

  if (user) {
    /*
     * Someone who signed in mid-flow is holding both: a session and a cart
     * token from before they had one. Merging on *read* — not just on the
     * next mutation — means the trip is already theirs the first time the
     * cart or checkout page renders after sign-in, which is the whole point
     * of the exercise. It is idempotent, and skipped entirely when there is
     * nothing to merge.
     */
    const token = await readAnonymousToken()
    if (token !== null) {
      const anon = await selectCartByToken(token)
      if (anon !== null && anon.userId === null) {
        const merged = await mergeAnonymousCart(token, user.id)
        if (merged) return merged
      }
    }
    return selectCartByUser(user.id)
  }

  const token = await readAnonymousToken()
  if (token === null) return null

  const anon = await selectCartByToken(token)
  // A token whose cart was merged into a user account no longer owns
  // anything; treat it as absent rather than handing back someone's cart.
  return anon !== null && anon.userId === null ? anon : null
}

/**
 * The caller's cart, creating one if needed.
 *
 * A signed-in visitor gets their user cart; everyone else gets the cart their
 * `bt_cart_token` cookie names, and a fresh token when they have none.
 */
export async function getOrCreateCart(): Promise<CartRef> {
  // findCart already folds in an anonymous trip when the caller has just
  // signed in, so there is only the genuinely-new case left to handle.
  const existing = await findCart()
  if (existing) return existing

  const user = await getSessionUser()
  if (user) return insertCart(user.id, null)

  const token = randomBytes(24).toString('base64url')
  const created = await insertCart(null, token)
  await setCookieIfWritable(CART_TOKEN_COOKIE, token, { httpOnly: true })
  return created
}

async function insertCart(userId: string | null, anonymousToken: string | null): Promise<CartRef> {
  const rows = await db
    .insert(carts)
    .values({ userId, anonymousToken, currency: DEFAULT_CURRENCY })
    .returning({
      id: carts.id,
      userId: carts.userId,
      anonymousToken: carts.anonymousToken,
      currency: carts.currency,
    })

  const row = rows[0]
  if (!row) throw new Error('Failed to create a cart')
  return row
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

/**
 * Fold an anonymous cart into a user's, on sign-in.
 *
 * Rows are *moved*, keeping their primary keys, so `parentItemId` links
 * survive the move untouched — re-inserting copies would have to rewrite
 * every link and would silently orphan any it missed.
 *
 * Safe to call more than once and safe to call when there is nothing to
 * merge, because sign-in, sign-up and the checkout page all call it.
 */
export async function mergeAnonymousCart(
  anonToken: string,
  userId: string,
): Promise<CartRef | null> {
  const surviving = await db.transaction(async (tx) => {
    const anonRows = await tx
      .select({ id: carts.id, userId: carts.userId, currency: carts.currency })
      .from(carts)
      .where(and(eq(carts.anonymousToken, anonToken), isNull(carts.userId)))
      .for('update')
      .limit(1)

    const anon = anonRows[0]

    const userRows = await tx
      .select({
        id: carts.id,
        userId: carts.userId,
        anonymousToken: carts.anonymousToken,
        currency: carts.currency,
      })
      .from(carts)
      .where(eq(carts.userId, userId))
      .orderBy(asc(carts.createdAt))
      .limit(1)

    const owned = userRows[0] ?? null

    if (!anon) return owned

    if (!owned) {
      // Nothing to merge into: adopt the anonymous cart wholesale. The token
      // is cleared so the cookie cannot resolve to it again.
      const claimed = await tx
        .update(carts)
        .set({ userId, anonymousToken: null })
        .where(eq(carts.id, anon.id))
        .returning({
          id: carts.id,
          userId: carts.userId,
          anonymousToken: carts.anonymousToken,
          currency: carts.currency,
        })
      return claimed[0] ?? null
    }

    if (owned.id === anon.id) return owned

    await tx.update(cartItems).set({ cartId: owned.id }).where(eq(cartItems.cartId, anon.id))
    await tx.delete(carts).where(eq(carts.id, anon.id))
    return owned
  })

  // The token is spent either way — it now names either nothing or a cart
  // that belongs to a user.
  await deleteCookieIfWritable(CART_TOKEN_COOKIE)
  if (surviving) await writeCartCount(surviving.id)

  return surviving
}

/** `mergeAnonymousCart`, reading the token from the request's cookies. */
export async function mergeAnonymousCartOnSignIn(userId: string): Promise<CartRef | null> {
  const token = await readAnonymousToken()
  if (token === null) return null
  return mergeAnonymousCart(token, userId)
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** A driver add-on sold alongside an activity, linked to it by `parentItemId`. */
export interface DriverAddOn {
  /** Passengers. Decides the vehicle class; never sent from the client. */
  guests?: number | null
  /** Last day of the hire. Defaults to the activity's own date. */
  endDate?: string | null
}

export interface AddItemInput {
  kind: CartItemKind
  refId?: string | null
  quantity?: number
  travelDate?: string | null
  travelTime?: string | null
  guests?: number | null
  endDate?: string | null
  /** Only meaningful for `kind: 'driver'`; otherwise derived from `guests`. */
  vehicleClass?: string | null
  /**
   * Add a linked driver line in the same call.
   *
   * This is the *only* supported way to sell a driver with an activity. The
   * handoff pushed two independent items, so removing the activity left the
   * driver behind.
   */
  driver?: DriverAddOn | null
}

export interface MutationResult {
  cartId: string
  itemCount: number
}

export interface AddItemResult extends MutationResult {
  itemId: string
  driverItemId: string | null
}

function clampQuantity(value: number | undefined, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return 1
  return Math.min(max, Math.max(1, Math.trunc(value)))
}

function normalise(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value
}

type CartItemRow = typeof cartItems.$inferSelect

/**
 * Two lines are the same line when everything that identifies the *booking*
 * matches. A second click on "add to trip" for the same activity on the same
 * date should raise the quantity, not stack a duplicate row the traveller
 * then has to remove twice.
 */
function sameBooking(row: CartItemRow, input: AddItemInput): boolean {
  return (
    row.kind === input.kind &&
    row.refId === normalise(input.refId) &&
    row.travelDate === normalise(input.travelDate) &&
    row.travelTime === normalise(input.travelTime) &&
    row.endDate === normalise(input.endDate) &&
    row.parentItemId === null
  )
}

export async function addItem(input: AddItemInput): Promise<AddItemResult> {
  // One guard covers addToCartAction, addFavoriteToTripAction and
  // createTripFromFavoritesAction: the latter two import addItem directly and
  // never pass through cart/actions.ts. Above getOrCreateCart() so a closed
  // site does not mint an empty cart row per refused attempt.
  assertBookingsOpen('addItem')

  const cart = await getOrCreateCart()
  const rows = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id))

  const refId = normalise(input.refId)
  const price = await snapshotUnitPrice(input.kind, refId, normalise(input.vehicleClass))

  // Itineraries and saved places are bought once; quantity is meaningless.
  const singular = input.kind === 'itinerary' || input.kind === 'place' || input.kind === 'plan'
  const requested = singular ? 1 : clampQuantity(input.quantity, CART_MAX_QUANTITY)

  const existing = rows.find((row) => sameBooking(row, input))

  let itemId: string
  if (existing) {
    const next = singular ? 1 : clampQuantity(existing.quantity + requested, CART_MAX_QUANTITY)
    await db
      .update(cartItems)
      .set({
        quantity: next,
        // For an activity, quantity *is* the guest count — `buildQuote`
        // validates it against `activities.max_guests`. Keeping the two in
        // step means the order snapshot cannot disagree with what was paid.
        guests: input.kind === 'activity' ? next : (input.guests ?? existing.guests),
        unitPriceMinor: price.priceMinor,
      })
      .where(eq(cartItems.id, existing.id))
    itemId = existing.id
  } else {
    const inserted = await db
      .insert(cartItems)
      .values({
        cartId: cart.id,
        kind: input.kind,
        refId,
        quantity: requested,
        travelDate: normalise(input.travelDate),
        travelTime: normalise(input.travelTime),
        guests: input.kind === 'activity' ? requested : (input.guests ?? null),
        vehicleClass:
          input.kind === 'driver'
            ? (normalise(input.vehicleClass) ?? vehicleForPassengers(input.guests ?? 1))
            : null,
        endDate: normalise(input.endDate),
        unitPriceMinor: price.priceMinor,
        parentItemId: null,
      })
      .returning({ id: cartItems.id })

    const row = inserted[0]
    if (!row) throw new Error('Failed to add the item to the cart')
    itemId = row.id
  }

  let driverItemId: string | null = null
  if (input.driver) {
    driverItemId = await attachDriver(cart.id, itemId, input, input.driver, rows)
  }

  // An empty cart has no currency of its own yet; adopt the first priced
  // item's so the summary and the quote agree from the first line onwards.
  if (price.currency !== null && rows.length === 0) {
    await db.update(carts).set({ currency: price.currency }).where(eq(carts.id, cart.id))
  }

  const itemCount = await writeCartCount(cart.id)
  return { cartId: cart.id, itemId, driverItemId, itemCount }
}

/**
 * Insert the driver line that belongs to `parentId`.
 *
 * `parentItemId` is the whole point: `removeItem` deletes children with the
 * parent, so removing the activity can never orphan the driver charge.
 */
async function attachDriver(
  cartId: string,
  parentId: string,
  input: AddItemInput,
  driver: DriverAddOn,
  existingRows: readonly CartItemRow[],
): Promise<string | null> {
  // Asking twice must not sell two cars.
  const already = existingRows.find((row) => row.kind === 'driver' && row.parentItemId === parentId)
  if (already) return already.id

  const guests = driver.guests ?? input.guests ?? input.quantity ?? 1
  const vehicleClass: VehicleClass = vehicleForPassengers(guests)
  const price = await snapshotUnitPrice('driver', null, vehicleClass)
  const travelDate = normalise(input.travelDate)

  const inserted = await db
    .insert(cartItems)
    .values({
      cartId,
      kind: 'driver',
      refId: null,
      quantity: 1,
      travelDate,
      travelTime: null,
      guests,
      vehicleClass,
      // Days are derived by `buildQuote` from the range, never sent by the
      // client — the handoff hardcoded `days: 1` here regardless of dates.
      endDate: normalise(driver.endDate) ?? travelDate,
      unitPriceMinor: price.priceMinor,
      parentItemId: parentId,
    })
    .returning({ id: cartItems.id })

  return inserted[0]?.id ?? null
}

/**
 * Change a line's quantity.
 *
 * Clamped against the catalogue's own maximum, not just a constant: a boat
 * that holds twelve refuses thirteen here as well as in `buildQuote`.
 */
export async function updateQuantity(itemId: string, quantity: number): Promise<MutationResult> {
  const cart = await findCart()
  if (!cart) return { cartId: '', itemCount: 0 }

  const rows = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)))
    .limit(1)

  const row = rows[0]
  // Not ours, or gone. Never trust an item id on its own.
  if (!row) return { cartId: cart.id, itemCount: await writeCartCount(cart.id) }

  if (quantity < 1) return removeItem(itemId)

  const max = await maxQuantityFor(row)
  const next = clampQuantity(quantity, max)

  await db
    .update(cartItems)
    .set({ quantity: next, guests: row.kind === 'activity' ? next : row.guests })
    .where(eq(cartItems.id, row.id))

  return { cartId: cart.id, itemCount: await writeCartCount(cart.id) }
}

async function maxQuantityFor(row: CartItemRow): Promise<number> {
  if (row.kind === 'itinerary' || row.kind === 'place' || row.kind === 'plan') return 1
  if (row.kind !== 'activity' && row.kind !== 'package') return CART_MAX_QUANTITY

  const item: QuoteRequestItem = {
    id: row.id,
    kind: row.kind as CartItemKind,
    refId: row.refId,
    quantity: row.quantity,
    travelDate: row.travelDate,
    travelTime: row.travelTime,
    guests: row.guests,
    endDate: row.endDate,
    parentItemId: row.parentItemId,
  }
  const { display } = await loadCartCatalog([item], await loadEntitlements(null))
  const max = display.get(displayKey(row.kind, row.refId))?.maxQuantity
  return max ?? CART_MAX_QUANTITY
}

/**
 * Remove a line and anything attached to it.
 *
 * The cascade is the fix for the handoff's orphaned driver: two unlinked
 * lines meant "remove the activity" left a car booked for a trip that no
 * longer existed, and the traveller was charged for it.
 */
export async function removeItem(itemId: string): Promise<MutationResult> {
  const cart = await findCart()
  if (!cart) return { cartId: '', itemCount: 0 }

  await db.delete(cartItems).where(
    and(
      // Scoped to the caller's own cart: the parent clause below would
      // otherwise let an item id from anywhere delete rows.
      eq(cartItems.cartId, cart.id),
      or(eq(cartItems.id, itemId), eq(cartItems.parentItemId, itemId)),
    ),
  )

  return { cartId: cart.id, itemCount: await writeCartCount(cart.id) }
}

export async function clearCart(): Promise<MutationResult> {
  const cart = await findCart()
  if (!cart) return { cartId: '', itemCount: 0 }

  await db.delete(cartItems).where(eq(cartItems.cartId, cart.id))
  return { cartId: cart.id, itemCount: await writeCartCount(cart.id) }
}

/**
 * Empty a user's cart from outside a request they made — the payment webhook.
 *
 * Deliberately does NOT run at order creation. A declined card would then
 * leave the traveller with a failed order and an empty trip and nothing to
 * retry; the cart is only spent once money has actually arrived. There are no
 * cookies to update here, because the caller is the payment provider, not the
 * customer's browser — the confirmation page resets the badge on the client.
 */
export async function clearCartForUser(userId: string): Promise<void> {
  const owned = await selectCartByUser(userId)
  if (!owned) return
  await db.delete(cartItems).where(eq(cartItems.cartId, owned.id))
}

// ---------------------------------------------------------------------------
// Reading, priced
// ---------------------------------------------------------------------------

export interface CartLineView {
  id: string
  kind: CartItemKind
  refId: string | null
  /** What the row stores. For an activity this is also the guest count. */
  quantity: number
  travelDate: string | null
  travelTime: string | null
  guests: number | null
  endDate: string | null
  vehicleClass: string | null
  /** Set on a driver sold alongside an activity. */
  parentItemId: string | null

  name: Localized | null
  imageUrl: string | null
  imageAlt: Localized | null
  href: string | null
  /** Upper bound for the stepper. Null means the line has no stepper. */
  maxQuantity: number | null

  /**
   * Null when the line could not be priced — withdrawn from sale, date now in
   * the past, lead time missed. Distinct from a genuine zero.
   */
  unitPriceMinor: number | null
  lineTotalMinor: number | null
  currency: string | null
  /** What was actually charged for: guests for an activity, days for a driver. */
  pricedQuantity: number | null
  /** Why the line could not be priced. */
  issue: QuoteIssue | null
}

export interface CartGroupView {
  kind: CartItemKind
  lines: CartLineView[]
  /**
   * Sum of the *priced* lines. Always a number, including a genuine zero — a
   * free group and an unpriced one are different facts and the page says so.
   * The handoff rendered `sub ? "$" + sub : "—"`, which conflated them.
   */
  subtotalMinor: number
  /** How many lines in this group could not be priced. */
  unpricedCount: number
  currency: string
}

export interface CartView {
  cartId: string
  itemCount: number
  groups: CartGroupView[]
  subtotalMinor: number
  totalMinor: number
  currency: string
  /** False when anything in the cart cannot be booked. Never charge on false. */
  ok: boolean
  issues: QuoteIssue[]
}

/**
 * The cart, priced by the same `buildQuote` checkout uses.
 *
 * Returns null when there is no cart at all, so the page can render its empty
 * state without a row being inserted for every visitor who looks.
 */
export async function getCartWithTotals(): Promise<CartView | null> {
  const cart = await findCart()
  if (!cart) return null

  const rows = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id))
    .orderBy(asc(cartItems.createdAt), asc(cartItems.id))

  const requestItems: QuoteRequestItem[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind as CartItemKind,
    refId: row.refId,
    quantity: row.quantity,
    travelDate: row.travelDate,
    travelTime: row.travelTime,
    guests: row.guests,
    endDate: row.endDate,
    parentItemId: row.parentItemId,
  }))

  const held = await loadEntitlements(cart.userId)
  const { snapshot, display } = await loadCartCatalog(requestItems, held)
  const quote = buildQuote(requestItems, snapshot)

  const lineById = new Map(quote.lines.map((line) => [line.itemId, line]))
  const issueById = new Map<string, QuoteIssue>()
  for (const issue of quote.issues) {
    if (issue.itemId !== '*' && !issueById.has(issue.itemId)) issueById.set(issue.itemId, issue)
  }

  const views: CartLineView[] = rows.map((row) => {
    const kind = row.kind as CartItemKind
    const line = lineById.get(row.id) ?? null
    // A driver's display key is its vehicle class; the priced line knows the
    // class the passenger count implies, which may differ from the snapshot.
    const ref = kind === 'driver' ? (line?.vehicleClass ?? row.vehicleClass) : row.refId
    const info = display.get(displayKey(kind, ref))

    return {
      id: row.id,
      kind,
      refId: row.refId,
      quantity: row.quantity,
      travelDate: row.travelDate,
      travelTime: row.travelTime,
      guests: row.guests,
      endDate: row.endDate,
      vehicleClass: line?.vehicleClass ?? row.vehicleClass,
      parentItemId: row.parentItemId,

      name: info?.name ?? null,
      imageUrl: info?.imageUrl ?? null,
      imageAlt: info?.imageAlt ?? null,
      href: info?.href ?? null,
      maxQuantity: kind === 'activity' ? (info?.maxQuantity ?? CART_MAX_QUANTITY) : null,

      unitPriceMinor: line?.unitPriceMinor ?? null,
      lineTotalMinor: line?.lineTotalMinor ?? null,
      currency: line?.currency ?? null,
      pricedQuantity: line?.quantity ?? null,
      issue: issueById.get(row.id) ?? null,
    }
  })

  /**
   * An empty cart has no lines for `buildQuote` to infer a currency from, and
   * it falls back to USD. The cart's own column is the honest answer there —
   * showing a zero total in the wrong currency is a small lie that becomes a
   * large one the moment a price is added.
   */
  const cartCurrency = rows.length === 0 ? cart.currency : quote.currency

  const groups: CartGroupView[] = []
  for (const kind of CART_KIND_ORDER) {
    const lines = views.filter((view) => view.kind === kind)
    if (lines.length === 0) continue

    let subtotalMinor = 0
    let unpricedCount = 0
    let currency: string | null = null
    for (const line of lines) {
      if (line.lineTotalMinor === null) unpricedCount += 1
      else {
        subtotalMinor += line.lineTotalMinor
        currency ??= line.currency
      }
    }

    groups.push({
      kind,
      lines,
      subtotalMinor,
      unpricedCount,
      currency: currency ?? cartCurrency,
    })
  }

  return {
    cartId: cart.id,
    itemCount: rows.length,
    groups,
    subtotalMinor: quote.subtotalMinor,
    totalMinor: quote.totalMinor,
    currency: cartCurrency,
    ok: rows.length > 0 && quote.ok,
    issues: quote.issues,
  }
}
