/**
 * Phase 4 — delivering a bought itinerary the moment the order is paid
 * (spec §3.3). Owner requirement: instantly by e-mail AND WhatsApp, and
 * always in the customer's account («جداولي»).
 *
 *  1. `queueItineraryDelivery(tx, orderId)` runs inside `applyPaidOrder`, in
 *     the transaction that records the money. Per itinerary line it inserts
 *     one `itinerary_deliveries` row per channel (UNIQUE item+channel) and,
 *     only for a row it actually created, queues the `email.send` job
 *     `{ kind: 'itinerary_delivery' }` through the same transaction. A
 *     replayed webhook, the reconcile sweep and Studio's «mark as paid» all
 *     hit the unique pair: one delivery, one e-mail.
 *  2. `runItineraryDelivery(job)` (worker) claims the e-mail row
 *     (queued → sending, atomically), issues a fresh download link, renders
 *     and sends the mail. A failed send goes back to `queued` and throws, so
 *     pg-boss retries with back-off; after MAX_ATTEMPTS it is `failed` and
 *     Studio shows it.
 *  3. WhatsApp goes through the existing automation `itinerary_purchased`
 *     (provider, approved template per language and consent all from Studio
 *     → WhatsApp). Its own `whatsapp_messages.dedupe_key` keeps it to one
 *     message per line. When WhatsApp is off or not configured the row here
 *     is `skipped` with the reason, so Studio says why nothing went out.
 *  4. Resends (customer, rate-limited; Studio, with confirmation) bump
 *     `round`, which gives the job a new singleton key and a new link that
 *     revokes the previous one.
 *
 * Nothing here ever throws into a payment.
 */

import { and, desc, eq, inArray, like, lt, or, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  itineraries,
  itineraryDeliveries,
  orderItems,
  orders,
  users,
  whatsappMessages,
} from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { isPlaceholderEmail } from '@/lib/auth/phone'
import { pick } from '@/lib/content/localize'
import { renderItineraryDeliveryEmail, sendEmail, toMailLocale } from '@/lib/email'
import { txExecutor, type TxExecutor } from '@/lib/orders/paid-paperwork'
import { logActivity } from '@/lib/security/activity'

import { issueDownloadToken } from './download-tokens'
import { readItinerarySales } from './sales-settings-store'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export const DELIVERY_CHANNELS = ['email', 'whatsapp'] as const
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number]
export type DeliveryStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'

export const MAX_EMAIL_ATTEMPTS = 5
/** A `sending` row older than this belongs to a crashed worker. */
const STALE_SENDING_MS = 10 * 60 * 1000
const JOB_SINGLETON_SECONDS = 60 * 60

/** Order statuses in which the buyer owns what they paid for. */
export const DELIVERABLE_ORDER: readonly string[] = ['paid', 'confirmed', 'partially_refunded']

export function deliveryJobKey(orderItemId: string, round: number): string {
  return `itinerary_delivery:${orderItemId}:${round}`
}

/** Routes the delivery links to. Kept here so the buyer pages can be re-pointed in one place. */
export const DELIVERY_PATHS = {
  account: '/account/schedules',
  view: (orderItemId: string) => `/account/schedules/${orderItemId}/view`,
  download: (orderItemId: string) => `/account/schedules/${orderItemId}/download`,
  /** Token link; route: src/app/[locale]/dl/[token]/route.ts */
  tokenDownload: (token: string) => `/dl/${token}`,
} as const

function origin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
}

export function absoluteLink(path: string, locale: Locale): string {
  return `${origin()}${getPathname({ href: path, locale })}`
}

/* ---------------- 1. On paid ---------------- */

export interface DeliverySender {
  send(
    data: { kind: 'itinerary_delivery'; orderItemId: string; round: number },
    options: { singletonKey: string; singletonSeconds: number; db?: TxExecutor },
  ): Promise<string | null>
}

async function defaultSender(): Promise<DeliverySender> {
  const { getBoss, QUEUES } = await import('@/worker/queues')
  const boss = await getBoss()
  return { send: (data, options) => boss.send(QUEUES.email, data, options) }
}

/**
 * Create the delivery rows and queue the e-mail job for every itinerary
 * line of `orderId`. Idempotent; never throws. Returns jobs queued.
 */
