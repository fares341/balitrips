import { describe, expect, it } from 'vitest'

import { CompletionAccumulator, SseParser } from './sse'

const data = (events: { data: string }[]) => events.map((event) => event.data)

describe('SseParser', () => {
  it('parses complete events separated by blank lines', () => {
    const parser = new SseParser()
    expect(data(parser.feed('data: {"a":1}\n\ndata: {"b":2}\n\n'))).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('keeps a payload split across chunks until its blank line arrives', () => {
    const parser = new SseParser()
    expect(parser.feed('data: {"choices":[{"de')).toEqual([])
    expect(parser.feed('lta":{"content":"Hi"}}]}')).toEqual([])
    expect(data(parser.feed('\n\n'))).toEqual(['{"choices":[{"delta":{"content":"Hi"}}]}'])
  })

  it('handles CRLF line endings, including a CR and LF split between chunks', () => {
    const parser = new SseParser()
    expect(parser.feed('data: one\r')).toEqual([])
    expect(data(parser.feed('\n\r\ndata: two\r\n\r\n'))).toEqual(['one', 'two'])
  })

  it('ignores comments (OpenRouter keep-alives) and unknown fields', () => {
    const parser = new SseParser()
    const events = parser.feed(': OPENROUTER PROCESSING\n\nid: 7\nretry: 100\ndata: x\n\n')
    expect(data(events)).toEqual(['x'])
  })

  it('joins multi-line data with newlines and strips one leading space only', () => {
    const parser = new SseParser()
    expect(data(parser.feed('data:  a\ndata:b\n\n'))).toEqual([' a\nb'])
  })

  it('reads the event name and resets it after each event', () => {
    const parser = new SseParser()
    const events = parser.feed('event: error\ndata: 1\n\ndata: 2\n\n')
    expect(events.map((event) => event.event)).toEqual(['error', 'message'])
  })

  it('emits a final event without a trailing blank line on flush', () => {
    const parser = new SseParser()
    expect(parser.feed('data: [DONE]')).toEqual([])
    expect(data(parser.flush())).toEqual(['[DONE]'])
  })

  it('does not emit an event for blank lines with no data', () => {
    const parser = new SseParser()
    expect(parser.feed('\n\n\n')).toEqual([])
  })
})

describe('CompletionAccumulator', () => {
  const chunk = (delta: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ model: 'google/gemini-2.5-flash', choices: [{ delta }], ...extra })

  it('returns text deltas and accumulates the text', () => {
    const acc = new CompletionAccumulator()
    expect(acc.push(chunk({ content: 'Sel' }))).toBe('Sel')
    expect(acc.push(chunk({ content: 'amat' }))).toBe('amat')
    expect(acc.text).toBe('Selamat')
    expect(acc.model).toBe('google/gemini-2.5-flash')
  })

  it('assembles tool calls whose arguments arrive in fragments, in index order', () => {
    const acc = new CompletionAccumulator()
    acc.push(
      chunk({ tool_calls: [{ index: 1, id: 'b', function: { name: 'my_trip', arguments: '' } }] }),
    )
    acc.push(
      chunk({
        tool_calls: [{ index: 0, id: 'a', function: { name: 'get_activity', arguments: '{"sl' } }],
      }),
    )
    acc.push(chunk({ tool_calls: [{ index: 0, function: { arguments: 'ug":"ubud"}' } }] }))
    acc.push(chunk({ tool_calls: [{ index: 1, function: { arguments: '{}' } }] }))
    expect(acc.toolCalls()).toEqual([
      { id: 'a', name: 'get_activity', arguments: '{"slug":"ubud"}' },
      { id: 'b', name: 'my_trip', arguments: '{}' },
    ])
  })

  it('drops a tool call that never got a name and fills a missing id', () => {
    const acc = new CompletionAccumulator()
    acc.push(chunk({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }))
    acc.push(
      chunk({ tool_calls: [{ index: 1, function: { name: 'driver_info', arguments: '{}' } }] }),
    )
    expect(acc.toolCalls()).toEqual([{ id: 'call_1', name: 'driver_info', arguments: '{}' }])
  })

  it('reads usage with the reported cost, and the finish reason', () => {
    const acc = new CompletionAccumulator()
    acc.push(JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }))
    acc.push(
      JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 1200, completion_tokens: 80, cost: 0.0000876 },
      }),
    )
    expect(acc.finishReason).toBe('tool_calls')
    expect(acc.usage).toEqual({ promptTokens: 1200, completionTokens: 80, cost: 0.0000876 })
  })

  it('records a mid-stream provider error and ignores [DONE] and junk', () => {
    const acc = new CompletionAccumulator()
    expect(acc.push('[DONE]')).toBe('')
    expect(acc.push('not json')).toBe('')
    acc.push(JSON.stringify({ error: { message: 'Provider returned error', code: 502 } }))
    expect(acc.error).toBe('Provider returned error')
  })
})
