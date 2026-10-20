import { and, eq, gte, inArray, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { analyticsEvents, orders } from '@/db/schema'

import { metaPayload, tiktokPayload, type Candidate } from './capi-payload'
import { readSecret } from './secrets'
import { readMarketingSettings, type MarketingSettings } from './settings'

/**
 * Purchases to the ad platforms' server APIs (Meta Conversions API, TikTok
 * Events API).
 *
 * Only purchases of visitors who accepted MARKETING cookies at checkout
 * (`consent_marketing`), only while the admin has switched the API on and a
 * token is stored, and only within two days of the purchase.
 *
 * The browser pixel reports the same purchase with the same `event_id`
 * (`serverEventId('purchase', orderId)`), which both platforms use to keep
 * one of the two. What is sent: the event id and time, the value and
 * currency, a hashed visitor id, and — marketing consent only — the
 * SHA-256 of the normalised email and phone. Never a name, never plain text.
 */

const WINDOW_MS = 2 * 24 * 60 * 60 * 1000
const BATCH = 50

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const text = (await response.text()).slice(0, 300)
    throw new Error(`HTTP ${response.status}: ${text}`)
  }
}

export interface ForwardResult {
  sent: number
  skipped: string | null
}

export async function forwardPurchases(settings?: MarketingSettings): Promise<ForwardResult> {
  const config = settings ?? (await readMarketingSettings())
  const metaOn = config.metaEnabled && config.metaCapiEnabled && config.metaPixelId !== ''
  const tiktokOn =
    config.tiktokEnabled && config.tiktokEventsApiEnabled && config.tiktokPixelId !== ''
  if (!metaOn && !tiktokOn) return { sent: 0, skipped: 'off' }

  const [metaToken, tiktokToken] = await Promise.all([
    metaOn ? readSecret('meta_capi_token') : Promise.resolve(null),
    tiktokOn ? readSecret('tiktok_events_token') : Promise.resolve(null),
  ])
  if (!metaToken && !tiktokToken) return { sent: 0, skipped: 'no_token' }

  const rows = await db
    .select({
      id: analyticsEvents.id,
      eventId: analyticsEvents.eventId,
      createdAt: analyticsEvents.createdAt,
      valueMinor: analyticsEvents.valueMinor,
      currency: analyticsEvents.currency,
      anonId: analyticsEvents.anonId,
      orderId: analyticsEvents.orderId,
      customer: orders.customerSnapshot,
    })
    .from(analyticsEvents)
    .leftJoin(orders, eq(orders.id, analyticsEvents.orderId))
    .where(
      and(
        eq(analyticsEvents.name, 'purchase'),
        eq(analyticsEvents.source, 'server'),
        eq(analyticsEvents.consentMarketing, true),
        isNull(analyticsEvents.forwardedAt),
        gte(analyticsEvents.createdAt, new Date(Date.now() - WINDOW_MS)),
      ),
    )
    .limit(BATCH)
  if (rows.length === 0) return { sent: 0, skipped: null }

  const candidates: Candidate[] = rows.map((row) => ({
    id: row.id,
    eventId: row.eventId,
    createdAt: row.createdAt,
    valueMinor: row.valueMinor,
    currency: row.currency,
    anonId: row.anonId,
    orderId: row.orderId,
    email: row.customer?.email ?? null,
    phone: row.customer?.phone ?? null,
  }))

  let ok = true
  if (metaOn && metaToken) {
    try {
      await postJson(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(config.metaPixelId)}/events?access_token=${encodeURIComponent(metaToken)}`,
        { data: candidates.map(metaPayload) },
      )
    } catch (error) {
      ok = false
      console.error('[analytics] Meta Conversions API refused the batch', String(error))
    }
  }
  if (tiktokOn && tiktokToken) {
    try {
      await postJson(
        'https://business-api.tiktok.com/open_api/v1.3/event/track/',
        {
          event_source: 'web',
          event_source_id: config.tiktokPixelId,
          data: candidates.map(tiktokPayload),
        },
        { 'Access-Token': tiktokToken },
      )
    } catch (error) {
      ok = false
      console.error('[analytics] TikTok Events API refused the batch', String(error))
    }
  }
  if (!ok) return { sent: 0, skipped: 'error' }

  await db
    .update(analyticsEvents)
    .set({ forwardedAt: new Date() })
    .where(
      inArray(
        analyticsEvents.id,
        candidates.map((c) => c.id),
      ),
    )
  return { sent: candidates.length, skipped: null }
}
