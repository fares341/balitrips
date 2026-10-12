import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/db'
import { driverCapacity } from '@/db/schema'
import {
  CapacityError,
  releaseDriverCapacity,
  reserveDriverCapacity,
} from '@/lib/availability/capacity'
import type { VehicleClass } from '@/lib/booking-rules'
import {
  clearCapacity,
  openRacePool,
  readBookedCount,
  readFleetSize,
  setFleetSize,
  testDay,
  type RacePool,
} from '@/test/integration/support'

/**
 * The capacity race.
 *
 * This is the test the rest of the suite exists to make possible. Every other
 * failure mode here is recoverable: a wrong total is refunded, a bad snapshot
 * is corrected, a missed webhook is replayed. Overselling the last van is
 * not — a second customer is standing at a hotel in Seminyak with a paid
 * confirmation for a vehicle that is two hours away with someone else in it,
 * and no amount of code fixes that afternoon.
 *
 * A unit test cannot prove this. The bug it guards against — read the count,
 * decide, then write — only exists *between* two transactions, and a mocked
 * database has no between. Only real Postgres, real row locks and real
 * concurrency can tell the difference between "the check works" and "the
 * check works when two people run it at the same millisecond".
 *
 * The pool is deliberately larger than the application's (see
 * `openRacePool`): with five connections and eight callers, three of them
 * would queue on the pool rather than on the row lock, and the test would
 * pass without ever having raced.
 */

const VEHICLE: VehicleClass = 'van'

/** How many simultaneous checkouts fight over one vehicle. */
const CONTENDERS = 8

/** Every day this file touches, so teardown is exhaustive. */
const ALL_DAYS = Array.from({ length: 40 }, (_, index) => testDay(index))

let originalFleetSize = 0
let pool: RacePool

/** Reserve the range in its own transaction, exactly as checkout does. */
function attemptReservation(
  raceDb: RacePool['db'],
  startDate: string,
  endDate: string,
): Promise<'reserved'> {
  return raceDb.transaction(async (tx) => {
    await reserveDriverCapacity(tx, VEHICLE, startDate, endDate)
    return 'reserved' as const
  })
}

beforeAll(async () => {
  originalFleetSize = await readFleetSize(VEHICLE)
  pool = openRacePool(CONTENDERS + 4)
})

afterAll(async () => {
  // The fleet is shared, seeded data. Leaving it at 1 would quietly break
  // every later booking in development.
  await setFleetSize(VEHICLE, originalFleetSize)
  await clearCapacity(VEHICLE, ALL_DAYS)
  await pool.end()
})

beforeEach(async () => {
  await clearCapacity(VEHICLE, ALL_DAYS)
})

describe('reserveDriverCapacity under real concurrency', () => {
  it('sells the last van exactly once when N checkouts race for it', async () => {
    const day = testDay(0)
    await setFleetSize(VEHICLE, 1)

    // Fired without awaiting in between: all N are in flight before any of
    // them commits, which is the whole point.
    const results = await Promise.allSettled(
      Array.from({ length: CONTENDERS }, () => attemptReservation(pool.db, day, day)),
    )

    const winners = results.filter((result) => result.status === 'fulfilled')
    const losers = results.filter((result) => result.status === 'rejected')

    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(CONTENDERS - 1)

    for (const loser of losers) {
      // A losing caller must fail with the domain error, not a constraint
      // violation or a deadlock — checkout maps CapacityError onto "that
      // date just went", and anything else surfaces as a 500.
      expect(loser.reason).toBeInstanceOf(CapacityError)
      expect((loser.reason as CapacityError).vehicleClass).toBe(VEHICLE)
      expect((loser.reason as CapacityError).day).toBe(day)
    }

    // The count is the fact that matters: one, not two, not eight.
    expect(await readBookedCount(VEHICLE, day)).toBe(1)
  })

  it('never exceeds fleetSize when the fleet is larger than one', async () => {
    // Guards against passing the test above for the wrong reason — a lock
    // that serialised everything to one booking regardless of capacity would
    // look identical there and be badly wrong here.
    const day = testDay(1)
    const fleetSize = 3
    await setFleetSize(VEHICLE, fleetSize)

    const results = await Promise.allSettled(
      Array.from({ length: CONTENDERS }, () => attemptReservation(pool.db, day, day)),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(fleetSize)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
      CONTENDERS - fleetSize,
    )
    expect(await readBookedCount(VEHICLE, day)).toBe(fleetSize)
  })

  it('sells a multi-day hire exactly once when N checkouts race for the range', async () => {
    const startDate = testDay(10)
    const endDate = testDay(12)
    const days = [testDay(10), testDay(11), testDay(12)]
    await setFleetSize(VEHICLE, 1)

    const results = await Promise.allSettled(
      Array.from({ length: CONTENDERS }, () => attemptReservation(pool.db, startDate, endDate)),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)

    for (const day of days) {
      // Every day of the range holds exactly one booking. A per-day count of
      // two anywhere in here is an oversold trip.
      expect(await readBookedCount(VEHICLE, day)).toBe(1)
    }
  })

  it('holds a range that spans a month boundary without losing a day', async () => {
    // 2099-06-29 .. 2099-07-01. Ranges that cross a month are where naive
    // day arithmetic silently drops or duplicates a date.
    const startDate = testDay(28)
    const endDate = testDay(30)
    await setFleetSize(VEHICLE, 1)

    await attemptReservation(pool.db, startDate, endDate)

    expect(startDate).toBe('2099-06-29')
    expect(endDate).toBe('2099-07-01')
    for (const day of [testDay(28), testDay(29), testDay(30)]) {
      expect(await readBookedCount(VEHICLE, day)).toBe(1)
    }
  })
})

