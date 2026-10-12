/**
 * Fixtures and teardown for the integration suite.
 *
 * These tests run against the real, seeded development database rather than
 * a throwaway one, which buys honesty — the same rows, the same constraints,
 * the same driver — at the cost of one obligation: **every test must leave
 * the database exactly as it found it**. A suite that is only correct the
 * first time it runs is not a suite, and "re-seed it" is not an answer when
 * the seed takes longer than the tests do.
 *
 * So nothing here is clever. Fixtures are tagged, ids are collected, and
 * teardown deletes in foreign-key order. Where a row genuinely cannot be
 * created (a vehicle's fleet size, which the whole capacity test is about),
 * the original value is captured and restored.
 *
 * Not a test file itself — the suite's glob is `*.integration.test.ts`, so
 * this module is imported, never collected.
 */

import { randomUUID } from 'node:crypto'

import { and, eq, gte, inArray, like, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { db, schema } from '@/db'
import {
  activities,
  auditLog,
  cartItems,
  carts,
  driverCapacity,
  driverVehicles,
  entitlements,
  itineraries,
  orderItems,
  orders,
  payments,
  refunds,
  users,
  webhookEvents,
} from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'
import type { VehicleClass } from '@/lib/booking-rules'

// ---------------------------------------------------------------------------
// Naming — everything this suite creates is identifiable at a glance
// ---------------------------------------------------------------------------

/**
 * Prefix on every fixture's slug, email and webhook id.
 *
 * Makes an orphan left behind by a crashed run findable with one `LIKE`,
 * and makes it obvious in a database browser that a row is not real data.
 */
export const FIXTURE_PREFIX = 'itest'

export function fixtureId(): string {
  return `${FIXTURE_PREFIX}-${randomUUID()}`
}

/** Localized text for a fixture. All three locales, because the column is notNull. */
export function localizedFixture(text: string): Localized {
  return { en: text, ar: text, id: text }
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * A calendar date far enough out that it cannot collide with seed data, with
 * a real booking, or with `isPastInBali` — which would otherwise make every
 * assertion here expire quietly on some future morning.
 *
 * Plain `YYYY-MM-DD`, never a Date: a travel date is a calendar date in Bali,
 * not an instant.
 */
export function testDay(offset = 0): string {
  const day = new Date(Date.UTC(2099, 5, 1) + offset * 86_400_000)
  return day.toISOString().slice(0, 10)
}

/**
 * Postgres `date` columns come back as `YYYY-MM-DD` strings through Drizzle,
 * but a driver-level read (or a change of column mode) would hand back a
 * Date. Normalise, so an assertion compares dates rather than representations.
 */
export function asDay(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

// ---------------------------------------------------------------------------
// A second pool, for the concurrency test only
// ---------------------------------------------------------------------------

/**
 * The application pool is capped at 5 outside production, deliberately — the
 * server shares 4 GiB with Postgres and the worker. That cap is right for the
 * app and wrong for a test that has to prove N genuinely simultaneous
 * transactions cannot oversell one van: with five connections, callers six
 * and up would queue on the *pool* rather than on the *row lock*, and the
 * test would pass for the wrong reason.
 *
 * So the race gets its own pool. Same database, same statements, same
 * transactions — only the connection budget differs.
 */
export interface RacePool {
  db: ReturnType<typeof drizzle<typeof schema>>
  end(): Promise<void>
}

export function openRacePool(max: number): RacePool {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  const client = postgres(url, {
    max,
    idle_timeout: 5,
    connect_timeout: 10,
    // A caller that loses the race blocks on a row lock. Blocking is the
    // point; a statement timeout that fires would look like a pass.
    max_lifetime: 60,
  })

  return {
    db: drizzle(client, { schema }),
    end: () => client.end({ timeout: 5 }),
  }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export interface TestUser {
  id: string
  email: string
}

export async function createTestUser(role = 'customer'): Promise<TestUser> {
  const email = `${fixtureId()}@example.test`
  const [row] = await db
    .insert(users)
    .values({ email, name: 'Integration Fixture', role, locale: 'en' })
    .returning({ id: users.id, email: users.email })

  if (!row) throw new Error('Could not create the fixture user')
  return row
}

/**
 * Delete a fixture user and everything that points at it.
 *
 * `carts`, `entitlements`, `sessions` and `accounts` cascade; `orders`,
 * `refunds.actor_id` and `audit_log.actor_id` deliberately do not — an order
 * must survive the deletion of an account, and an audit row that vanished
 * with its actor would defeat the point of an audit trail. So they are
 * cleared here explicitly, deepest first.
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const owned = await db.select({ id: orders.id }).from(orders).where(eq(orders.userId, userId))
  for (const order of owned) await deleteTestOrder(order.id)

  await db.delete(auditLog).where(eq(auditLog.actorId, userId))
  await db.delete(refunds).where(eq(refunds.actorId, userId))
  await db.delete(entitlements).where(eq(entitlements.userId, userId))
  await db.delete(carts).where(eq(carts.userId, userId))
  await db.delete(users).where(eq(users.id, userId))
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * Delete an order and its dependents in foreign-key order.
 *
 * `order_items` cascades from `orders`, but `refunds.order_item_id`
 * references those items and does not — so refunds go first, or the cascade
 * trips over its own constraint.
 */
export async function deleteTestOrder(orderId: string): Promise<void> {
  const paid = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.orderId, orderId))
  const paymentIds = paid.map((row) => row.id)

  if (paymentIds.length > 0) {
    await db.delete(refunds).where(inArray(refunds.paymentId, paymentIds))
  }

  const items = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
  const itemIds = items.map((row) => row.id)
  if (itemIds.length > 0) {
    await db.delete(refunds).where(inArray(refunds.orderItemId, itemIds))
  }

  await db.delete(entitlements).where(eq(entitlements.grantedByOrderId, orderId))
  await db.delete(payments).where(eq(payments.orderId, orderId))
  await db.delete(auditLog).where(eq(auditLog.entityId, orderId))
  await db.delete(orders).where(eq(orders.id, orderId))
}

// ---------------------------------------------------------------------------
// Catalogue fixtures
// ---------------------------------------------------------------------------

export interface TestActivity {
  id: string
  slug: string
  priceMinor: number
  currency: string
  timeSlot: string
  name: Localized
}

/**
 * A published activity owned by this suite.
 *
 * Created rather than borrowed from the seed: the checkout tests need to
 * unpublish one and rename another, and doing that to a real catalogue row
 * would leave the development site subtly wrong if a run were interrupted.
 */
export async function createTestActivity(
  overrides: {
    priceMinor?: number
    status?: string
    timeSlots?: string[]
    maxGuests?: number
  } = {},
): Promise<TestActivity> {
  const slug = fixtureId()
  const name = localizedFixture(`Fixture activity ${slug.slice(-8)}`)
  const timeSlots = overrides.timeSlots ?? ['09:00']

  const [row] = await db
    .insert(activities)
    .values({
      slug,
      name,
      priceMinor: overrides.priceMinor ?? 12_500,
      currency: 'USD',
      timeSlots,
      leadTimeHours: 24,
      maxGuests: overrides.maxGuests ?? 10,
      status: overrides.status ?? 'published',
      publishedAt: new Date(),
    })
    .returning({ id: activities.id, priceMinor: activities.priceMinor })

  if (!row) throw new Error('Could not create the fixture activity')

  return {
    id: row.id,
    slug,
    priceMinor: row.priceMinor,
    currency: 'USD',
    timeSlot: timeSlots[0] ?? '09:00',
    name,
  }
}

export interface TestItinerary {
  id: string
  slug: string
  priceMinor: number
  currency: string
  version: number
  name: Localized
}

/** A published itinerary — the "plan" whose refund must revoke map access. */
export async function createTestItinerary(priceMinor = 5_900): Promise<TestItinerary> {
  const slug = fixtureId()
  const name = localizedFixture(`Fixture itinerary ${slug.slice(-8)}`)

  const [row] = await db
    .insert(itineraries)
    .values({
      slug,
      name,
      days: 5,
      priceMinor,
      currency: 'USD',
      version: 3,
      status: 'published',
      publishedAt: new Date(),
    })
    .returning({ id: itineraries.id, version: itineraries.version })

  if (!row) throw new Error('Could not create the fixture itinerary')
  return { id: row.id, slug, priceMinor, currency: 'USD', version: row.version, name }
}

export async function deleteTestActivity(id: string): Promise<void> {
  await db.delete(activities).where(eq(activities.id, id))
}

export async function deleteTestItinerary(id: string): Promise<void> {
  await db.delete(itineraries).where(eq(itineraries.id, id))
}

// ---------------------------------------------------------------------------
// Carts
// ---------------------------------------------------------------------------

export async function createCartForUser(userId: string): Promise<string> {
  const [row] = await db
    .insert(carts)
    .values({ userId, anonymousToken: null, currency: 'USD' })
    .returning({ id: carts.id })
  if (!row) throw new Error('Could not create the fixture cart')
  return row.id
}

export async function createAnonymousCart(token: string): Promise<string> {
  const [row] = await db
    .insert(carts)
    .values({ userId: null, anonymousToken: token, currency: 'USD' })
    .returning({ id: carts.id })
  if (!row) throw new Error('Could not create the fixture cart')
  return row.id
}

export async function deleteCart(cartId: string): Promise<void> {
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId))
  await db.delete(carts).where(eq(carts.id, cartId))
}

