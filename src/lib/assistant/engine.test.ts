import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { AssistantRuntime } from './config'
import { runAgent, type AssistantTool, type StreamEvent } from './engine'
import { buildRequestBody } from './openrouter'

const runtime: AssistantRuntime = {
  apiKey: 'sk-or-test-key',
  baseUrl: 'https://openrouter.test/api/v1',
  models: ['google/gemini-2.5-flash', 'openai/gpt-6-luna'],
  siteUrl: 'https://balitrips.co',
  settings: {
    publicEnabled: true,
    studioEnabled: true,
    model: '',
    fallbackModel: '',
    dailyMessagesPerIp: 40,
    dailyBudgetUsd: 5,
    welcome: { en: '', ar: '', id: '' },
  },
}

/** An SSE response body, delivered in awkward chunks (split mid-line). */
function sse(chunks: string[]): Response {
  const body = chunks.map((c) => `data: ${c}\n\n`).join('') + 'data: [DONE]\n\n'
  const bytes = new TextEncoder().encode(body)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const delta = (d: Record<string, unknown>) =>
  JSON.stringify({ model: 'google/gemini-2.5-flash', choices: [{ delta: d }] })

interface Ctx {
  userId: string
}

const echoTool: AssistantTool<Ctx> = {
  name: 'whoami',
  description: 'test',
  parameters: { type: 'object', properties: {} },
  schema: z.object({ n: z.number().int().optional() }),
  run: (async (_args: unknown, ctx: Ctx) => ({ data: { user: ctx.userId } })) as never,
}

describe('runAgent', () => {
  it('streams text, runs a tool call, feeds the result back and finishes', async () => {
    const requests: { url: string; init: RequestInit }[] = []
    const responses = [
      sse([
        delta({ content: 'Let me check. ' }),
        delta({
          tool_calls: [
            { index: 0, id: 'call_a', function: { name: 'whoami', arguments: '{"n":' } },
          ],
        }),
        delta({ tool_calls: [{ index: 0, function: { arguments: '1}' } }] }),
        JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.00001 },
        }),
      ]),
      sse([
        delta({ content: 'You are ' }),
        delta({ content: 'user-7.' }),
        JSON.stringify({ choices: [], usage: { prompt_tokens: 150, completion_tokens: 5 } }),
      ]),
    ]
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      const next = responses.shift()
      if (!next) throw new Error('no more responses')
      return next
    }) as unknown as typeof fetch

    const events: StreamEvent[] = []
    const result = await runAgent({
      runtime,
      system: 'SYSTEM',
      history: [
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'reply' },
      ],
      userText: 'who am I?',
      tools: [echoTool],
      ctx: { userId: 'user-7' },
      emit: (event) => events.push(event),
      maxTokens: 300,
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.text).toBe('Let me check. \n\nYou are user-7.')
    expect(result.tools).toEqual(['whoami'])
    expect(result.usage.tokensIn).toBe(250)
    expect(result.usage.costMicros).toBe(10 + Math.round(150 * 0.3 + 5 * 2.5))
    expect(events.filter((e) => e.t === 'tool')).toEqual([{ t: 'tool', name: 'whoami' }])

    // The request: both models, no data collection, caps, attribution, key in the header only.
    expect(requests[0]?.url).toBe('https://openrouter.test/api/v1/chat/completions')
    const headers = requests[0]?.init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-or-test-key')
    expect(headers['HTTP-Referer']).toBe('https://balitrips.co')
    expect(headers['X-Title']).toBe('Bali Trips')
    const first = JSON.parse(String(requests[0]?.init.body))
    expect(first.models).toEqual(['google/gemini-2.5-flash', 'openai/gpt-6-luna'])
    expect(first.provider).toEqual({ data_collection: 'deny' })
    expect(first.max_tokens).toBe(300)
    expect(first.stream).toBe(true)
    expect(first.messages[0]).toEqual({ role: 'system', content: 'SYSTEM' })
    expect(String(requests[0]?.init.body)).not.toContain('sk-or-test-key')

    // Second round carries the tool result as a tool message.
    const second = JSON.parse(String(requests[1]?.init.body))
    const toolMessage = second.messages[second.messages.length - 1]
    expect(toolMessage).toEqual({
      role: 'tool',
      tool_call_id: 'call_a',
      content: '{"user":"user-7"}',
    })
  })

  it('gives the model a readable error for bad tool arguments instead of running the tool', async () => {
    let ran = false
    const strict: AssistantTool<Ctx> = {
      ...echoTool,
      run: (async () => {
        ran = true
        return { data: {} }
      }) as never,
    }
    const bodies: string[] = []
    const responses = [
      sse([
        delta({
          tool_calls: [
            { index: 0, id: 'x', function: { name: 'whoami', arguments: '{"n":"many"}' } },
          ],
        }),
      ]),
      sse([delta({ content: 'ok' })]),
    ]
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body))
      return responses.shift() as Response
    }) as unknown as typeof fetch
    await runAgent({
      runtime,
      system: 's',
      history: [],
      userText: 'x',
      tools: [strict],
      ctx: { userId: 'u' },
      emit: () => {},
      maxTokens: 100,
      fetchImpl,
    })
    expect(ran).toBe(false)
    expect(bodies[1]).toContain('invalid_arguments')
  })

  it('reports a provider HTTP error without throwing', async () => {
    const fetchImpl = (async () =>
      new Response('{"error":"nope"}', { status: 429 })) as unknown as typeof fetch
    const result = await runAgent({
      runtime,
      system: 's',
      history: [],
      userText: 'x',
      tools: [],
      ctx: { userId: 'u' },
      emit: () => {},
      maxTokens: 100,
      fetchImpl,
    })
    expect(result).toMatchObject({ ok: false, error: 'http_429' })
  })

  it('omits tools from the request when there are none', () => {
    const body = buildRequestBody({
      baseUrl: 'x',
      models: ['a/b', 'c/d'],
      siteUrl: 'https://balitrips.co',
      messages: [],
      maxTokens: 10,
    })
    expect('tools' in body).toBe(false)
  })
})
