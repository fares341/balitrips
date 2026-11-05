/** Notify buyers of an itinerary that a new PDF is out (moved out of actions.ts so both upload paths share it). */

import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm'

import { db } from '@/db'
import { itineraries, orderItems, orders, users } from '@/db/schema'
import { defaultLocale, isLocale, locales, type Locale } from '@/i18n/config'
import { pick } from '@/lib/content/localize'
import { notifyUsers } from '@/lib/notify'

/**
 * بعد رفع ملف جديد: إشعار `itinerary_pdf_updated` (داخل الموقع + بريد) لكل من
 * يملك هذا الجدول (بند مسدَّد غير مسترد/ملغى) ويستلم ملف هذه اللغة — لغته هي
 * لغة الملف، أو ملف اللغة الافتراضية ولا ملف مرفوع للغته. إدراج جماعي بلغة كل
 * مجموعة. لا يرمي: فشل الإشعار لا يُفشل الرفع.
 */
export async function notifyItineraryHolders(
  itinerary: typeof itineraries.$inferSelect,
  uploadedLocale: Locale,
  keys: Partial<Record<string, string>>,
): Promise<number> {
  try {
    const receives = locales.filter(
      (locale) => locale === uploadedLocale || (uploadedLocale === defaultLocale && !keys[locale]),
    )
    const holders = await db
      .selectDistinct({ userId: orders.userId, locale: users.locale })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(users, eq(users.id, orders.userId))
      .where(
        and(
          eq(orderItems.refId, itinerary.id),
          eq(orderItems.kind, 'itinerary'),
          inArray(orders.status, ['paid', 'confirmed', 'partially_refunded']),
          notInArray(orderItems.fulfilmentStatus, ['refunded', 'cancelled']),
          isNull(users.deletedAt),
        ),
      )
    const byLocale = new Map<Locale, string[]>()
    for (const holder of holders) {
      if (!holder.userId) continue
      const locale = isLocale(holder.locale) ? holder.locale : defaultLocale
      if (!receives.includes(locale)) continue
      byLocale.set(locale, [...(byLocale.get(locale) ?? []), holder.userId])
    }
    let total = 0
    for (const [locale, userIds] of byLocale) {
      total += await notifyUsers(
        userIds,
        'itinerary_pdf_updated',
        { name: pick(itinerary.name, locale, itinerary.slug) },
        '/account/schedules',
      )
    }
    return total
  } catch (error) {
    console.error('[itineraries] holder notification failed', { id: itinerary.id, error })
    return 0
  }
}
