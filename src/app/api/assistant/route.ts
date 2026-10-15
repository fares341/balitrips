/**
 * The website assistant.
 *
 *   GET  /api/assistant?locale=ar   → is it available? (+ the welcome text)
 *   POST /api/assistant             → { message, conversationId?, locale }
 *                                     streams NDJSON events (see engine.ts)
 *
 * Order of checks on POST (cheapest and most important first): same-origin
 * and JSON → configured and switched on → body shape and length → burst
 * limits (IP, browser session) → daily caps (IP messages, global budget) →
 * only then the model. The caller's identity (session, entitlements, cart) is
 * resolved here on the server and handed to the tools; nothing the client or
 * the model says can change it.
 */

import { NextResponse } from 'next/server'

import { localeOf, viewer } from '@/app/api/places/_viewer'
import { loadRuntime } from '@/lib/assistant/config'
import { runAgent } from '@/lib/assistant/engine'
import {
  eventStream,
  jsonError,
  NO_STORE,
  ownerToken,
  readJson,
  setOwnerCookie,
  STREAM_HEADERS,
} from '@/lib/assistant/http'
import { cleanInput, dailyVerdict, PUBLIC_LIMITS } from '@/lib/assistant/limits'
import { baliToday, publicSystemPrompt } from '@/lib/assistant/prompts'
import { publicDeps } from '@/lib/assistant/public-deps'
import { PUBLIC_TOOLS, type PublicCtx } from '@/lib/assistant/public-tools'
import { checkSameOrigin, keyedHash } from '@/lib/assistant/request'
import {
  dailyState,
  ipScope,
  loadHistory,
  openConversation,
  recordUsage,
  saveTurn,
} from '@/lib/assistant/store'
import { clientIp } from '@/lib/security/ip'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request): Promise<NextResponse> {
  const locale = localeOf(new URL(request.url).searchParams.get('locale'))
  const { status, settings } = await loadRuntime('public')
  const welcome = settings.welcome[locale]?.trim() || null
  // Booleans only: whether a key exists is all a browser ever learns about it.
  return NextResponse.json(
    { available: status === 'ok', welcome: status === 'ok' ? welcome : null },
    { headers: NO_STORE },
  )
}

export async function POST(request: Request): Promise<Response> {
  if (checkSameOrigin('POST', request.headers) !== 'ok') return jsonError(403, 'forbidden')

  const { status, runtime } = await loadRuntime('public')
  if (status !== 'ok' || runtime === null) return jsonError(503, 'unavailable')

  const body = await readJson(request)
  if (body === null) return jsonError(400, 'bad_request')
  const message = cleanInput(body.message)
  if (message === null) {
    return jsonError(
      400,
      typeof body.message === 'string' && body.message.trim() !== '' ? 'too_long' : 'empty',
    )
  }
  const locale = localeOf(typeof body.locale === 'string' ? body.locale : null)

  const owner = ownerToken(request)
  const ownerHash = keyedHash('owner', owner.token)
  const ip = clientIp(request.headers)
  const ipHash = keyedHash('ip', ip ?? 'unknown')

  for (const check of [
    PUBLIC_LIMITS.perIpPerMinute.hit(ipHash),
    PUBLIC_LIMITS.perSessionPer10Min.hit(ownerHash),
  ]) {
    if (!check.ok) {
      return jsonError(429, 'rate_limited', {
        retryAfterSeconds: Math.max(1, Math.ceil(check.retryAfterMs / 1000)),
      })
    }
  }

  const verdict = dailyVerdict(await dailyState(ipHash), {
    messagesPerIp: runtime.settings.dailyMessagesPerIp,
    budgetUsd: runtime.settings.dailyBudgetUsd,
  })
  if (verdict === 'ip_cap') return jsonError(429, 'daily_cap')
  if (verdict === 'budget') return jsonError(503, 'unavailable')

  // Same identity source as the map: a banned account, a removed device or an
  // ended session is a guest here too.
  const who = await viewer('assistant')
  const conversation = await openConversation({
    kind: 'public',
    conversationId: body.conversationId,
    ownerHash,
    userId: who.userId,
    ipHash,
    locale,
  })
  const history = await loadHistory(conversation.id)
  await recordUsage(['global', ipScope(ipHash)], { messages: 1, costMicros: 0 })

  const ctx: PublicCtx = {
    locale,
    userId: who.userId,
    held: who.held,
    conversationId: conversation.id,
    deps: publicDeps,
  }

  const stream = eventStream(async (emit) => {
    emit({ t: 'meta', conversationId: conversation.id })
    const result = await runAgent({
      runtime,
      system: publicSystemPrompt({ locale, signedIn: who.userId !== null, today: baliToday() }),
      history,
      userText: message,
      tools: PUBLIC_TOOLS,
      ctx,
      emit,
      maxTokens: 700,
      signal: request.signal,
    })
    await recordUsage(['global', ipScope(ipHash)], {
      messages: 0,
      costMicros: result.usage.costMicros,
    })
    if (result.text.trim() !== '' || result.ok) {
      await saveTurn({
        conversationId: conversation.id,
        userText: message,
        replyText: result.text,
        tools: result.tools,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        costMicros: result.usage.costMicros,
        model: result.usage.model,
      })
    }
    if (!result.ok) {
      emit({ t: 'error', code: result.error === 'timeout' ? 'timeout' : 'provider' })
      return
    }
    emit({ t: 'done', conversationId: conversation.id })
  })

  const response = new NextResponse(stream, { headers: STREAM_HEADERS })
  if (owner.fresh) setOwnerCookie(response, owner.token)
  return response
}