export async function queueItineraryDelivery(
  tx: Tx,
  orderId: string,
  sender?: DeliverySender,
): Promise<number> {
  let queued = 0
  try {
    const lines = await tx
      .select({ id: orderItems.id, status: orderItems.fulfilmentStatus })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, orderId), eq(orderItems.kind, 'itinerary')))
    const live = lines.filter((l) => l.status !== 'refunded' && l.status !== 'cancelled')
    if (live.length === 0) return 0
    const out = sender ?? (await defaultSender())
    await tx.transaction(async (sp) => {
      for (const line of live) {
        const created = await sp
          .insert(itineraryDeliveries)
          .values(
            DELIVERY_CHANNELS.map((channel) => ({
              orderItemId: line.id,
              channel,
              status: 'queued',
            })),
          )
          .onConflictDoNothing()
          .returning({ channel: itineraryDeliveries.channel })
        if (!created.some((row) => row.channel === 'email')) continue
        const job = await out.send(
          { kind: 'itinerary_delivery', orderItemId: line.id, round: 0 },
          {
            singletonKey: deliveryJobKey(line.id, 0),
            singletonSeconds: JOB_SINGLETON_SECONDS,
            db: txExecutor(sp),
          },
        )
        if (job) queued += 1
      }
    })
  } catch (error) {
    console.error('[delivery] could not queue itinerary delivery', { orderId, error })
    return 0
  }
  return queued
}

/* ---------------- 2. The job ---------------- */

async function loadLine(orderItemId: string) {
  const [row] = await db
    .select({
      item: orderItems,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      orderStatus: orders.status,
      snapshot: orders.customerSnapshot,
      userId: orders.userId,
      userEmail: users.email,
      userName: users.name,
      userLocale: users.locale,
      days: itineraries.days,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .leftJoin(users, eq(users.id, orders.userId))
    .leftJoin(itineraries, eq(itineraries.id, orderItems.refId))
    .where(eq(orderItems.id, orderItemId))
    .limit(1)
  return row ?? null
}

export function isDeliverable(line: {
  orderStatus: string
  item: { kind: string; fulfilmentStatus: string }
}): boolean {
  return (
    line.item.kind === 'itinerary' &&
    DELIVERABLE_ORDER.includes(line.orderStatus) &&
    line.item.fulfilmentStatus !== 'refunded' &&
    line.item.fulfilmentStatus !== 'cancelled'
  )
}

async function setRow(
  orderItemId: string,
  channel: DeliveryChannel,
  values: Partial<typeof itineraryDeliveries.$inferInsert>,
): Promise<void> {
  await db
    .update(itineraryDeliveries)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(itineraryDeliveries.orderItemId, orderItemId),
        eq(itineraryDeliveries.channel, channel),
      ),
    )
}

export interface DeliveryJob {
  orderItemId: string
  round: number
}

/**
 * `email.send` → `itinerary_delivery`. Throws only to ask pg-boss for a
 * retry of a failed send.
 */
