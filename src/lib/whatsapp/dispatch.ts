/**
 * WhatsApp automations: triggers, the send job and the time-based sweep.
 *
 *   triggerOrderAutomation('booking_confirmed', orderId, { itemId })
 *
 * A trigger never throws (a WhatsApp problem must not fail a payment or a
 * Studio action). It renders the message in the customer's language, writes
 * one row to `whatsapp_messages` under a UNIQUE `dedupe_key` and queues the
 * pg-boss job `whatsapp.auto` with the row id only. A second trigger for the
 * same event finds the key taken and does nothing — no duplicate sends.
 *
 * Consent (proposal §11 «رقم وموافقة العميل»): a message goes only to a
 * customer who ticked «WhatsApp updates» at checkout (order snapshot) or
 * opted in on their account (`users.whatsapp_opt_in`), and only to a number
 * with a country code. Otherwise the row is logged as `skipped`.
 */

import { and, eq, inArray, lt, sql } from 'drizzle-orm'

import { db } from '@/db'
import { customTripRequests, orderItems, orders, users, whatsappMessages } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'
import { toWhatsappNumber } from '@/lib/notify/whatsapp'

import { messageLocale, renderText, templateValues, type AutomationKey } from './automations'
import { createProvider, type SendResult } from './providers'
import {
  automationTemplate,
  automationText,
  isAutomationOn,
  readWhatsappSettings,
  resolveCredentials,
  type WhatsappSettings,
} from './settings'

const MAX_ATTEMPTS = 5

function origin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

function link(path: string, locale: Locale): string {
  return `${origin()}${getPathname({ href: path, locale })}`
}

function formatDay(day: string | null, locale: Locale): string {
  if (!day) return '-'
  const date = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return day
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function formatTime(time: string | null): string {
  return time ? time.slice(0, 5) : '-'
}

interface Recipient {
  userId: string | null
  phone: string | null
  consent: boolean
  locale: Locale
  name: string
}

async function queueMessage(
  settings: WhatsappSettings,
  key: AutomationKey,
  dedupeKey: string,
  recipient: Recipient,
  vars: Record<string, string>,
  orderId: string | null,
): Promise<void> {
  const to = toWhatsappNumber(recipient.phone)
  const skipReason = !recipient.consent ? 'no_consent' : to === null ? 'no_number' : null
  const body = renderText(automationText(settings, key, recipient.locale), vars)
  const [row] = await db
    .insert(whatsappMessages)
    .values({
      automation: key,
      dedupeKey: dedupeKey.slice(0, 160),
      orderId,
      userId: recipient.userId,
      toPhone: to,
      locale: recipient.locale,
      vars,
      body,
      status: skipReason === null ? 'queued' : 'skipped',
      error: skipReason,
    })
    .onConflictDoNothing({ target: whatsappMessages.dedupeKey })
    .returning({ id: whatsappMessages.id })
  if (row && skipReason === null) {
    const { enqueueWaAuto } = await import('@/worker/queues')
    await enqueueWaAuto({ messageId: row.id })
  }
}

/* ---------------- Order-based triggers ---------------- */

async function loadOrder(orderId: string) {
  const [row] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      userId: orders.userId,
      totalMinor: orders.totalMinor,
      currency: orders.presentmentCurrency,
      snapshot: orders.customerSnapshot,
      userPhone: users.phone,
      userName: users.name,
      userLocale: users.locale,
      userOptIn: users.whatsappOptIn,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, orderId))
    .limit(1)
  return row ?? null
}

type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>

function orderRecipient(order: LoadedOrder): Recipient {
  const snap = order.snapshot
  return {
    userId: order.userId,
    phone: snap?.phone || order.userPhone || null,
    consent: snap?.whatsappConsent === true || order.userOptIn === true,
    locale: messageLocale(snap?.locale ?? order.userLocale),
    name: (snap?.name || order.userName || '').trim(),
  }
}

export interface OrderTriggerOptions {
  /** One order item (booking/driver confirmation, a cancelled line). */
  itemId?: string | null
  /** Extra part of the dedupe key (e.g. a payment attempt). */
  suffix?: string
}

