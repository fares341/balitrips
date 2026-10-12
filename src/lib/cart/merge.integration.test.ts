import { randomBytes } from 'node:crypto'

import { asc, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { cartItems, carts } from '@/db/schema'
import { mergeAnonymousCart } from '@/lib/cart'
import {
  FIXTURE_PREFIX,
  createAnonymousCart,
  createCartForUser,
  createTestUser,
  deleteCart,
  deleteTestUser,
  testDay,
} from '@/test/integration/support'

/**
 * Cart merge on sign-in.
 *
 * The checkout gate signs people up *mid-flow*: they build a trip signed out,
 * press "complete booking", and are asked to create an account. If the merge
 * drops or duplicates a line, the cart is destroyed at exactly the moment it
 * is most valuable — and the traveller finds out by being charged for two
 * drivers, or by not being charged for the one they wanted.
 *
 * Everything worth checking here is relational: rows are *moved* rather than
 * re-inserted precisely so `parent_item_id` survives, and that is a statement
 * about primary keys that only a database can answer.
 */

const cleanup: (() => Promise<void>)[] = []

function onCleanup(task: () => Promise<void>): void {
  cleanup.unshift(task)
}

afterEach(async () => {
  const tasks = cleanup.splice(0, cleanup.length)
  for (const task of tasks) await task()
})

function anonToken(): string {
  return `${FIXTURE_PREFIX}${randomBytes(12).toString('base64url')}`
}

/** An activity with a linked driver add-on — two rows, one of them a child. */
async function addTripLines(cartId: string): Promise<{ parentId: string; childId: string }> {
  const [parent] = await db
    .insert(cartItems)
    .values({
      cartId,
      kind: 'activity',
      quantity: 2,
      travelDate: testDay(100),
      travelTime: '09:00',
      guests: 2,
      unitPriceMinor: 12_500,
    })
    .returning({ id: cartItems.id })
  if (!parent) throw new Error('Could not create the parent line')

  const [child] = await db
    .insert(cartItems)
    .values({
      cartId,
      kind: 'driver',
      quantity: 1,
      travelDate: testDay(100),
      endDate: testDay(100),
      guests: 2,
      vehicleClass: 'sedan',
      unitPriceMinor: 4_500,
      // The link that stops "remove the activity" leaving a driver charge
      // behind. It has to survive the merge untouched.
      parentItemId: parent.id,
    })
    .returning({ id: cartItems.id })
  if (!child) throw new Error('Could not create the child line')

  return { parentId: parent.id, childId: child.id }
}

async function readLines(cartId: string) {
  return db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(cartItems.createdAt), asc(cartItems.id))
}

async function cartExists(cartId: string): Promise<boolean> {
  const rows = await db.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).limit(1)
  return rows.length > 0
}

