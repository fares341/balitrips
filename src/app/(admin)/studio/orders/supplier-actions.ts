'use server'

/**
 * Order page, phase 2: who runs each booked line and the supplier's answer.
 *
 *  - `assignLineSupplier`: give a line to one of the activity's supplier
 *    offers (cost frozen from the offer), to any supplier without an offer,
 *    or to nobody. Cost can be typed by an admin only.
 *  - `confirmLineWithSupplier`: record the supplier's confirmation number;
 *    the line becomes "confirmed" and the customer is told.
 */

import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { activitySupplierOffers, activityTiers, orderItems, orders, suppliers } from '@/db/schema'
import { activityOfLine } from '@/lib/availability/activity'
import { can } from '@/lib/auth/roles'
import { tierPricing } from '@/lib/booking/price'
import { notifyOrderUpdated } from '@/lib/notify/orders'
import { canMoveBooking, isBookingStatus } from '@/lib/orders/booking-status'
import { lineCostMinor } from '@/lib/suppliers/assign'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fcurrencyOr, fmoneyOrNull, fstr, fuuid, isUuid } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { bookingStatusLabel } from './labels'

type Outcome = { ok: string } | { err: string }

const detail = (id: string) => adminHref(`/orders/${id}`)
const PAID = ['paid', 'confirmed', 'partially_refunded']

export async function assignLineSupplier(orderId: string, form: FormData): Promise<void> {
  const session = await requireCapability('orders.fulfil')
  const { t } = await getAdminI18n()
  const mayCost = can(session.role, 'suppliers.write')
  let outcome: Outcome

  try {
    const orderItemId = fuuid(form, 'orderItemId', t('orders.field_order_line'))
    const choice = fstr(form, 'assign') ?? ''
    const [kind, id] = choice.includes(':') ? choice.split(':', 2) : ['', '']
    if (choice !== '' && ((kind !== 'offer' && kind !== 'supplier') || !id || !isUuid(id))) {
      throw new Error(t('sup.err_pick'))
    }

    await db.transaction(async (tx) => {
      const [line] = await tx
        .select({ line: orderItems, currency: orders.presentmentCurrency })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(eq(orderItems.id, orderItemId), eq(orderItems.orderId, orderId)))
        .for('update')
        .limit(1)
      if (!line) throw new Error(t('orders.err_line_not_in_order'))
      if (line.line.settlementId !== null) throw new Error(t('sup.err_settled'))

      const typedCurrency = fcurrencyOr(form, 'costCurrency', line.currency)
      const typedCost = mayCost ? fmoneyOrNull(form, 'cost', typedCurrency, t('sup.cost')) : null

      let values: {
        supplierId: string | null
        supplierOfferId: string | null
        costMinor: number | null
        costCurrency: string | null
      }
      if (choice === '') {
        values = { supplierId: null, supplierOfferId: null, costMinor: null, costCurrency: null }
      } else if (kind === 'offer') {
        const target = await activityOfLine(tx, line.line.kind, line.line.refId)
        const [offer] = await tx
          .select()
          .from(activitySupplierOffers)
          .where(eq(activitySupplierOffers.id, id as string))
          .limit(1)
        if (!offer || target === null || offer.activityId !== target.activityId) {
          throw new Error(t('sup.err_offer_other_activity'))
        }
        let pricing: 'per_person' | 'per_group' | 'per_couple' = 'per_person'
        if (target.tierId) {
          const [tier] = await tx
            .select({ pricingMode: activityTiers.pricingMode })
            .from(activityTiers)
            .where(eq(activityTiers.id, target.tierId))
            .limit(1)
          pricing = tierPricing(tier?.pricingMode)
        }
        const people = Math.max(1, line.line.guests ?? line.line.quantity)
        values = {
          supplierId: offer.supplierId,
          supplierOfferId: offer.id,
          costMinor: typedCost ?? lineCostMinor(offer, pricing, people, line.line.quantity),
          costCurrency: typedCost !== null ? typedCurrency : offer.currency,
        }
      } else {
        const [supplier] = await tx
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(eq(suppliers.id, id as string))
          .limit(1)
        if (!supplier) throw new Error(t('sup.err_gone'))
        values = {
          supplierId: supplier.id,
          supplierOfferId: null,
          costMinor: typedCost,
          costCurrency: typedCost !== null ? typedCurrency : null,
        }
      }

      await tx.update(orderItems).set(values).where(eq(orderItems.id, orderItemId))
      await writeAudit(
        {
          actor: session,
          action: 'order_item.supplier',
          entityType: 'order_item',
          entityId: orderItemId,
          before: {
            supplierId: line.line.supplierId,
            supplierOfferId: line.line.supplierOfferId,
            costMinor: line.line.costMinor,
          },
          after: values,
        },
        tx,
      )
    })
    outcome = { ok: t('sup.ok_assigned') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(orderId), outcome))
}

export async function confirmLineWithSupplier(orderId: string, form: FormData): Promise<void> {
  const session = await requireCapability('orders.fulfil')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    const orderItemId = fuuid(form, 'orderItemId', t('orders.field_order_line'))
    const reference = (fstr(form, 'supplierRef') ?? '').trim().slice(0, 128)
    if (reference === '') throw new Error(t('sup.err_ref_required'))
    const notify = form.get('notify') === 'on'

    const moved = await db.transaction(async (tx) => {
      const [line] = await tx
        .select({
          bookingStatus: orderItems.bookingStatus,
          fulfilmentStatus: orderItems.fulfilmentStatus,
          orderStatus: orders.status,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(eq(orderItems.id, orderItemId), eq(orderItems.orderId, orderId)))
        .for('update')
        .limit(1)
      if (!line) throw new Error(t('orders.err_line_not_in_order'))
      if (!PAID.includes(line.orderStatus)) throw new Error(t('orders.err_booking_unpaid'))
      const from = isBookingStatus(line.bookingStatus) ? line.bookingStatus : 'created'
      if (!canMoveBooking(from, 'confirmed')) {
        throw new Error(
          t('orders.err_booking_move', {
            from: bookingStatusLabel(t, from),
            to: bookingStatusLabel(t, 'confirmed'),
          }),
        )
      }
      const now = new Date()
      await tx
        .update(orderItems)
        .set({
          supplierRef: reference,
          supplierConfirmedAt: now,
          bookingStatus: 'confirmed',
          bookingStatusAt: from === 'confirmed' ? undefined : now,
          fulfilmentStatus:
            line.fulfilmentStatus === 'pending' ? 'confirmed' : line.fulfilmentStatus,
        })
        .where(eq(orderItems.id, orderItemId))
      await writeAudit(
        {
          actor: session,
          action: 'order_item.supplier_confirmed',
          entityType: 'order_item',
          entityId: orderItemId,
          before: { bookingStatus: from },
          after: { bookingStatus: 'confirmed', supplierRef: reference },
        },
        tx,
      )
      return from !== 'confirmed'
    })

    if (notify && moved) {
      await notifyOrderUpdated(orderId, 'confirmed', { by: session.userId, item: orderItemId })
    }
    outcome = { ok: t('sup.ok_confirmed') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(detail(orderId), outcome))
}
