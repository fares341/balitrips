/**
 * Inbound WhatsApp webhook — customer replies (STOP / START).
 *
 *   GET  /api/whatsapp/webhook  Meta's subscription check (hub.challenge),
 *        answered only with WHATSAPP_WEBHOOK_VERIFY_TOKEN.
 *   POST /api/whatsapp/webhook  a message event, from either provider:
 *        - Meta Cloud API: signed with the app secret
 *          (`X-Hub-Signature-256`, WHATSAPP_APP_SECRET);
 *        - Mazbot / others: the shared secret WHATSAPP_WEBHOOK_SECRET in the
 *          `X-Webhook-Secret` header or `?token=`.
 *        Unsigned or wrongly signed → 401; nothing configured → 503.
 *
 * Only whole-message STOP / START words act (src/lib/whatsapp/stop.ts);
 * every other message is acknowledged and ignored. Each provider message
 * id is handled once (`webhook_events`), so a redelivery changes nothing.
 * Answers 200 quickly: providers retry on anything else.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '@/db'
import { webhookEvents } from '@/db/schema'
import { recordError } from '@/lib/monitoring/errors'
import { consumeRateLimit } from '@/lib/rate-limit'
import { inboundTexts, parseStopCommand } from '@/lib/whatsapp/stop'
import { applyStopCommand } from '@/lib/whatsapp/stop-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY_BYTES = 512 * 1024

function reply(status: number, body: object): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function same(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()
  const token = url.searchParams.get('hub.verify_token') ?? ''
  if (expected && url.searchParams.get('hub.mode') === 'subscribe' && same(token, expected)) {
    return new Response(url.searchParams.get('hub.challenge') ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    })
  }
  return reply(403, { error: 'forbidden' })
}

/** Which check this request passes, or why not. */
function authorise(request: Request, body: string): 'ok' | 'unauthorised' | 'not_configured' {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim()
  const shared = process.env.WHATSAPP_WEBHOOK_SECRET?.trim()
  if (!appSecret && !shared) return 'not_configured'

  const signature = request.headers.get('x-hub-signature-256')
  if (appSecret && signature) {
    const expected = `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`
    return same(signature, expected) ? 'ok' : 'unauthorised'
  }
  if (shared) {
    const given =
      request.headers.get('x-webhook-secret') ??
      new URL(request.url).searchParams.get('token') ??
      ''
    return given !== '' && same(given, shared) ? 'ok' : 'unauthorised'
  }
  return 'unauthorised'
}

export async function POST(request: Request): Promise<NextResponse> {
  const limit = await consumeRateLimit('webhook', 'whatsapp-inbound')
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

  const auth = authorise(request, body)
  if (auth === 'not_configured') return reply(503, { error: 'not_configured' })
  if (auth === 'unauthorised') return reply(401, { error: 'invalid_signature' })

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return reply(400, { error: 'invalid_json' })
  }

  let handled = 0
  try {
    for (const message of inboundTexts(payload)) {
      const command = parseStopCommand(message.text)
      if (command === null) continue
      if (message.id) {
        const [fresh] = await db
          .insert(webhookEvents)
          .values({
            provider: 'whatsapp',
            providerEventId: message.id,
            eventType: `reply.${command}`,
            // No message text or number stored beyond what is needed.
            payload: { command },
          })
          .onConflictDoNothing()
          .returning({ id: webhookEvents.id })
        if (!fresh) continue
        try {
          await applyStopCommand(message, command)
        } catch (error) {
          // Let the provider's redelivery try again.
          await db.delete(webhookEvents).where(eq(webhookEvents.id, fresh.id))
          throw error
        }
      } else {
        await applyStopCommand(message, command)
      }
      handled += 1
    }
  } catch (error) {
    await recordError(error, { source: 'route', path: '/api/whatsapp/webhook' })
    // 500 so the provider redelivers (STOP/START are idempotent anyway).
    return reply(500, { error: 'failed' })
  }
  return reply(200, { received: true, handled })
}