describe('a visitor who signs up mid-checkout', () => {
  it('adopts the anonymous cart wholesale when the account has none', async () => {
    const user = await createTestUser()
    onCleanup(() => deleteTestUser(user.id))

    const token = anonToken()
    const anonCartId = await createAnonymousCart(token)
    const { parentId, childId } = await addTripLines(anonCartId)

    const merged = await mergeAnonymousCart(token, user.id)

    expect(merged).not.toBeNull()
    expect(merged?.id).toBe(anonCartId)
    expect(merged?.userId).toBe(user.id)
    // The token is spent. `findCart` treats a token that names a cart with an
    // owner as absent, so leaving it set would let a stale cookie resolve to
    // somebody's account cart.
    expect(merged?.anonymousToken).toBeNull()

    const lines = await readLines(anonCartId)
    expect(lines.map((line) => line.id).sort()).toEqual([parentId, childId].sort())
    // Rows were moved, not copied: the child still points at the same parent.
    expect(lines.find((line) => line.id === childId)?.parentItemId).toBe(parentId)
  })

  it('folds the anonymous lines into an existing account cart without duplicating', async () => {
    const user = await createTestUser()
    onCleanup(() => deleteTestUser(user.id))

    // Something they added on their laptop, signed in, last week.
    const userCartId = await createCartForUser(user.id)
    const [existing] = await db
      .insert(cartItems)
      .values({
        cartId: userCartId,
        kind: 'itinerary',
        quantity: 1,
        unitPriceMinor: 5_900,
      })
      .returning({ id: cartItems.id })
    if (!existing) throw new Error('Could not create the existing line')

    const token = anonToken()
    const anonCartId = await createAnonymousCart(token)
    const { parentId, childId } = await addTripLines(anonCartId)

    const merged = await mergeAnonymousCart(token, user.id)

    expect(merged?.id).toBe(userCartId)

    const lines = await readLines(userCartId)
    // Three lines, each exactly once. Nothing lost, nothing doubled.
    expect(lines).toHaveLength(3)
    expect(lines.map((line) => line.id).sort()).toEqual([existing.id, parentId, childId].sort())
    expect(new Set(lines.map((line) => line.id)).size).toBe(3)

    // The add-on link survived a move between carts.
    expect(lines.find((line) => line.id === childId)?.parentItemId).toBe(parentId)
    expect(lines.find((line) => line.id === childId)?.cartId).toBe(userCartId)

    // The emptied anonymous cart is gone rather than left as a stray row that
    // a later token lookup could resurrect.
    expect(await cartExists(anonCartId)).toBe(false)
  })

  it('is safe to call twice — sign-in, sign-up and the cart page all call it', async () => {
    const user = await createTestUser()
    onCleanup(() => deleteTestUser(user.id))

    const userCartId = await createCartForUser(user.id)
    const token = anonToken()
    const anonCartId = await createAnonymousCart(token)
    const { parentId, childId } = await addTripLines(anonCartId)

    await mergeAnonymousCart(token, user.id)
    const afterFirst = await readLines(userCartId)

    // The token now names nothing. A second call must be a no-op, not a
    // second copy of the trip.
    const second = await mergeAnonymousCart(token, user.id)
    expect(second?.id).toBe(userCartId)

    const afterSecond = await readLines(userCartId)
    expect(afterSecond.map((line) => line.id).sort()).toEqual(
      afterFirst.map((line) => line.id).sort(),
    )
    expect(afterSecond).toHaveLength(2)
    expect(afterSecond.map((line) => line.id).sort()).toEqual([parentId, childId].sort())
  })

  it('returns the account cart untouched when there is nothing to merge', async () => {
    const user = await createTestUser()
    onCleanup(() => deleteTestUser(user.id))
    const userCartId = await createCartForUser(user.id)

    const merged = await mergeAnonymousCart(anonToken(), user.id)

    expect(merged?.id).toBe(userCartId)
    expect(await readLines(userCartId)).toHaveLength(0)
  })

  it('returns null when neither cart exists', async () => {
    const user = await createTestUser()
    onCleanup(() => deleteTestUser(user.id))

    expect(await mergeAnonymousCart(anonToken(), user.id)).toBeNull()
  })

  it('refuses to hand one visitor another visitor’s claimed cart', async () => {
    // A token that has already been merged into someone's account names a
    // cart with an owner. Presenting it again must not move that cart.
    const owner = await createTestUser()
    onCleanup(() => deleteTestUser(owner.id))
    const attacker = await createTestUser()
    onCleanup(() => deleteTestUser(attacker.id))

    const token = anonToken()
    const anonCartId = await createAnonymousCart(token)
    await addTripLines(anonCartId)
    await mergeAnonymousCart(token, owner.id)

    const stolen = await mergeAnonymousCart(token, attacker.id)

    expect(stolen).toBeNull()

    const [claimed] = await db
      .select({ userId: carts.userId })
      .from(carts)
      .where(eq(carts.id, anonCartId))
      .limit(1)
    expect(claimed?.userId).toBe(owner.id)
  })

  it('leaves an anonymous cart alone when no one has signed in', async () => {
    const token = anonToken()
    const anonCartId = await createAnonymousCart(token)
    onCleanup(() => deleteCart(anonCartId))
    await addTripLines(anonCartId)

    const [row] = await db
      .select({ userId: carts.userId, anonymousToken: carts.anonymousToken })
      .from(carts)
      .where(eq(carts.id, anonCartId))
      .limit(1)

    expect(row?.userId).toBeNull()
    expect(row?.anonymousToken).toBe(token)
    expect(await readLines(anonCartId)).toHaveLength(2)
  })
})
