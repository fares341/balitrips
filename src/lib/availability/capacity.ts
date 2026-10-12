import { and, eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { driverCapacity, driverVehicles } from '@/db/schema'
import { daysInRange, type VehicleClass } from '@/lib/booking-rules'

/**
 * Driver fleet capacity.
 *
 * The fleet is finite, so two customers booking the last van for the same
 * date is a genuine race. An application-level "check, then insert" loses
 * it silently: both reads see one van free, both writes succeed, and the
 * operator discovers the double-sale on the day.
 *
 * The fix is that the check and the decrement are the SAME statement —
 * a conditional UPDATE whose WHERE clause carries the capacity predicate,
 * executed inside the order's transaction. Postgres takes a row lock for
 * the duration, so the second caller blocks, re-evaluates against the
 * committed count, and fails cleanly.
 */

export class CapacityError extends Error {
  constructor(
    message: string,
    readonly vehicleClass: VehicleClass,
    readonly day: string,
  ) {
    super(message)
    this.name = 'CapacityError'
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Reserve one vehicle of `vehicleClass` for every day in the range.
 *
 * MUST be called inside the same transaction that writes the order, so a
 * later failure releases the hold automatically. Throws CapacityError on
 * the first day that cannot be satisfied, which rolls the whole thing back
 * — a partially-reserved trip is worse than a rejected one.
 */
export async function reserveDriverCapacity(
  tx: Tx,
  vehicleClass: VehicleClass,
  startDate: string,
  endDate: string,
): Promise<void> {
  const [vehicle] = await tx
    .select({ fleetSize: driverVehicles.fleetSize })
    .from(driverVehicles)
    .where(eq(driverVehicles.vehicleClass, vehicleClass))
    .limit(1)

  if (!vehicle) {
    throw new CapacityError(`Unknown vehicle class "${vehicleClass}"`, vehicleClass, startDate)
  }

  for (const day of daysInRange(startDate, endDate)) {
    // Ensure the row exists so the UPDATE below has something to lock.
    // ON CONFLICT DO NOTHING makes concurrent callers converge on one row.
    await tx
      .insert(driverCapacity)
      .values({ vehicleClass, day, bookedCount: 0 })
      .onConflictDoNothing({ target: [driverCapacity.vehicleClass, driverCapacity.day] })

    // The check and the decrement in one statement. Postgres locks the row
    // for the duration, so a concurrent caller waits here and then sees the
    // committed count rather than a stale read.
    const updated = await tx
      .update(driverCapacity)
      .set({ bookedCount: sql`${driverCapacity.bookedCount} + 1` })
      .where(
        and(
          eq(driverCapacity.vehicleClass, vehicleClass),
          eq(driverCapacity.day, day),
          eq(driverCapacity.isBlocked, false),
          sql`${driverCapacity.bookedCount} < ${vehicle.fleetSize}`,
        ),
      )
      .returning({ bookedCount: driverCapacity.bookedCount })

    if (updated.length === 0) {
      throw new CapacityError(`No ${vehicleClass} available on ${day}`, vehicleClass, day)
    }
  }
}

/**
 * Give capacity back — on cancellation, refund, or when a pending order
 * expires without being paid.
 *
 * GREATEST(count - 1, 0) rather than a bare decrement: a double release
 * caused by a retried job must not push the count negative, which would
 * silently create phantom inventory.
 */
export async function releaseDriverCapacity(
  tx: Tx,
  vehicleClass: VehicleClass,
  startDate: string,
  endDate: string,
): Promise<void> {
  for (const day of daysInRange(startDate, endDate)) {
    await tx
      .update(driverCapacity)
      .set({ bookedCount: sql`GREATEST(${driverCapacity.bookedCount} - 1, 0)` })
      .where(and(eq(driverCapacity.vehicleClass, vehicleClass), eq(driverCapacity.day, day)))
  }
}

export interface DayAvailability {
  day: string
  available: number
  blocked: boolean
}

/**
 * Read-only availability, for showing the customer what is bookable before
 * they commit. Never used to authorise a booking — only the conditional
 * UPDATE above can do that, because anything read earlier is already stale.
 */
export async function getDriverAvailability(
  vehicleClass: VehicleClass,
  startDate: string,
  endDate: string,
): Promise<DayAvailability[]> {
  const [vehicle] = await db
    .select({ fleetSize: driverVehicles.fleetSize })
    .from(driverVehicles)
    .where(eq(driverVehicles.vehicleClass, vehicleClass))
    .limit(1)

  const fleetSize = vehicle?.fleetSize ?? 0
  const days = daysInRange(startDate, endDate)

  const rows = await db
    .select({
      day: driverCapacity.day,
      bookedCount: driverCapacity.bookedCount,
      isBlocked: driverCapacity.isBlocked,
    })
    .from(driverCapacity)
    .where(
      and(eq(driverCapacity.vehicleClass, vehicleClass), sql`${driverCapacity.day} = ANY(${days})`),
    )

  const byDay = new Map(rows.map((r) => [r.day, r]))

  return days.map((day) => {
    const row = byDay.get(day)
    return {
      day,
      available: row?.isBlocked ? 0 : fleetSize - (row?.bookedCount ?? 0),
      blocked: row?.isBlocked ?? false,
    }
  })
}
