/**
 * Browser side of the assistant stream: POST, then read NDJSON events as they
 * arrive. Shared by the website panel and the Studio panel. No server imports.
 */

export interface ActionCardData {
  id: string
  kind: string
  summary: Record<string, unknown>
}

export type ClientEvent =
  | { t: 'meta'; conversationId: string }
  | { t: 'delta'; text: string }
  | { t: 'tool'; name: string }
  | { t: 'action'; action: ActionCardData }
  | { t: 'done'; conversationId: string }
  | { t: 'error'; code: string }

function isEvent(value: unknown): value is ClientEvent {
  return (
    typeof value === 'object' && value !== null && typeof (value as { t?: unknown }).t === 'string'
  )
}

/**
 * Send one message. Resolves with the HTTP error code when the server refused
 * before streaming (rate limit, unavailable…), or null once the stream ended.
 */
export async function sendMessage(
  url: string,
  body: Record<string, unknown>,
  onEvent: (event: ClientEvent) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
      signal,
    })
  } catch {
    return signal?.aborted ? 'aborted' : 'network'
  }
  if (!response.ok || response.body === null) {
    const data: unknown = await response.json().catch(() => null)
    const code =
      typeof data === 'object' &&
      data !== null &&
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `http_${response.status}`
    return code
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const flushLines = (final: boolean) => {
    const lines = buffer.split('\n')
    buffer = final ? '' : (lines.pop() ?? '')
    for (const line of lines) {
      if (line.trim() === '') continue
      try {
        const event: unknown = JSON.parse(line)
        if (isEvent(event)) onEvent(event)
      } catch {
        // A torn line can only happen at the very end of an aborted stream.
      }
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      flushLines(false)
    }
    buffer += decoder.decode()
    flushLines(true)
  } catch {
    return signal?.aborted ? 'aborted' : 'network'
  }
  return null
}

/** POST a confirmation; the JSON answer either way. */
export async function postJson(
  url: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    })
    const data: unknown = await response.json().catch(() => null)
    if (typeof data === 'object' && data !== null) return data as Record<string, unknown>
    return { ok: false, error: `http_${response.status}` }
  } catch {
    return { ok: false, error: 'network' }
  }
}
