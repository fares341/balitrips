import { and, eq, gte, inArray, isNotNull, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  activityLog,
  contactMessages,
  customTripRequests,
  entitlements,
  orderItems,
  orders,
  payments,
  plans,
  refunds,
  supportTickets,
} from '@/db/schema'

import { serverEventId } from './event-id'
import { recordEvents, type EventRow } from './record'

/**
 * Server events — money and bookings, written by the server only.
 *
 * Two writers, one id per fact, so they can never double count:
 *
 *  1. **Inline**, in the transaction that records a payment
 *     (`emitPaidOrderEvents`, called from `applyPaidOrder`): `purchase`,
 *     `payment_success`, `vip_purchase` and `booking_request` exist the
 *     moment the money does.
 *  2. **The worker's sync** (`syncServerEvents`, every 10 minutes): reads
 *     the database itself — payments, booking lines, refunds, VIP access,
 *     requests — and writes whatever is missing. It is what records a failed
 *     payment, a supplier confirmation or a refund wherever in the Studio it
 *     happened, and it heals anything the inline write missed.
 *
 * Every id is `serverEventId(name, <row id>)`; the unique index on
 * `analytics_events.event_id` turns the second writer into a no-op.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Order lines that are a booking someone has to run. */
export const BOOKABLE_KINDS = ['activity', 'activity_tier', 'package', 'driver'] as const
/** Payment rows that mean money was taken. */
export const COLLECTED_PAYMENT = ['succeeded', 'refunded'] as const

function touchOf(order: {
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
}) {
  return order.utmSource
    ? { source: order.utmSource, medium: order.utmMedium, campaign: order.utmCampaign }
    : null
}

const consentM = (code: string | null) => (code ?? '').includes('m')

async function paidOrderRows(
  executor: typeof db | Tx,
  orderIds: readonly string[],
  at: Date | null,
): Promise<EventRow[]> {
  if (orderIds.length === 0) return []
  const orderRows = await executor
    .select({
      id: orders.id,
      userId: orders.userId,
      totalMinor: orders.totalMinor,
      currency: orders.presentmentCurrency,
      utmSource: orders.utmSource,
      utmMedium: orders.utmMedium,
      utmCampaign: orders.utmCampaign,
      anonId: orders.analyticsAnonId,
      consent: orders.trackingConsent,
      placedAt: orders.placedAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(inArray(orders.id, [...orderIds]))
  const paymentRows = await executor
    .select({
      id: payments.id,
      orderId: payments.orderId,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      provider: payments.provider,
      updatedAt: payments.updatedAt,
    })
    .from(payments)
    .where(
      and(
        inArray(payments.orderId, [...orderIds]),
        inArray(payments.status, [...COLLECTED_PAYMENT]),
      ),
    )
  const itemRows = await executor
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      kind: orderItems.kind,
      refId: orderItems.refId,
      lineTotalMinor: orderItems.lineTotalMinor,
      planKind: plans.entitlementKind,
    })
    .from(orderItems)
    .leftJoin(plans, and(eq(orderItems.kind, 'plan'), eq(plans.id, orderItems.refId)))
    .where(inArray(orderItems.orderId, [...orderIds]))

  const rows: EventRow[] = []
  for (const order of orderRows) {
    const paidPayments = paymentRows.filter((p) => p.orderId === order.id)
    // Not paid (yet): nothing to say about it.
    if (paidPayments.length === 0) continue
    const paidAt =
      at ??
      paidPayments.reduce<Date | null>(
        (min, p) => (min === null || p.updatedAt < min ? p.updatedAt : min),
        null,
      ) ??
      order.placedAt ??
      order.createdAt
    const base = {
      source: 'server' as const,
      userId: order.userId,
      anonId: order.anonId,
      orderId: order.id,
      touch: touchOf(order),
      consentMarketing: consentM(order.consent),
      createdAt: paidAt,
    }
    rows.push({
      ...base,
      eventId: serverEventId('purchase', order.id),
      name: 'purchase',
      valueMinor: order.totalMinor,
      currency: order.currency,
    })
    for (const payment of paidPayments) {
      rows.push({
        ...base,
        eventId: serverEventId('payment_success', payment.id),
        name: 'payment_success',
        valueMinor: payment.amountMinor,
        currency: payment.currency,
        props: { source: payment.provider },
        createdAt: at ?? payment.updatedAt,
      })
    }
    for (const item of itemRows.filter((i) => i.orderId === order.id)) {
      if (item.kind === 'plan' && item.planKind === 'vip') {
        rows.push({
          ...base,
          eventId: serverEventId('vip_purchase', item.id),
          name: 'vip_purchase',
          itemKind: 'plan',
          itemId: item.refId,
          valueMinor: item.lineTotalMinor,
          currency: order.currency,
        })
      }
      if ((BOOKABLE_KINDS as readonly string[]).includes(item.kind)) {
        rows.push({
          ...base,
          eventId: serverEventId('booking_request', item.id),
          name: 'booking_request',
          itemKind: item.kind === 'activity_tier' ? 'activity' : item.kind,
          itemId: item.refId,
          valueMinor: item.lineTotalMinor,
          currency: order.currency,
          props: { target: item.kind },
        })
      }
    }
  }
  return rows
}

