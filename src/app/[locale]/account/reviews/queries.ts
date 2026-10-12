import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import { activities, activityTiers, orderItems, orders, reviews } from '@/db/schema'

/** حالات طلب تعني أن المال وصل — نفس `SETTLED` في ../_lib/queries. */
export const REVIEWABLE_ORDER_STATUSES = ['paid', 'confirmed', 'partially_refunded'] as const

/**
 * أنشطة اشتراها هذا المستخدم فعلاً ولم يقيّمها بعد — واحد لكل (طلب، نشاط).
 * البند المسترد أو الملغى لا يُقيَّم: من لم يحضر لا يُقيّم.
 */
export async function reviewableActivities(userId: string) {
  return (
    db
      .selectDistinctOn([orders.id, activities.id], {
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        activityId: activities.id,
        activityName: activities.name,
        activitySlug: activities.slug,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      // بند الفئة (activity_tier) يحمل معرّف الفئة؛ نصعد إلى نشاطها.
      .leftJoin(
        activityTiers,
        and(eq(orderItems.kind, 'activity_tier'), eq(activityTiers.id, orderItems.refId)),
      )
      .innerJoin(
        activities,
        eq(activities.id, sql`coalesce(${activityTiers.activityId}, ${orderItems.refId})`),
      )
      .where(
        and(
          eq(orders.userId, userId),
          inArray(orders.status, [...REVIEWABLE_ORDER_STATUSES]),
          inArray(orderItems.kind, ['activity', 'activity_tier']),
          sql`${orderItems.fulfilmentStatus} not in ('refunded', 'cancelled')`,
          sql`not exists (
          select 1 from ${reviews} r
          where r.order_id = ${orders.id} and r.activity_id = ${activities.id} and r.deleted_at is null
        )`,
          isNull(activities.deletedAt),
        ),
      )
  )
}
