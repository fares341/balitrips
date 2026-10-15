/**
 * The agent loop shared by both assistants.
 *
 *   model ⇄ tools, at most MAX_ROUNDS times, streaming text as it arrives.
 *
 * Trust boundaries, in one place:
 *
 *  - The system prompt is a constant in code. The client sends only its new
 *    message; the history replayed to the model is read from our own table,
 *    so nobody can inject a fake "assistant" or "system" turn.
 *  - Tool arguments are model output: parsed as JSON, validated with the
 *    tool's zod schema, and refused (as data the model can read) when they
 *    do not fit. A tool never receives the caller's identity from the model —
 *    it gets it from the server-built context.
 *  - Tool results go back as `tool` messages (data, not instructions) and are
 *    truncated, so one huge page cannot crowd out the prompt.
 *  - Write tools only PROPOSE: they store the change and return a card; the
 *    change runs on a separate, same-origin Confirm request.
 */

import type { z } from 'zod'

import type { AssistantRuntime } from './config'
import { costMicros } from './cost'
import {
  streamCompletion,
  type ChatMessage,
  type ChatToolCall,
  type ToolDefinition,
} from './openrouter'

export interface ActionCard {
  id: string
  kind: string
  /** Display rows for the confirmation card: label key → value (already formatted). */
  summary: Record<string, unknown>
}

export interface ToolResult {
  data: unknown
  action?: ActionCard
}

export interface AssistantTool<C> {
  name: string
  description: string
  /** JSON Schema sent to the model. */
  parameters: Record<string, unknown>
  /** The same contract, enforced on what the model actually sends. */
  schema: z.ZodType
  run(args: never, ctx: C): Promise<ToolResult>
}

export type StreamEvent =
  | { t: 'meta'; conversationId: string }
  | { t: 'delta'; text: string }
  | { t: 'tool'; name: string }
  | { t: 'action'; action: ActionCard }
  | { t: 'done'; conversationId: string }
  | { t: 'error'; code: string }

export interface AgentUsage {
  tokensIn: number
  tokensOut: number
  costMicros: number
  model: string | null
}

export interface AgentResult {
  ok: boolean
  error: string | null
  text: string
  tools: string[]
  usage: AgentUsage
}

const MAX_ROUNDS = 5
const MAX_CALLS_PER_ROUND = 4
const MAX_TOOL_OUTPUT = 7000

export function toolDefinitions<C>(tools: readonly AssistantTool<C>[]): ToolDefinition[] {
  return tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }))
}

/** JSON for the model, cut at a safe length. */
export function toolOutput(data: unknown): string {
  let text: string
  try {
    text = JSON.stringify(data)
  } catch {
    text = '{"error":"unserializable"}'
  }
  return text.length > MAX_TOOL_OUTPUT ? `${text.slice(0, MAX_TOOL_OUTPUT)}…(truncated)` : text
}

/**
 * Run one tool call: parse, validate, execute. Never throws — every failure
 * becomes data the model can read and explain.
 */
export async function runTool<C>(
  tools: readonly AssistantTool<C>[],
  call: { name: string; arguments: string },
  ctx: C,
): Promise<ToolResult> {
  const tool = tools.find((candidate) => candidate.name === call.name)
  if (!tool) return { data: { error: 'unknown_tool' } }

  let raw: unknown
  try {
    raw = call.arguments.trim() === '' ? {} : JSON.parse(call.arguments)
  } catch {
    return { data: { error: 'invalid_arguments', detail: 'arguments are not valid JSON' } }
  }
  const parsed = tool.schema.safeParse(raw)
  if (!parsed.success) {
    return {
      data: {
        error: 'invalid_arguments',
        detail: parsed.error.issues
          .slice(0, 4)
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; '),
      },
    }
  }
  try {
    return await tool.run(parsed.data as never, ctx)
  } catch (error) {
    // The digest of a redirect/notFound thrown by a server helper is not an
    // error message to show anyone.
    console.warn(
      `[assistant] tool ${tool.name} failed: ${error instanceof Error ? error.message.slice(0, 160) : 'unknown'}`,
    )
    return { data: { error: 'tool_failed' } }
  }
}

export interface AgentInput<C> {
  runtime: AssistantRuntime
  system: string
  history: ChatMessage[]
  userText: string
  tools: readonly AssistantTool<C>[]
  ctx: C
  emit: (event: StreamEvent) => void
  maxTokens: number
  signal?: AbortSignal
  /** Tests. */
  fetchImpl?: typeof fetch
}

export async function runAgent<C>(input: AgentInput<C>): Promise<AgentResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: input.system },
    ...input.history,
    { role: 'user', content: input.userText },
  ]
  const definitions = toolDefinitions(input.tools)
  const usage: AgentUsage = { tokensIn: 0, tokensOut: 0, costMicros: 0, model: null }
  const usedTools: string[] = []
  let text = ''

  for (let round = 0; round <= MAX_ROUNDS; round += 1) {
    const last = round === MAX_ROUNDS
    const result = await streamCompletion({
      apiKey: input.runtime.apiKey,
      baseUrl: input.runtime.baseUrl,
      models: input.runtime.models,
      siteUrl: input.runtime.siteUrl,
      messages,
      tools: definitions,
      // The last round must answer in words with what it already has.
      toolChoice: last ? 'none' : 'auto',
      maxTokens: input.maxTokens,
      signal: input.signal,
      fetchImpl: input.fetchImpl,
      onDelta: (delta) => {
        text += delta
        input.emit({ t: 'delta', text: delta })
      },
    })

    const acc = result.acc
    if (acc.usage) {
      usage.tokensIn += acc.usage.promptTokens
      usage.tokensOut += acc.usage.completionTokens
      usage.costMicros += costMicros(acc.usage)
    }
    if (acc.model) usage.model = acc.model.slice(0, 100)

    if (!result.ok) return { ok: false, error: result.error, text, tools: usedTools, usage }

    const calls = last ? [] : acc.toolCalls().slice(0, MAX_CALLS_PER_ROUND)
    if (calls.length === 0) return { ok: true, error: null, text, tools: usedTools, usage }

    const toolCalls: ChatToolCall[] = calls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    }))
    messages.push({ role: 'assistant', content: acc.text || null, tool_calls: toolCalls })
    if (acc.text !== '' && !text.endsWith('\n')) {
      text += '\n\n'
      input.emit({ t: 'delta', text: '\n\n' })
    }

    for (const call of calls) {
      input.emit({ t: 'tool', name: call.name })
      if (!usedTools.includes(call.name)) usedTools.push(call.name)
      const outcome = await runTool(input.tools, call, input.ctx)
      if (outcome.action) input.emit({ t: 'action', action: outcome.action })
      messages.push({ role: 'tool', tool_call_id: call.id, content: toolOutput(outcome.data) })
    }
  }

  return { ok: true, error: null, text, tools: usedTools, usage }
}