/**
 * Inline, inside the payment transaction (`applyPaidOrder`). Never throws and
 * never aborts the transaction (the write runs in a savepoint).
 */
export async function emitPaidOrderEvents(
  tx: Tx,
  orderId: string,
  now = new Date(),
): Promise<void> {
  try {
    const rows = await paidOrderRows(tx, [orderId], now)
    await recordEvents(rows, tx)
  } catch (error) {
    console.error('[analytics] paid order events failed', { orderId, error })
  }
}

export interface SyncResult {
  written: number
  scanned: number
}

/**
 * Write every server event the database implies, for rows changed since
 * `since`. Idempotent: run it as often as you like.
 */
export async function syncServerEvents(since: Date, limit = 5000): Promise<SyncResult> {
  let scanned = 0
  let written = 0
  const write = async (rows: EventRow[]) => {
    scanned += rows.length
    written += await recordEvents(rows)
  }

  // --- Paid orders: purchase, payment_success, vip_purchase, booking_request
  const paidOrders = await db
    .selectDistinct({ orderId: payments.orderId })
    .from(payments)
    .where(and(inArray(payments.status, [...COLLECTED_PAYMENT]), gte(payments.updatedAt, since)))
    .limit(limit)
  const ids = paidOrders.map((row) => row.orderId)
  for (let at = 0; at < ids.length; at += 200) {
    await write(await paidOrderRows(db, ids.slice(at, at + 200), null))
  }

  // --- Failed payments
  const failed = await db
    .select({
      id: payments.id,
      orderId: payments.orderId,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      provider: payments.provider,
      updatedAt: payments.updatedAt,
      userId: orders.userId,
      anonId: orders.analyticsAnonId,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(eq(payments.status, 'failed'), gte(payments.updatedAt, since)))
    .limit(limit)
  await write(
    failed.map((row) => ({
      eventId: serverEventId('payment_failed', row.id),
      name: 'payment_failed' as const,
      source: 'server' as const,
      userId: row.userId,
      anonId: row.anonId,
      orderId: row.orderId,
      valueMinor: row.amountMinor,
      currency: row.currency,
      props: { source: row.provider },
      createdAt: row.updatedAt,
    })),
  )

  // --- Booking lines confirmed / cancelled
  const lines = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      kind: orderItems.kind,
      refId: orderItems.refId,
      status: orderItems.bookingStatus,
      statusAt: orderItems.bookingStatusAt,
      confirmedAt: orderItems.supplierConfirmedAt,
      updatedAt: orderItems.updatedAt,
      lineTotalMinor: orderItems.lineTotalMinor,
      currency: orders.presentmentCurrency,
      userId: orders.userId,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        inArray(orderItems.kind, [...BOOKABLE_KINDS]),
        gte(orderItems.updatedAt, since),
        or(
          isNotNull(orderItems.supplierConfirmedAt),
          inArray(orderItems.bookingStatus, [
            'confirmed',
            'in_progress',
            'completed',
            'cancelled',
            'refunded',
          ]),
        ),
      ),
    )
    .limit(limit)
  const bookingRows: EventRow[] = []
  for (const line of lines) {
    const common = {
      source: 'server' as const,
      userId: line.userId,
      orderId: line.orderId,
      itemKind: line.kind === 'activity_tier' ? 'activity' : line.kind,
      itemId: line.refId,
      valueMinor: line.lineTotalMinor,
      currency: line.currency,
    }
    const wasConfirmed =
      line.confirmedAt !== null || ['confirmed', 'in_progress', 'completed'].includes(line.status)
    if (wasConfirmed) {
      bookingRows.push({
        ...common,
        eventId: serverEventId('booking_confirmed', line.id),
        name: 'booking_confirmed',
        createdAt: line.confirmedAt ?? line.statusAt ?? line.updatedAt,
      })
    }
    if (line.status === 'cancelled' || line.status === 'refunded') {
      bookingRows.push({
        ...common,
        eventId: serverEventId('booking_cancelled', line.id),
        name: 'booking_cancelled',
        createdAt: line.statusAt ?? line.updatedAt,
      })
    }
  }
  await write(bookingRows)

  // --- Refunds
  const refundRows = await db
    .select({
      id: refunds.id,
      amountMinor: refunds.amountMinor,
      currency: refunds.currency,
      createdAt: refunds.createdAt,
      orderId: payments.orderId,
      userId: orders.userId,
    })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(inArray(refunds.status, ['pending', 'succeeded']), gte(refunds.updatedAt, since)))
    .limit(limit)
  await write(
    refundRows.map((row) => ({
      eventId: serverEventId('refund', row.id),
      name: 'refund' as const,
      source: 'server' as const,
      userId: row.userId,
      orderId: row.orderId,
      valueMinor: row.amountMinor,
      currency: row.currency,
      createdAt: row.createdAt,
    })),
  )

  // --- VIP access granted (any route: bought, bundled, family, staff)
  const vip = await db
    .select({
      id: entitlements.id,
      userId: entitlements.userId,
      orderId: entitlements.grantedByOrderId,
      planId: entitlements.planId,
      startsAt: entitlements.startsAt,
      actor: entitlements.grantedByActorId,
      sharedBy: entitlements.sharedByUserId,
    })
    .from(entitlements)
    .where(and(eq(entitlements.kind, 'vip'), gte(entitlements.createdAt, since)))
    .limit(limit)
  await write(
    vip.map((row) => ({
      eventId: serverEventId('vip_access_granted', row.id),
      name: 'vip_access_granted' as const,
      source: 'server' as const,
      userId: row.userId,
      orderId: row.orderId,
      itemKind: row.planId ? 'plan' : null,
      itemId: row.planId,
      props: {
        source: row.sharedBy ? 'family' : row.actor ? 'staff' : row.orderId ? 'order' : 'other',
      },
      createdAt: row.startsAt,
    })),
  )

  // --- Itinerary downloads (the delivery log)
  const downloads = await db
    .select({
      id: activityLog.id,
      userId: activityLog.userId,
      createdAt: activityLog.createdAt,
      orderItemId: sql<string | null>`${activityLog.details}->>'orderItemId'`,
    })
    .from(activityLog)
    .where(and(eq(activityLog.action, 'download_pdf'), gte(activityLog.createdAt, since)))
    .limit(limit)
  const itemIds = downloads
    .map((row) => row.orderItemId)
    .filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
  const itemRefs =
    itemIds.length === 0
      ? []
      : await db
          .select({ id: orderItems.id, kind: orderItems.kind, refId: orderItems.refId })
          .from(orderItems)
          .where(inArray(orderItems.id, [...new Set(itemIds)]))
  const refOf = new Map(itemRefs.map((row) => [row.id, row]))
  await write(
    downloads.map((row) => {
      const ref = row.orderItemId ? refOf.get(row.orderItemId) : undefined
      return {
        eventId: serverEventId('itinerary_download', row.id),
        name: 'itinerary_download' as const,
        source: 'server' as const,
        userId: row.userId,
        itemKind: ref?.kind === 'custom' ? 'custom' : 'itinerary',
        itemId: ref?.refId ?? null,
        createdAt: row.createdAt,
      }
    }),
  )

  // --- Leads: custom trip requests and contact messages
  const [trips, contacts] = await Promise.all([
    db
      .select({
        id: customTripRequests.id,
        userId: customTripRequests.userId,
        createdAt: customTripRequests.createdAt,
      })
      .from(customTripRequests)
      .where(gte(customTripRequests.createdAt, since))
      .limit(limit),
    db
      .select({ id: contactMessages.id, createdAt: contactMessages.createdAt })
      .from(contactMessages)
      .where(gte(contactMessages.createdAt, since))
      .limit(limit),
  ])
  await write([
    ...trips.map((row) => ({
      eventId: serverEventId('lead_submit', row.id),
      name: 'lead_submit' as const,
      source: 'server' as const,
      userId: row.userId,
      itemKind: 'custom',
      props: { source: 'custom_trip' },
      createdAt: row.createdAt,
    })),
    ...contacts.map((row) => ({
      eventId: serverEventId('lead_submit', row.id),
      name: 'lead_submit' as const,
      source: 'server' as const,
      props: { source: 'contact' },
      createdAt: row.createdAt,
    })),
  ])

  // --- Support tickets (phase 4)
  const tickets = await db
    .select({
      id: supportTickets.id,
      userId: supportTickets.userId,
      orderId: supportTickets.orderId,
      category: supportTickets.category,
      source: supportTickets.source,
      createdAt: supportTickets.createdAt,
    })
    .from(supportTickets)
    .where(gte(supportTickets.createdAt, since))
    .limit(limit)
  await write(
    tickets.map((row) => ({
      eventId: serverEventId('support_ticket_created', row.id),
      name: 'support_ticket_created' as const,
      source: 'server' as const,
      userId: row.userId,
      orderId: row.orderId,
      props: { category: row.category, source: row.source },
      createdAt: row.createdAt,
    })),
  )

  return { written, scanned }
}
