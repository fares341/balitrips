/**
 * Phase 6: inbound webhooks from a supplier connection.
 *
 *   POST /api/integrations/<connection id>/webhook
 *
 * 1. The connection must exist, have a signing secret and not be paused
 *    (paused → 503, so the supplier retries later instead of losing events).
 * 2. The signature is checked on the RAW body (src/lib/integrations/webhook.ts,
 *    or the adapter's own `verifyWebhook`). A bad signature is 401 and is
 *    logged without counting as a connection failure (it is not the
 *    supplier failing — it may be anyone).
 * 3. The event is stored once: `webhook_events` is unique on
 *    (provider, provider_event_id), so a redelivery answers 200 "duplicate"
 *    and nothing runs twice.
 * 4. The work happens in the worker (`integration.webhook`), with retries,
 *    backoff and a dead-letter queue. This handler only acknowledges.
 */

import { NextResponse } from 'next/server'

import { db } from '@/db'
import { webhookEvents } from '@/db/schema'
import { adapterFor } from '@/lib/integrations/registry'
import { loadAdapterContext, logIntegration } from '@/lib/integrations/service'
import {
  EVENT_ID_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyWebhookSignature,
  WEBHOOK_PROVIDER,
  webhookEventKey,
  webhookEventRowId,
} from '@/lib/integrations/webhook'
import { recordError } from '@/lib/monitoring/errors'
import { consumeRateLimit } from '@/lib/rate-limit'
import { enqueueIntegrationWebhook } from '@/worker/queues'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY_BYTES = 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function reply(status: number, body: object): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function parsePayload(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return { text: body.slice(0, 20_000) }
  }
}

function eventTypeOf(headers: Headers, payload: unknown): string | null {
  const fromHeader = headers.get('x-bali-event-type')
  const fromBody =
    typeof payload === 'object' && payload !== null
      ? ((payload as Record<string, unknown>).type ?? (payload as Record<string, unknown>).event)
      : null
  const value = fromHeader ?? (typeof fromBody === 'string' ? fromBody : null)
  return value ? value.replace(/[^\w.:-]/g, '').slice(0, 64) || null : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  if (!UUID.test(id)) return reply(404, { error: 'not_found' })

  const limit = await consumeRateLimit('webhook', id)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    )
  }

  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY_BYTES) return reply(413, { error: 'too_large' })
  const body = await request.text()
  if (Buffer.byteLength(body) > MAX_BODY_BYTES) return reply(413, { error: 'too_large' })

  let loaded
  try {
    loaded = await loadAdapterContext(id)
  } catch (error) {
    // Usually INTEGRATIONS_KEY missing or changed: the secret cannot be opened.
    await recordError(error, { source: 'route', path: '/api/integrations/[id]/webhook' })
    return reply(503, { error: 'unavailable' })
  }
  if (loaded === null || loaded.webhookSecret === null) return reply(404, { error: 'not_found' })
  if (loaded.status === 'paused') return reply(503, { error: 'paused' })

  const adapter = adapterFor(loaded.context.integration.connectionType)
  const check = adapter.verifyWebhook
    ? adapter.verifyWebhook(loaded.context, { body, headers: request.headers })
    : verifyWebhookSignature({
        secret: loaded.webhookSecret,
        body,
        signature: request.headers.get(SIGNATURE_HEADER),
        timestamp: request.headers.get(TIMESTAMP_HEADER),
      })
  if (!check.ok) {
    await logIntegration({
      integrationId: id,
      direction: 'in',
      operation: 'webhook.receive',
      status: 'error',
      httpStatus: 401,
      error: `signature: ${check.reason}`,
      payload: body,
      counts: false,
    })
    return reply(401, { error: 'invalid_signature' })
  }

  const started = Date.now()
  const payload = parsePayload(body)
  const key = webhookEventKey(request.headers.get(EVENT_ID_HEADER), body)
  const [stored] = await db
    .insert(webhookEvents)
    .values({
      provider: WEBHOOK_PROVIDER,
      providerEventId: webhookEventRowId(id, key),
      eventType: eventTypeOf(request.headers, payload),
      payload,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id })

  if (!stored) {
    await logIntegration({
      integrationId: id,
      direction: 'in',
      operation: 'webhook.receive',
      status: 'skipped',
      httpStatus: 200,
      payload: body,
      details: { duplicate: true },
    })
    return reply(200, { received: true, duplicate: true })
  }

  const jobId = await enqueueIntegrationWebhook(
    { integrationId: id, webhookEventId: stored.id },
    { retryLimit: loaded.retryLimit, retryDelaySeconds: loaded.retryDelaySeconds },
  )
  await logIntegration({
    integrationId: id,
    direction: 'in',
    operation: 'webhook.receive',
    status: 'ok',
    httpStatus: 200,
    durationMs: Date.now() - started,
    payload: body,
    // Not counted as a sync success: the event has only been accepted.
    counts: false,
    details: { queued: jobId !== null },
  })
  return reply(200, { received: true })
}
