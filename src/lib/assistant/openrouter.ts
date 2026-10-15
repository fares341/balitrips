/**
 * OpenRouter chat completions over plain `fetch`, streamed.
 *
 * No SDK (no new dependencies). What every call sends:
 *
 *   - `models: [primary, fallback]` — OpenRouter tries the second when the
 *     first is down, rate-limited or refuses the request;
 *   - `provider: { data_collection: 'deny' }` — only providers that do not
 *     store or train on prompts are used;
 *   - `HTTP-Referer` and `X-Title` — app attribution on openrouter.ai;
 *   - `max_tokens` — a hard cap on what one answer can cost;
 *   - `usage: { include: true }` — the real cost of the call, for the budget.
 *
 * Timeouts: 45 s for the whole call and 20 s of silence between chunks; either
 * aborts the request. The key is sent in the Authorization header and never
 * logged; error messages from the provider are truncated and never echoed to
 * a visitor.
 */

import { CompletionAccumulator, SseParser } from './sse'

export interface ChatToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ToolDefinition {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface CompletionRequest {
  apiKey: string
  baseUrl: string
  models: readonly string[]
  siteUrl: string
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  toolChoice?: 'auto' | 'none'
  maxTokens: number
  signal?: AbortSignal
  onDelta?: (text: string) => void
  /** Injected in tests. */
  fetchImpl?: typeof fetch
}

export interface CompletionResult {
  ok: boolean
  /** Short machine code when !ok: `http_429`, `timeout`, `network`, `provider`. */
  error: string | null
  acc: CompletionAccumulator
}

const TOTAL_TIMEOUT_MS = 45_000
const IDLE_TIMEOUT_MS = 20_000

export function buildRequestBody(request: Omit<CompletionRequest, 'apiKey' | 'signal'>) {
  return {
    models: [...request.models],
    messages: request.messages,
    ...(request.tools && request.tools.length > 0
      ? { tools: request.tools, tool_choice: request.toolChoice ?? 'auto' }
      : {}),
    stream: true,
    max_tokens: request.maxTokens,
    temperature: 0.3,
    provider: { data_collection: 'deny' },
    usage: { include: true },
  }
}

export async function streamCompletion(request: CompletionRequest): Promise<CompletionResult> {
  const acc = new CompletionAccumulator()
  const controller = new AbortController()
  const state: { reason: 'timeout' | 'idle' | null } = { reason: null }
  const total = setTimeout(() => {
    state.reason = 'timeout'
    controller.abort()
  }, TOTAL_TIMEOUT_MS)
  let idle: ReturnType<typeof setTimeout> | null = null
  const resetIdle = () => {
    if (idle !== null) clearTimeout(idle)
    idle = setTimeout(() => {
      state.reason = 'idle'
      controller.abort()
    }, IDLE_TIMEOUT_MS)
  }
  const onOuterAbort = () => controller.abort()
  request.signal?.addEventListener('abort', onOuterAbort, { once: true })

  const doFetch = request.fetchImpl ?? fetch
  try {
    resetIdle()
    const response = await doFetch(`${request.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'HTTP-Referer': request.siteUrl,
        'X-Title': 'Bali Trips',
      },
      body: JSON.stringify(buildRequestBody(request)),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok || response.body === null) {
      // Drain a little of the body for the server log, never the visitor.
      const detail = await response.text().catch(() => '')
      console.warn(
        `[assistant] provider HTTP ${response.status}: ${detail.replace(/\s+/g, ' ').slice(0, 160)}`,
      )
      return { ok: false, error: `http_${response.status}`, acc }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const parser = new SseParser()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      resetIdle()
      for (const event of parser.feed(decoder.decode(value, { stream: true }))) {
        const delta = acc.push(event.data)
        if (delta !== '') request.onDelta?.(delta)
      }
    }
    for (const event of parser.feed(decoder.decode())) {
      const delta = acc.push(event.data)
      if (delta !== '') request.onDelta?.(delta)
    }
    for (const event of parser.flush()) {
      const delta = acc.push(event.data)
      if (delta !== '') request.onDelta?.(delta)
    }

    if (acc.error !== null) {
      console.warn(`[assistant] provider error in stream: ${acc.error}`)
      return { ok: false, error: 'provider', acc }
    }
    return { ok: true, error: null, acc }
  } catch (error) {
    if (state.reason !== null) return { ok: false, error: 'timeout', acc }
    if (request.signal?.aborted) return { ok: false, error: 'aborted', acc }
    console.warn(`[assistant] network error: ${error instanceof Error ? error.name : 'unknown'}`)
    return { ok: false, error: 'network', acc }
  } finally {
    clearTimeout(total)
    if (idle !== null) clearTimeout(idle)
    request.signal?.removeEventListener('abort', onOuterAbort)
  }
}
