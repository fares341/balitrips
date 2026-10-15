/**
 * The Studio (staff) assistant.
 *
 *   POST /api/studio-assistant   { message, conversationId? }  → NDJSON stream
 *
 * Staff only: `admin.access` (+ verified second factor when required). The
 * tools offered to the model are filtered by the caller's role, and every
 * tool re-checks its capability on each call. Writes come back as proposals
 * for /api/studio-assistant/confirm.
 */

import { NextResponse } from 'next/server'

import { adminHref } from '@/app/(admin)/_lib/admin-path'
import { getAdminLocale } from '@/app/(admin)/_lib/i18n'
import { loadRuntime } from '@/lib/assistant/config'
import { runAgent } from '@/lib/assistant/engine'
import { eventStream, jsonError, readJson, STREAM_HEADERS } from '@/lib/assistant/http'
import { cleanInput, dailyVerdict, STUDIO_LIMITS } from '@/lib/assistant/limits'
import { baliToday, studioSystemPrompt } from '@/lib/assistant/prompts'
import { checkSameOrigin, keyedHash } from '@/lib/assistant/request'
import { staffDeps } from '@/lib/assistant/staff-deps'
import { staffGate } from '@/lib/assistant/staff-session'
import { toolsFor, type StaffCtx } from '@/lib/assistant/staff-tools'
import {
  dailyState,
  loadHistory,
  openConversation,
  recordUsage,
  saveTurn,
} from '@/lib/assistant/store'
import { CAPABILITIES, can } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request): Promise<Response> {
  if (checkSameOrigin('POST', request.headers) !== 'ok') return jsonError(403, 'forbidden')
  const gate = await staffGate()
  if (!gate.ok) return jsonError(gate.status, gate.code)
  const session = gate.session

  const { status, runtime } = await loadRuntime('studio')
  if (status !== 'ok' || runtime === null) return jsonError(503, 'unavailable')

  const body = await readJson(request)
  if (body === null) return jsonError(400, 'bad_request')
  const message = cleanInput(body.message)
  if (message === null) return jsonError(400, 'bad_message')

  const limit = STUDIO_LIMITS.perUserPerMinute.hit(session.userId)
  if (!limit.ok) {
    return jsonError(429, 'rate_limited', {
      retryAfterSeconds: Math.max(1, Math.ceil(limit.retryAfterMs / 1000)),
    })
  }
  const verdict = dailyVerdict(await dailyState(null), {
    // Staff are not capped per IP; the global budget still applies.
    messagesPerIp: Number.MAX_SAFE_INTEGER,
    budgetUsd: runtime.settings.dailyBudgetUsd,
  })
  if (verdict !== 'ok') return jsonError(503, 'unavailable')

  const locale = await getAdminLocale()
  const conversation = await openConversation({
    kind: 'studio',
    conversationId: body.conversationId,
    ownerHash: keyedHash('owner', `studio:${session.userId}`),
    userId: session.userId,
    ipHash: null,
    locale,
  })
  const history = await loadHistory(conversation.id)
  await recordUsage(['global', 'studio'], { messages: 1, costMicros: 0 })

  const ctx: StaffCtx = {
    role: session.role,
    userId: session.userId,
    locale,
    conversationId: conversation.id,
    href: (path) => adminHref(path),
    deps: staffDeps,
  }
  const capabilities = CAPABILITIES.filter((capability) => can(session.role, capability))

  const stream = eventStream(async (emit) => {
    emit({ t: 'meta', conversationId: conversation.id })
    const result = await runAgent({
      runtime,
      system: studioSystemPrompt({ locale, role: session.role, capabilities, today: baliToday() }),
      history,
      userText: message,
      tools: toolsFor(session.role),
      ctx,
      emit,
      maxTokens: 1200,
      signal: request.signal,
    })
    await recordUsage(['global', 'studio'], { messages: 0, costMicros: result.usage.costMicros })
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

  return new NextResponse(stream, { headers: STREAM_HEADERS })
}
