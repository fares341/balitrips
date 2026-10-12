'use server'

/**
 * تقييم من مشترٍ حقيقي. يُتحقق على الخادم أن (الطلب، النشاط) ضمن ما يحق لهذا
 * المستخدم تقييمه — النموذج لا يُصدَّق. التقييم يُنشر بعد مراجعة الإدارة
 * (Studio → Reviews)، ويحمل `order_id` فيظهر "موثّق".
 */

import { getLocale } from 'next-intl/server'

import { db } from '@/db'
import { reviews } from '@/db/schema'
import { locales } from '@/i18n/config'
import { redirect } from '@/i18n/routing'
import { requireUser } from '@/lib/auth/session'

import { reviewableActivities } from './queries'

export async function submitReview(form: FormData): Promise<void> {
  const user = await requireUser()
  const locale = await getLocale()
  const orderId = String(form.get('orderId') ?? '')
  const activityId = String(form.get('activityId') ?? '')
  const stars = Number.parseInt(String(form.get('stars') ?? ''), 10)
  const text = String(form.get('body') ?? '')
    .trim()
    .slice(0, 2000)

  const allowed = await reviewableActivities(user.id)
  const match = allowed.find((row) => row.orderId === orderId && row.activityId === activityId)
  if (!match || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    redirect({ href: { pathname: '/account/reviews', query: { r: 'error' } }, locale })
    return
  }

  // النص بلغة الكاتب فقط؛ اللغات الأخرى فارغة فيسقط العرض على ما كُتب.
  const body = Object.fromEntries(
    locales.map((one) => [one, one === locale ? text : '']),
  ) as Record<(typeof locales)[number], string>
  if (locale !== 'en') body.en = text

  await db.insert(reviews).values({
    authorName: (user.name ?? user.email.split('@')[0] ?? 'Traveller').slice(0, 128),
    stars,
    body: text === '' ? null : body,
    activityId,
    orderId,
    isPublished: false,
  })
  redirect({ href: { pathname: '/account/reviews', query: { r: 'thanks' } }, locale })
}