// ---------------------------------------------------------------------------
// Driver capacity
// ---------------------------------------------------------------------------

/**
 * Read a vehicle's fleet size so a test can put it back.
 *
 * The capacity race works by squeezing the fleet down to one; leaving it
 * there would silently break every later booking in development.
 */
export async function readFleetSize(vehicleClass: VehicleClass): Promise<number> {
  const [row] = await db
    .select({ fleetSize: driverVehicles.fleetSize })
    .from(driverVehicles)
    .where(eq(driverVehicles.vehicleClass, vehicleClass))
    .limit(1)
  if (!row) throw new Error(`No such vehicle class "${vehicleClass}"`)
  return row.fleetSize
}

export async function setFleetSize(vehicleClass: VehicleClass, fleetSize: number): Promise<void> {
  await db
    .update(driverVehicles)
    .set({ fleetSize })
    .where(eq(driverVehicles.vehicleClass, vehicleClass))
}

export async function clearCapacity(vehicleClass: VehicleClass, days: string[]): Promise<void> {
  if (days.length === 0) return
  await db
    .delete(driverCapacity)
    .where(and(eq(driverCapacity.vehicleClass, vehicleClass), inArray(driverCapacity.day, days)))
}

export async function readBookedCount(
  vehicleClass: VehicleClass,
  day: string,
): Promise<number | null> {
  const [row] = await db
    .select({ bookedCount: driverCapacity.bookedCount })
    .from(driverCapacity)
    .where(and(eq(driverCapacity.vehicleClass, vehicleClass), eq(driverCapacity.day, day)))
    .limit(1)
  return row?.bookedCount ?? null
}

