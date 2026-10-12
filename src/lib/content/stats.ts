/**
 * أرقام الثقة في الرئيسية و"من نحن" — من قاعدة البيانات، لا ادعاءات ثابتة.
 *
 * كانت "500+ مكان"، "4.9★"، "12k+ رحلة" نصوصاً من التصميم بينما في القاعدة
 * 9 أماكن. رقم تسويقي غير حقيقي يُعدّ تضليلاً للمستهلك؛ هنا كل رقم مقاس، ويُخفى
 * ما لم يبلغ حداً أدنى يجعله ذا معنى (تقييم من مراجعتين ليس "تقييم المسافرين").
 */

import { and, avg, count, eq, inArray, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { mapPlaces, orders, reviews } from '@/db/schema'

export const MIN_REVIEWS_FOR_RATING = 10
export const MIN_TRIPS_TO_SHOW = 50

export interface TrustStats {
  places: number
  /** null حتى يوجد `MIN_REVIEWS_FOR_RATING` تقييماً منشوراً. */
  rating: number | null
  /** null حتى `MIN_TRIPS_TO_SHOW` طلباً مدفوعاً. */
  trips: number | null
}

export async function trustStats(): Promise<TrustStats> {
  const [[places], [rated], [trips]] = await Promise.all([
    db
      .select({ value: count() })
      .from(mapPlaces)
      .where(
        and(
          isNull(mapPlaces.deletedAt),
          eq(mapPlaces.status, 'published'),
          eq(mapPlaces.isHidden, false),
        ),
      ),
    db
      .select({ value: avg(reviews.stars), total: count() })
      .from(reviews)
      .where(and(eq(reviews.isPublished, true), isNull(reviews.deletedAt))),
    db
      .select({ value: count() })
      .from(orders)
      .where(inArray(orders.status, ['paid', 'confirmed', 'partially_refunded'])),
  ])
  return summarise({
    places: places?.value ?? 0,
    ratingAverage: rated?.value === null || rated?.value === undefined ? null : Number(rated.value),
    ratingCount: rated?.total ?? 0,
    trips: trips?.value ?? 0,
  })
}

/** القرار وحده (قابل للاختبار بلا قاعدة بيانات). */
export function summarise(raw: {
  places: number
  ratingAverage: number | null
  ratingCount: number
  trips: number
}): TrustStats {
  const rating =
    raw.ratingAverage !== null &&
    Number.isFinite(raw.ratingAverage) &&
    raw.ratingCount >= MIN_REVIEWS_FOR_RATING
      ? Math.round(raw.ratingAverage * 10) / 10
      : null
  return {
    places: raw.places,
    rating,
    trips: raw.trips >= MIN_TRIPS_TO_SHOW ? raw.trips : null,
  }
}