/**
 * Send one order automation. For `booking_confirmed` without an item, each
 * bookable line of the order gets its own message (a driver line gets
 * `driver_confirmed`); per-item keys keep a later item-level call silent.
 */
export async function triggerOrderAutomation(
  key: AutomationKey,
  orderId: string,
  options: OrderTriggerOptions = {},
): Promise<void> {
  try {
    const settings = await readWhatsappSettings()
    if (!settings.enabled) return
    const order = await loadOrder(orderId)
    if (!order) return
    const recipient = orderRecipient(order)
    const { locale } = recipient
    const orderLink = link(`/checkout/confirmation/${order.orderNumber}`, locale)
    const base = { name: recipient.name || '-', order: order.orderNumber, link: orderLink }

    if (
      key === 'booking_confirmed' ||
      key === 'driver_confirmed' ||
      key === 'itinerary_purchased'
    ) {
      const items = await db
        .select()
        .from(orderItems)
        .where(
          options.itemId
            ? and(eq(orderItems.orderId, orderId), eq(orderItems.id, options.itemId))
            : eq(orderItems.orderId, orderId),
        )
      for (const item of items) {
        if (item.parentItemId !== null) continue
        let itemKey: AutomationKey | null = null
        if (key === 'itinerary_purchased') {
          itemKey = item.kind === 'itinerary' ? 'itinerary_purchased' : null
        } else if (item.kind === 'driver') itemKey = 'driver_confirmed'
        else if (item.kind === 'activity' || item.kind === 'package') itemKey = 'booking_confirmed'
        if (itemKey === null || !isAutomationOn(settings, itemKey)) continue
        const activity = pick(item.nameSnapshot, locale)
        const vars: Record<string, string> = {
          ...base,
          activity,
          itinerary: activity,
          date: formatDay(item.travelDate, locale),
          time: formatTime(item.travelTime),
          people: String(item.guests ?? item.quantity),
          vehicle: activity,
          link: itemKey === 'itinerary_purchased' ? link('/account/schedules', locale) : orderLink,
        }
        await queueMessage(settings, itemKey, `${itemKey}:${item.id}`, recipient, vars, orderId)
      }
      return
    }

    if (!isAutomationOn(settings, key)) return
    const vars: Record<string, string> = {
      ...base,
      amount: formatMoney(order.totalMinor, order.currency, locale),
    }
    const dedupe = [key, orderId, options.itemId ?? '', options.suffix ?? '']
      .filter((part) => part !== '')
      .join(':')
    await queueMessage(settings, key, dedupe, recipient, vars, orderId)
  } catch (error) {
    console.error('[whatsapp] trigger failed', { key, orderId, error })
  }
}

/** Custom itinerary marked ready (Studio → Leads, status «completed»). */
export async function triggerCustomItineraryReady(requestId: string): Promise<void> {
  try {
    const settings = await readWhatsappSettings()
    if (!isAutomationOn(settings, 'custom_itinerary_ready')) return
    const [row] = await db
      .select({
        name: customTripRequests.name,
        phone: customTripRequests.phone,
        userId: customTripRequests.userId,
        userPhone: users.phone,
        userLocale: users.locale,
        optIn: users.whatsappOptIn,
      })
      .from(customTripRequests)
      .leftJoin(users, eq(users.id, customTripRequests.userId))
      .where(eq(customTripRequests.id, requestId))
      .limit(1)
    if (!row) return
    const locale = messageLocale(row.userLocale)
    const recipient: Recipient = {
      userId: row.userId,
      phone: row.phone || row.userPhone,
      consent: row.optIn === true,
      locale,
      name: row.name ?? '',
    }
    await queueMessage(
      settings,
      'custom_itinerary_ready',
      `custom_itinerary_ready:${requestId}`,
      recipient,
      { name: recipient.name || '-', link: link('/account/schedules', locale) },
      null,
    )
  } catch (error) {
    console.error('[whatsapp] custom ready trigger failed', { requestId, error })
  }
}