// ---------------------------------------------------------------------------
// Webhook events
// ---------------------------------------------------------------------------

export async function countWebhookEvents(providerEventId: string): Promise<number> {
  const rows = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(eq(webhookEvents.providerEventId, providerEventId))
  return rows.length
}

/** Remove every webhook row this suite wrote. Ids all carry the prefix. */
export async function deleteFixtureWebhookEvents(): Promise<void> {
  await db.delete(webhookEvents).where(like(webhookEvents.providerEventId, `${FIXTURE_PREFIX}-%`))
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

/** Order-number prefix used by fixtures written straight to the table. */
export const FIXTURE_ORDER_PREFIX = 'BT-IT-'

/**
 * Delete anything this suite has ever left behind.
 *
 * Per-test teardown is the primary mechanism; this is the backstop for the
 * case it cannot cover — a run killed by Ctrl-C, a crashed worker, an
 * assertion that fails before its cleanup is registered. Without it, one
 * interrupted run makes every later run start from a different database, and
 * "it passed yesterday" stops meaning anything.
 *
 * Matches only on the fixture prefix and on dates in 2099, so it cannot touch
 * real content. Run once before the suite, from the global setup.
 */
export async function sweepFixtures(): Promise<number> {
  let removed = 0

  await db.delete(webhookEvents).where(like(webhookEvents.providerEventId, `${FIXTURE_PREFIX}-%`))

  const strays = await db
    .select({ id: orders.id })
    .from(orders)
    .where(like(orders.orderNumber, `${FIXTURE_ORDER_PREFIX}%`))
  for (const order of strays) {
    await deleteTestOrder(order.id)
    removed += 1
  }

  const strayUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `${FIXTURE_PREFIX}-%@example.test`))
  for (const user of strayUsers) {
    await deleteTestUser(user.id)
    removed += 1
  }

  await db.delete(activities).where(like(activities.slug, `${FIXTURE_PREFIX}-%`))
  await db.delete(itineraries).where(like(itineraries.slug, `${FIXTURE_PREFIX}-%`))

  const strayCarts = await db
    .select({ id: carts.id })
    .from(carts)
    .where(like(carts.anonymousToken, `${FIXTURE_PREFIX}%`))
  for (const cart of strayCarts) {
    await deleteCart(cart.id)
    removed += 1
  }

  // Every capacity day this suite books is in 2099.
  await db
    .delete(driverCapacity)
    .where(or(gte(driverCapacity.day, '2099-01-01'), eq(driverCapacity.vehicleClass, 'limousine')))

  return removed
}

/**
 * Close the application pool.
 *
 * Only the global setup calls this. Tests must not: the pool is a
 * module-level singleton shared by every file in the run, and this suite runs
 * single-fork, so the first file to close it would break the rest. Vitest
 * tears the worker down when the run ends, which takes those sockets with it.
 * The global setup runs in a different process, which has its own pool and no
 * one to hand it to.
 */
export async function closeAppPool(): Promise<void> {
  const client = (
    db as unknown as { $client?: { end?: (options?: { timeout?: number }) => Promise<void> } }
  ).$client
  await client?.end?.({ timeout: 5 })
}
