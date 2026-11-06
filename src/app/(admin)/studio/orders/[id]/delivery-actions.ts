'use server'

/** Studio «إعادة الإرسال» for a bought itinerary (phase 4). */

import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { orderItems } from '@/db/schema'
import { resendItineraryDelivery, type DeliveryChannel } from '@/lib/itineraries/delivery'

import { adminHref } from '../../../_lib/admin-path'
import { writeAudit } from '../../../_lib/audit'
import { getAdminI18n } from '../../../_lib/i18n'
import {
  errorMessage,
  isRedirectError,
  withOutcome,
  type ActionOutcome,
} from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'

export async function resendDelivery(
  orderId: string,
  orderItemId: string,
  form: FormData,
): Promise<void> {
  const session = await requireCapability('orders.fulfil')
  const { t } = await getAdminI18n()
  const raw = String(form.get('channel') ?? 'both')
  const channels: DeliveryChannel[] =
    raw === 'email' ? ['email'] : raw === 'whatsapp' ? ['whatsapp'] : ['email', 'whatsapp']
  let outcome: ActionOutcome
  try {
    const [line] = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(and(eq(orderItems.id, orderItemId), eq(orderItems.orderId, orderId)))
      .limit(1)
    if (!line) throw new Error(t('orders.err_line_not_in_order'))
    const result = await resendItineraryDelivery(orderItemId, channels, session.userId)
    if (result === 'busy') throw new Error(t('dlv.err_busy'))
    if (result === 'not_deliverable') throw new Error(t('dlv.err_not_deliverable'))
    await writeAudit({
      actor: session,
      action: 'order_item.delivery_resend',
      entityType: 'order_item',
      entityId: orderItemId,
      before: null,
      after: { orderId, channels: channels.join(',') },
    })
    outcome = { ok: t('dlv.ok_resent') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(adminHref(`/orders/${orderId}`), outcome))
}
