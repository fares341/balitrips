'use server'

/**
 * «إعادة الإرسال» on a bought itinerary (phase 4). Owner only, and limited
 * to RESEND_RULE per account and line so the button cannot be used to spam
 * an inbox or a WhatsApp number.
 */

import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { orderItems, orders } from '@/db/schema'
import { isLocale, fallbackLocale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { resendItineraryDelivery } from '@/lib/itineraries/delivery'
import { consumeKey } from '@/lib/rate-limit'
import { requireActiveUser } from '@/lib/security/require'

const RESEND_RULE = { window: 60 * 60, max: 3 }

export async function resendScheduleAction(form: FormData): Promise<void> {
  const rawLocale = String(form.get('locale') ?? '')
  const locale = isLocale(rawLocale) ? rawLocale : fallbackLocale
  const itemId = String(form.get('itemId') ?? '')
  const back = (sent: string) =>
    redirect(getPathname({ href: { pathname: '/account/schedules', query: { sent } }, locale }))

  const user = await requireActiveUser('account:schedules')
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) back('err')

  // Ownership: the line belongs to an order of this account.
  const [owned] = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orderItems.id, itemId), eq(orders.userId, user.id)))
    .limit(1)
  if (!owned) back('err')

  const rate = await consumeKey(`itinerary_resend:${user.id}:${itemId}`, RESEND_RULE)
  if (!rate.allowed) back('limit')

  const outcome = await resendItineraryDelivery(itemId, ['email', 'whatsapp'], user.id).catch(
    (error: unknown) => {
      console.error('[delivery] customer resend failed', { itemId, error })
      return 'error' as const
    },
  )
  back(outcome === 'queued' ? 'ok' : 'err')
}