export async function runItineraryDelivery(job: DeliveryJob, now = new Date()): Promise<void> {
  const { orderItemId, round } = job
  const [claimed] = await db
    .update(itineraryDeliveries)
    .set({
      status: 'sending',
      attempts: sql`${itineraryDeliveries.attempts} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(itineraryDeliveries.orderItemId, orderItemId),
        eq(itineraryDeliveries.channel, 'email'),
        eq(itineraryDeliveries.round, round),
        or(
          eq(itineraryDeliveries.status, 'queued'),
          and(
            eq(itineraryDeliveries.status, 'sending'),
            lt(itineraryDeliveries.updatedAt, new Date(now.getTime() - STALE_SENDING_MS)),
          ),
        ),
      ),
    )
    .returning({ attempts: itineraryDeliveries.attempts })
  // Already sent, being sent, or superseded by a newer round: nothing to do.
  if (!claimed) return

  const line = await loadLine(orderItemId)
  if (line === null || !isDeliverable(line)) {
    await setRow(orderItemId, 'email', { status: 'skipped', error: 'not_paid' })
    return
  }

  const locale = toMailLocale(line.snapshot?.locale ?? line.userLocale)
  const to = (line.snapshot?.email || line.userEmail || '').trim()
  const name = (line.snapshot?.name || line.userName || '').trim() || null
  const itineraryName = pick(line.item.nameSnapshot, locale)

  if (round === 0) await ensureWhatsappDelivery(line.orderId, orderItemId)

  if (to === '' || isPlaceholderEmail(to)) {
    await setRow(orderItemId, 'email', { status: 'skipped', error: 'no_email', recipient: null })
    await logDelivery(line.userId, 'email_skipped', orderItemId, line.orderNumber, { round })
    return
  }

  const settings = await readItinerarySales()
  let pdfUrl: string | null = null
  try {
    const issued = await issueDownloadToken(
      orderItemId,
      { validDays: settings.linkValidDays, maxUses: settings.linkMaxUses },
      now,
    )
    pdfUrl = absoluteLink(DELIVERY_PATHS.tokenDownload(issued.token), locale)
  } catch (error) {
    // No link is better than no e-mail: the account button still works.
    console.error('[delivery] could not issue a download link', { orderItemId, error })
  }

  const rendered = renderItineraryDeliveryEmail({
    locale,
    name,
    orderNumber: line.orderNumber,
    itineraryName,
    days: line.days,
    openUrl: absoluteLink(DELIVERY_PATHS.view(orderItemId), locale),
    pdfUrl,
    linkValidDays: settings.linkValidDays,
    linkMaxUses: settings.linkMaxUses,
  })
  const result = await sendEmail({ to, ...rendered })

  if (result.delivered) {
    await setRow(orderItemId, 'email', {
      status: 'sent',
      sentAt: new Date(),
      error: null,
      recipient: to,
    })
    await logDelivery(line.userId, 'email_sent', orderItemId, line.orderNumber, { round })
    return
  }

  const error = (result.error ?? 'send failed').slice(0, 500)
  if (claimed.attempts >= MAX_EMAIL_ATTEMPTS) {
    await setRow(orderItemId, 'email', { status: 'failed', error, recipient: to })
    await logDelivery(line.userId, 'email_failed', orderItemId, line.orderNumber, { round, error })
    return
  }
  await setRow(orderItemId, 'email', { status: 'queued', error, recipient: to })
  throw new Error(`itinerary delivery e-mail failed (will retry): ${error}`)
}

async function logDelivery(
  userId: string | null,
  event: string,
  orderItemId: string,
  orderNumber: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await logActivity({
    action: 'itinerary_delivery',
    userId,
    details: { event, orderItemId, orderNumber, ...extra },
  })
}

/* ---------------- 3. WhatsApp ---------------- */

/**
 * Queue the WhatsApp message (or record why it cannot go). `suffix` makes a
 * resend a new message; without it the automation's dedupe key holds.
 */
export async function ensureWhatsappDelivery(
  orderId: string,
  orderItemId: string,
  suffix?: string,
): Promise<DeliveryStatus> {
  try {
    const { readWhatsappSettings, isAutomationOn } = await import('@/lib/whatsapp/settings')
    const settings = await readWhatsappSettings()
    if (!isAutomationOn(settings, 'itinerary_purchased')) {
      const reason = settings.enabled ? 'automation_off' : 'not_configured'
      await upsertRow(orderItemId, 'whatsapp', { status: 'skipped', error: reason })
      console.info('[delivery] WhatsApp skipped', { orderItemId, reason })
      return 'skipped'
    }
    const { triggerOrderAutomation } = await import('@/lib/whatsapp/dispatch')
    await triggerOrderAutomation('itinerary_purchased', orderId, { itemId: orderItemId, suffix })
    await upsertRow(orderItemId, 'whatsapp', { status: 'queued', error: null })
    return 'queued'
  } catch (error) {
    console.error('[delivery] WhatsApp step failed', { orderItemId, error })
    return 'failed'
  }
}

async function upsertRow(
  orderItemId: string,
  channel: DeliveryChannel,
  values: { status: DeliveryStatus; error: string | null },
): Promise<void> {
  await db
    .insert(itineraryDeliveries)
    .values({ orderItemId, channel, ...values })
    .onConflictDoUpdate({
      target: [itineraryDeliveries.orderItemId, itineraryDeliveries.channel],
      set: { ...values, updatedAt: new Date() },
    })
}

/* ---------------- 4. Resend ---------------- */

export type ResendOutcome = 'queued' | 'busy' | 'not_deliverable'

/**
 * Send the itinerary again. The caller has checked who may ask (owner with a
 * rate limit, or staff). Email gets a new round (new link, old one revoked);
 * WhatsApp a new message.
 */
export async function resendItineraryDelivery(
  orderItemId: string,
  channels: readonly DeliveryChannel[],
  requestedById: string | null,
  enqueue?: DeliverySender,
): Promise<ResendOutcome> {
  const line = await loadLine(orderItemId)
  if (line === null || !isDeliverable(line)) return 'not_deliverable'

  if (channels.includes('email')) {
    await db
      .insert(itineraryDeliveries)
      .values({ orderItemId, channel: 'email', status: 'skipped', round: -1 })
      .onConflictDoNothing()
    const [row] = await db
      .update(itineraryDeliveries)
      .set({
        status: 'queued',
        round: sql`${itineraryDeliveries.round} + 1`,
        attempts: 0,
        error: null,
        requestedById,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(itineraryDeliveries.orderItemId, orderItemId),
          eq(itineraryDeliveries.channel, 'email'),
          sql`${itineraryDeliveries.status} <> 'sending'`,
        ),
      )
      .returning({ round: itineraryDeliveries.round })
    if (!row) return 'busy'
    const out = enqueue ?? (await defaultSender())
    await out.send(
      { kind: 'itinerary_delivery', orderItemId, round: row.round },
      {
        singletonKey: deliveryJobKey(orderItemId, row.round),
        singletonSeconds: JOB_SINGLETON_SECONDS,
      },
    )
  }

  if (channels.includes('whatsapp')) {
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(whatsappMessages)
      .where(like(whatsappMessages.dedupeKey, `itinerary_purchased:${orderItemId}%`))
    await ensureWhatsappDelivery(line.orderId, orderItemId, `r${n}`)
  }

  await logDelivery(line.userId, 'resend', orderItemId, line.orderNumber, {
    channels,
    by: requestedById,
  })
  return 'queued'
}

/* ---------------- Status (Studio, success page, account) ---------------- */

export interface ChannelState {
  status: DeliveryStatus | 'pending'
  at: Date | null
  error: string | null
  recipient: string | null
}

export interface ItemDelivery {
  email: ChannelState
  whatsapp: ChannelState
  round: number
}

const PENDING: ChannelState = { status: 'pending', at: null, error: null, recipient: null }

function waStatus(status: string): DeliveryStatus {
  if (status === 'sent' || status === 'failed' || status === 'skipped') return status
  return 'queued'
}

/** Delivery state per order item. WhatsApp's live status is the automation's own row. */
export async function loadDeliveryState(
  orderItemIds: readonly string[],
): Promise<Map<string, ItemDelivery>> {
  const map = new Map<string, ItemDelivery>()
  if (orderItemIds.length === 0) return map
  const ids = [...orderItemIds]
  const [rows, messages] = await Promise.all([
    db.select().from(itineraryDeliveries).where(inArray(itineraryDeliveries.orderItemId, ids)),
    db
      .select({
        dedupeKey: whatsappMessages.dedupeKey,
        status: whatsappMessages.status,
        error: whatsappMessages.error,
        sentAt: whatsappMessages.sentAt,
        updatedAt: whatsappMessages.updatedAt,
        toPhone: whatsappMessages.toPhone,
      })
      .from(whatsappMessages)
      .where(or(...ids.map((id) => like(whatsappMessages.dedupeKey, `itinerary_purchased:${id}%`))))
      .orderBy(desc(whatsappMessages.createdAt)),
  ])
  for (const id of ids) {
    const email = rows.find((r) => r.orderItemId === id && r.channel === 'email')
    const wa = rows.find((r) => r.orderItemId === id && r.channel === 'whatsapp')
    const message = messages.find((m) => m.dedupeKey.startsWith(`itinerary_purchased:${id}`))
    map.set(id, {
      round: Math.max(email?.round ?? 0, 0),
      email: email
        ? {
            status: email.status as DeliveryStatus,
            at: email.sentAt ?? email.updatedAt,
            error: email.error,
            recipient: email.recipient,
          }
        : PENDING,
      whatsapp: message
        ? {
            status: waStatus(message.status),
            at: message.sentAt ?? message.updatedAt,
            error: message.error,
            recipient: message.toPhone,
          }
        : wa
          ? {
              status: wa.status as DeliveryStatus,
              at: wa.updatedAt,
              error: wa.error,
              recipient: null,
            }
          : PENDING,
    })
  }
  return map
}