/* ---------------- The send job ---------------- */

export async function sendWithSettings(
  settings: WhatsappSettings,
  message: { to: string; text: string; locale: Locale; template: string | null; params: string[] },
): Promise<{ provider: string; result: SendResult }> {
  const creds = await resolveCredentials(settings)
  const provider = createProvider(creds)
  return { provider: provider.name, result: await provider.send(message) }
}

/** pg-boss `whatsapp.auto`. Throws only for a retryable provider failure. */
export async function deliverWhatsappMessage(messageId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.id, messageId))
    .limit(1)
  if (!row || row.status !== 'queued' || row.toPhone === null) return
  const settings = await readWhatsappSettings()
  const key = row.automation as AutomationKey
  if (!settings.enabled) {
    await db
      .update(whatsappMessages)
      .set({ status: 'skipped', error: 'disabled', updatedAt: new Date() })
      .where(eq(whatsappMessages.id, row.id))
    return
  }
  const locale = messageLocale(row.locale)
  const attempts = row.attempts + 1
  const { provider, result } = await sendWithSettings(settings, {
    to: row.toPhone,
    text: row.body ?? '',
    locale,
    template: automationTemplate(settings, key, locale),
    params: templateValues(key, row.vars),
  })
  if (result.ok) {
    await db
      .update(whatsappMessages)
      .set({
        status: 'sent',
        provider,
        providerMessageId: result.messageId,
        error: null,
        attempts,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, row.id))
    return
  }
  const retry = result.retryable && attempts < MAX_ATTEMPTS
  await db
    .update(whatsappMessages)
    .set({
      status: retry ? 'queued' : 'failed',
      provider,
      error: result.error.slice(0, 500),
      attempts,
      updatedAt: new Date(),
    })
    .where(eq(whatsappMessages.id, row.id))
  if (retry) throw new Error(`WhatsApp send failed (will retry): ${result.error}`)
}

/** Studio «retry»: back to the queue. */
export async function retryWhatsappMessage(messageId: string): Promise<boolean> {
  const rows = await db
    .update(whatsappMessages)
    .set({ status: 'queued', error: null, updatedAt: new Date() })
    .where(
      and(
        eq(whatsappMessages.id, messageId),
        inArray(whatsappMessages.status, ['failed', 'queued']),
        sql`${whatsappMessages.toPhone} is not null`,
      ),
    )
    .returning({ id: whatsappMessages.id })
  if (rows.length === 0) return false
  const { enqueueWaAuto } = await import('@/worker/queues')
  await enqueueWaAuto({ messageId })
  return true
}

/* ---------------- The sweep (every 10 minutes) ---------------- */

const START = sql`((oi.travel_date + coalesce(oi.travel_time, time '09:00')) at time zone 'Asia/Makassar')`
const LAST_DAY = sql`coalesce(oi.end_date, oi.travel_date)`

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query)
  return result as unknown as T[]
}

/**
 * Time-based automations, asked of the database each run (idempotent through
 * the dedupe keys). Windows are bounded, so the first run after enabling
 * does not message old bookings.
 */
