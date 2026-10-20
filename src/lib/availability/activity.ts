import { and, eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { activities, activityAvailability, activityTiers, orderItems } from '@/db/schema'
import type { CapacityOutcome } from '@/lib/orders/booking-status'

import { counterSlot, weekdayList } from './rules'

/**
 * Activity places (phase 2) — holding and giving back.
 *
 * Same pattern as driver capacity (`./capacity.ts`): the check and the
 * increment are ONE conditional UPDATE inside the caller's transaction, so
 * two payments for the last place cannot both succeed. Places are held when
 * the order is paid (the webhook / "mark paid" transaction), not when the
 * cart is checked out: an abandoned checkout holds nothing.
 *
 * Every paid activity line is counted, even with no capacity configured, so
 * the numbers are right the day the owner sets a limit. With no limit the
 * outcome is `unlimited` and booking behaves exactly as before.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** The activity an order line books: the line itself, or its package's activity. */
export async function activityOfLine(
  tx: Tx,
  kind: string,
  refId: string | null,
): Promise<{ activityId: string; tierId: string | null } | null> {
  if (refId === null) return null
  if (kind === 'activity') return { activityId: refId, tierId: null }
  if (kind !== 'activity_tier') return null
  const [tier] = await tx
    .select({ activityId: activityTiers.activityId })
    .from(activityTiers)
    .where(eq(activityTiers.id, refId))
    .limit(1)
  return tier ? { activityId: tier.activityId, tierId: refId } : null
}

/**
 * Hold `people` places for one departure. Returns what happened; never
 * throws for a full or closed date — a paid booking is never refused here,
 * it becomes `pending_availability` for staff to sort out.
 */
export async function reserveActivityCapacity(
  tx: Tx,
  activityId: string,
  day: string,
  time: string | null,
  people: number,
): Promise<CapacityOutcome> {
  const [activity] = await tx
    .select({
      timeSlots: activities.timeSlots,
      capacityPerSlot: activities.capacityPerSlot,
      closedWeekdays: activities.closedWeekdays,
    })
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1)
  if (!activity) return 'unlimited'

  const hasSlots = (activity.timeSlots ?? []).length > 0
  const slot = counterSlot({ hasSlots }, time)
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  if (weekdayList(activity.closedWeekdays).includes(weekday)) return 'closed'

  const [dayRow] =
    slot === ''
      ? []
      : await tx
          .select({
            capacity: activityAvailability.capacity,
            isClosed: activityAvailability.isClosed,
          })
          .from(activityAvailability)
          .where(
            and(
              eq(activityAvailability.activityId, activityId),
              eq(activityAvailability.day, day),
              eq(activityAvailability.slot, ''),
            ),
          )
          .limit(1)
  if (dayRow?.isClosed) return 'closed'

  // Make sure the counter row exists so the UPDATE has something to lock.
  await tx
    .insert(activityAvailability)
    .values({ activityId, day, slot, booked: 0 })
    .onConflictDoNothing({
      target: [
        activityAvailability.activityId,
        activityAvailability.day,
        activityAvailability.slot,
      ],
    })

  // Capacity in force: this row's override, else the day's, else the default.
  const fallback = dayRow?.capacity ?? activity.capacityPerSlot
  const fallbackSql = fallback === null ? sql`NULL::integer` : sql`${fallback}::integer`
  const updated = await tx
    .update(activityAvailability)
    .set({
      booked: sql`${activityAvailability.booked} + ${people}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(activityAvailability.activityId, activityId),
        eq(activityAvailability.day, day),
        eq(activityAvailability.slot, slot),
        eq(activityAvailability.isClosed, false),
        sql`(coalesce(${activityAvailability.capacity}, ${fallbackSql}) is null or ${activityAvailability.booked} + ${people} <= coalesce(${activityAvailability.capacity}, ${fallbackSql}))`,
      ),
    )
    .returning({ capacity: activityAvailability.capacity })

  if (updated.length === 0) {
    // Closed row or not enough places: tell which.
    const [row] = await tx
      .select({ isClosed: activityAvailability.isClosed })
      .from(activityAvailability)
      .where(
        and(
          eq(activityAvailability.activityId, activityId),
          eq(activityAvailability.day, day),
          eq(activityAvailability.slot, slot),
        ),
      )
      .limit(1)
    return row?.isClosed ? 'closed' : 'full'
  }
  const capacity = updated[0]?.capacity ?? fallback
  return capacity === null ? 'unlimited' : 'reserved'
}

/**
 * Give back the places an order line holds (cancelled, failed, refunded).
 * Idempotent: `capacity_held` goes to 0 in the same statement that reads it,
 * so a second call gives nothing back.
 */
export async function releaseLineCapacity(tx: Tx, orderItemId: string): Promise<number> {
  const [line] = await tx
    .select({
      kind: orderItems.kind,
      refId: orderItems.refId,
      travelDate: orderItems.travelDate,
      travelTime: orderItems.travelTime,
      held: orderItems.capacityHeld,
    })
    .from(orderItems)
    .where(eq(orderItems.id, orderItemId))
    .for('update')
    .limit(1)
  if (!line || line.held <= 0 || line.travelDate === null) return 0

  const target = await activityOfLine(tx, line.kind, line.refId)
  await tx.update(orderItems).set({ capacityHeld: 0 }).where(eq(orderItems.id, orderItemId))
  if (target === null) return 0

  const [activity] = await tx
    .select({ timeSlots: activities.timeSlots })
    .from(activities)
    .where(eq(activities.id, target.activityId))
    .limit(1)
  const slot = counterSlot({ hasSlots: (activity?.timeSlots ?? []).length > 0 }, line.travelTime)
  await tx
    .update(activityAvailability)
    .set({
      booked: sql`GREATEST(${activityAvailability.booked} - ${line.held}, 0)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(activityAvailability.activityId, target.activityId),
        eq(activityAvailability.day, line.travelDate),
        eq(activityAvailability.slot, slot),
      ),
    )
  return line.held
}
