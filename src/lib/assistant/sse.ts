/**
 * Server-Sent Events, parsed by hand.
 *
 * OpenRouter streams chat completions as SSE: `data: {json}` lines separated
 * by blank lines, keep-alive comments (`: OPENROUTER PROCESSING`) and a final
 * `data: [DONE]`. No dependency is allowed (the Docker build uses a frozen
 * lockfile), and the format is small enough that a parser we can unit-test is
 * better than a guess at an SDK's behaviour anyway.
 *
 * Network chunks do not respect line boundaries: a JSON payload, a line ending
 * (`\r\n` split between two chunks) or even a multi-byte character can arrive
 * in pieces. The parser therefore keeps whatever follows the last complete
 * line and only emits an event at a blank line, per the WHATWG spec:
 *
 *   - lines starting with `:` are comments and are ignored;
 *   - `data:` lines accumulate, joined with `\n`;
 *   - one optional space after the colon is stripped;
 *   - `event:`, `id:` and `retry:` are read but not needed here.
 *
 * Bytes are decoded by the caller with a streaming `TextDecoder`, which keeps
 * a split UTF-8 sequence for the next chunk — Arabic text arrives in two-byte
 * characters and must never be cut in half.
 */

export interface SseEvent {
  event: string
  data: string
}

export class SseParser {
  private buffer = ''
  private data: string[] = []
  private event = 'message'

  /** Feed decoded text; returns every event completed by it. */
  feed(text: string): SseEvent[] {
    this.buffer += text
    const out: SseEvent[] = []

    for (;;) {
      const lf = this.buffer.indexOf('\n')
      const cr = this.buffer.indexOf('\r')
      let end: number
      let skip: number
      if (lf === -1 && cr === -1) break
      if (cr !== -1 && (lf === -1 || cr < lf)) {
        // A lone `\r` at the very end may be the first half of `\r\n`: wait.
        if (cr === this.buffer.length - 1) break
        end = cr
        skip = this.buffer[cr + 1] === '\n' ? 2 : 1
      } else {
        end = lf
        skip = 1
      }
      const line = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end + skip)
      const event = this.line(line)
      if (event !== null) out.push(event)
    }

    return out
  }

  /** End of stream: a final event without its trailing blank line still counts. */
  flush(): SseEvent[] {
    const out: SseEvent[] = []
    if (this.buffer !== '') {
      const event = this.line(this.buffer)
      this.buffer = ''
      if (event !== null) out.push(event)
    }
    const last = this.dispatch()
    if (last !== null) out.push(last)
    return out
  }

  private line(line: string): SseEvent | null {
    if (line === '') return this.dispatch()
    if (line.startsWith(':')) return null

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'data') this.data.push(value)
    else if (field === 'event') this.event = value || 'message'
    return null
  }

  private dispatch(): SseEvent | null {
    if (this.data.length === 0) {
      this.event = 'message'
      return null
    }
    const event = { event: this.event, data: this.data.join('\n') }
    this.data = []
    this.event = 'message'
    return event
  }
}

/* --------------------------------------------------------------------------
   Chat-completion chunks
   -------------------------------------------------------------------------- */

export interface StreamedToolCall {
  id: string
  name: string
  /** Raw JSON text, concatenated across chunks. Parsed (and validated) later. */
  arguments: string
}

export interface StreamUsage {
  promptTokens: number
  completionTokens: number
  /** USD, when OpenRouter reports it (`usage: { include: true }`). */
  cost: number | null
}

/**
 * Folds OpenRouter chunks into one assistant turn.
 *
 * Tool calls stream as fragments keyed by `index`: the first fragment carries
 * the id and the function name, later ones only more of the `arguments`
 * string. A model may also interleave two calls. Everything is accumulated by
 * index and read once the stream ends.
 */
export class CompletionAccumulator {
  text = ''
  finishReason: string | null = null
  model: string | null = null
  usage: StreamUsage | null = null
  error: string | null = null
  private calls = new Map<number, StreamedToolCall>()

  /** Returns the text delta carried by this chunk ('' when none). */
  push(payload: string): string {
    if (payload === '[DONE]') return ''
    let chunk: unknown
    try {
      chunk = JSON.parse(payload)
    } catch {
      return ''
    }
    if (!isRecord(chunk)) return ''

    if (isRecord(chunk.error)) {
      const message = chunk.error.message
      this.error = typeof message === 'string' ? message.slice(0, 200) : 'provider_error'
      return ''
    }
    if (typeof chunk.model === 'string') this.model = chunk.model

    if (isRecord(chunk.usage)) {
      const usage = chunk.usage
      this.usage = {
        promptTokens: num(usage.prompt_tokens),
        completionTokens: num(usage.completion_tokens),
        cost: typeof usage.cost === 'number' && Number.isFinite(usage.cost) ? usage.cost : null,
      }
    }

    const choices = Array.isArray(chunk.choices) ? chunk.choices : []
    const choice: unknown = choices[0]
    if (!isRecord(choice)) return ''
    if (typeof choice.finish_reason === 'string') this.finishReason = choice.finish_reason

    const delta = isRecord(choice.delta) ? choice.delta : null
    if (delta === null) return ''

    if (Array.isArray(delta.tool_calls)) {
      for (const raw of delta.tool_calls) {
        if (!isRecord(raw)) continue
        const index = typeof raw.index === 'number' ? raw.index : this.calls.size
        const current = this.calls.get(index) ?? { id: '', name: '', arguments: '' }
        if (typeof raw.id === 'string' && raw.id !== '') current.id = raw.id
        const fn = isRecord(raw.function) ? raw.function : null
        if (fn !== null) {
          if (typeof fn.name === 'string' && fn.name !== '') current.name = fn.name
          if (typeof fn.arguments === 'string') current.arguments += fn.arguments
        }
        this.calls.set(index, current)
      }
    }

    const content = typeof delta.content === 'string' ? delta.content : ''
    this.text += content
    return content
  }

  /** Complete tool calls, in index order. A call without a name is dropped. */
  toolCalls(): StreamedToolCall[] {
    return [...this.calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, call]) => ({ ...call, id: call.id || `call_${index}` }))
      .filter((call) => call.name !== '')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