export async function runWhatsappSweep(): Promise<Record<string, number>> {
  const settings = await readWhatsappSettings()
  const counts: Record<string, number> = {}
  if (!settings.enabled) return counts

  if (isAutomationOn(settings, 'trip_reminder')) {
    // 24 hours before the start (not for a booking made less than an hour before).
    const due = await rows<{ id: string; order_id: string }>(sql`
      select oi.id, oi.order_id from order_items oi join orders o on o.id = oi.order_id
      where oi.parent_item_id is null and oi.kind in ('activity','package','driver')
        and oi.booking_status in ('confirmed','sent_to_provider')
        and o.status not in ('cancelled','refunded','pending')
        and oi.travel_date is not null
        and ${START} > now() + interval '1 hour' and ${START} <= now() + interval '24 hours'
        and not exists (select 1 from whatsapp_messages w where w.dedupe_key = 'trip_reminder:' || oi.id::text)
      limit 200`)
    for (const item of due) await triggerItemTimed('trip_reminder', item.order_id, item.id)
    counts.trip_reminder = due.length
  }

  for (const key of ['trip_thanks', 'review_request'] as const) {
    if (!isAutomationOn(settings, key)) continue
    // Thanks: the evening of the (last) day, 20:00 Bali. Review: next day, 11:00 Bali.
    const at =
      key === 'trip_thanks'
        ? sql`((${LAST_DAY} + time '20:00') at time zone 'Asia/Makassar')`
        : sql`(((${LAST_DAY} + 1) + time '11:00') at time zone 'Asia/Makassar')`
    const due = await rows<{ id: string; order_id: string }>(sql`
      select distinct on (oi.order_id) oi.id, oi.order_id
      from order_items oi join orders o on o.id = oi.order_id
      where oi.parent_item_id is null and oi.kind in ('activity','package','driver')
        and oi.booking_status in ('confirmed','in_progress','completed')
        and o.status not in ('cancelled','refunded','pending')
        and oi.travel_date is not null
        and now() >= ${at} and now() < ${at} + interval '12 hours'
        and not exists (select 1 from whatsapp_messages w
          where w.dedupe_key = ${key}::text || ':' || oi.order_id::text || ':' || ${LAST_DAY}::text)
      order by oi.order_id, ${LAST_DAY} desc
      limit 200`)
    for (const item of due) await triggerItemTimed(key, item.order_id, item.id)
    counts[key] = due.length
  }

  if (isAutomationOn(settings, 'payment_incomplete')) {
    const minutes = settings.incompleteAfterMinutes
    const due = await rows<{ id: string }>(sql`
      select o.id from orders o
      where o.status = 'pending'
        and o.created_at <= now() - make_interval(mins => ${minutes})
        and o.created_at > now() - interval '24 hours'
        and not exists (select 1 from whatsapp_messages w where w.order_id = o.id
          and w.automation in ('payment_incomplete','payment_failed','payment_success'))
      limit 200`)
    for (const order of due) await triggerOrderAutomation('payment_incomplete', order.id)
    counts.payment_incomplete = due.length
  }

  // Lost enqueues (queue briefly down): put stale queued rows back.
  const stale = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.status, 'queued'),
        lt(whatsappMessages.updatedAt, new Date(Date.now() - 2 * 60 * 60 * 1000)),
        lt(whatsappMessages.attempts, MAX_ATTEMPTS),
        sql`${whatsappMessages.toPhone} is not null`,
      ),
    )
    .limit(100)
  if (stale.length > 0) {
    const { enqueueWaAuto } = await import('@/worker/queues')
    for (const row of stale) {
      await db
        .update(whatsappMessages)
        .set({ updatedAt: new Date() })
        .where(eq(whatsappMessages.id, row.id))
      await enqueueWaAuto({ messageId: row.id })
    }
  }
  counts.requeued = stale.length
  return counts
}

async function triggerItemTimed(
  key: 'trip_reminder' | 'trip_thanks' | 'review_request',
  orderId: string,
  itemId: string,
): Promise<void> {
  try {
    const settings = await readWhatsappSettings()
    const order = await loadOrder(orderId)
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, itemId)).limit(1)
    if (!order || !item) return
    const recipient = orderRecipient(order)
    const { locale } = recipient
    const lastDay = item.endDate ?? item.travelDate ?? ''
    const vars: Record<string, string> = {
      name: recipient.name || '-',
      order: order.orderNumber,
      activity: pick(item.nameSnapshot, locale),
      date: formatDay(item.travelDate, locale),
      time: formatTime(item.travelTime ?? '09:00'),
      link:
        key === 'review_request'
          ? link('/account/reviews', locale)
          : link(`/checkout/confirmation/${order.orderNumber}`, locale),
    }
    const dedupe = key === 'trip_reminder' ? `${key}:${item.id}` : `${key}:${orderId}:${lastDay}`
    await queueMessage(settings, key, dedupe, recipient, vars, orderId)
  } catch (error) {
    console.error('[whatsapp] timed trigger failed', { key, orderId, error })
  }
}