describe('all-or-nothing across a range', () => {
  it('leaves the earlier days unreserved when a later day is already full', async () => {
    const days = [testDay(20), testDay(21), testDay(22)]
    const [dayOne, dayTwo, dayThree] = days as [string, string, string]
    await setFleetSize(VEHICLE, 1)

    // Day 3 is already sold. Days 1 and 2 exist and are free, so the
    // assertion afterwards distinguishes "rolled back" from "never touched".
    await db.insert(driverCapacity).values([
      { vehicleClass: VEHICLE, day: dayOne, bookedCount: 0 },
      { vehicleClass: VEHICLE, day: dayTwo, bookedCount: 0 },
      { vehicleClass: VEHICLE, day: dayThree, bookedCount: 1 },
    ])

    await expect(attemptReservation(pool.db, dayOne, dayThree)).rejects.toThrow(CapacityError)

    // The failure names the day that could not be satisfied, so the customer
    // can be told which date to change rather than "unavailable".
    await expect(attemptReservation(pool.db, dayOne, dayThree)).rejects.toMatchObject({
      day: dayThree,
    })

    // A partially-reserved trip is worse than a rejected one: it holds
    // inventory nobody bought and nobody will release.
    expect(await readBookedCount(VEHICLE, dayOne)).toBe(0)
    expect(await readBookedCount(VEHICLE, dayTwo)).toBe(0)
    expect(await readBookedCount(VEHICLE, dayThree)).toBe(1)
  })

  it('leaves the earlier days unreserved when a later day is blocked by an admin', async () => {
    const [dayOne, dayTwo, dayThree] = [testDay(24), testDay(25), testDay(26)] as [
      string,
      string,
      string,
    ]
    await setFleetSize(VEHICLE, 5)

    await db.insert(driverCapacity).values([
      { vehicleClass: VEHICLE, day: dayOne, bookedCount: 0 },
      { vehicleClass: VEHICLE, day: dayTwo, bookedCount: 0 },
      // Blocked, not full: a public holiday or a service day. Capacity is
      // available on paper and must still be refused.
      { vehicleClass: VEHICLE, day: dayThree, bookedCount: 0, isBlocked: true },
    ])

    await expect(attemptReservation(pool.db, dayOne, dayThree)).rejects.toThrow(CapacityError)

    expect(await readBookedCount(VEHICLE, dayOne)).toBe(0)
    expect(await readBookedCount(VEHICLE, dayTwo)).toBe(0)
    expect(await readBookedCount(VEHICLE, dayThree)).toBe(0)
  })

  it('rolls back the hold when the surrounding transaction fails afterwards', async () => {
    // Capacity is reserved inside the order's transaction precisely so that a
    // later failure — a bad insert, a lost connection — gives the days back
    // without anyone having to notice.
    const day = testDay(32)
    await setFleetSize(VEHICLE, 1)

    await expect(
      pool.db.transaction(async (tx) => {
        await reserveDriverCapacity(tx, VEHICLE, day, day)
        throw new Error('the order insert failed')
      }),
    ).rejects.toThrow('the order insert failed')

    // Not merely "back to zero" — the row was created inside the rolled-back
    // transaction, so it should not exist at all.
    expect(await readBookedCount(VEHICLE, day)).toBeNull()
  })
})

describe('releaseDriverCapacity', () => {
  it('gives the days back and never goes negative on a retried release', async () => {
    const day = testDay(34)
    await setFleetSize(VEHICLE, 2)

    await attemptReservation(pool.db, day, day)
    expect(await readBookedCount(VEHICLE, day)).toBe(1)

    // A job retried after a partial failure releases twice. A bare decrement
    // would leave -1 here, which is phantom inventory: the next booking would
    // succeed against a count that never reaches the fleet size.
    await db.transaction(async (tx) => {
      await releaseDriverCapacity(tx, VEHICLE, day, day)
      await releaseDriverCapacity(tx, VEHICLE, day, day)
    })

    expect(await readBookedCount(VEHICLE, day)).toBe(0)
  })

  it('rejects an unknown vehicle class rather than reserving nothing quietly', async () => {
    await expect(
      pool.db.transaction(async (tx) =>
        reserveDriverCapacity(tx, 'limousine' as VehicleClass, testDay(36), testDay(36)),
      ),
    ).rejects.toThrow(CapacityError)

    const rows = await db
      .select()
      .from(driverCapacity)
      .where(and(eq(driverCapacity.vehicleClass, 'limousine'), eq(driverCapacity.day, testDay(36))))
    expect(rows).toHaveLength(0)
  })
})
