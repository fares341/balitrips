/**
 * HTTP plumbing shared by the assistant routes. Server only.
 */

import { NextResponse } from 'next/server'

import type { StreamEvent } from './engine'
import { isOwnerTokenShape, newOwnerToken, OWNER_COOKIE } from './request'

export const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

export function jsonError(status: number, code: string, extra: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { ...NO_STORE }
  if (typeof extra.retryAfterSeconds === 'number') {
    headers['Retry-After'] = String(extra.retryAfterSeconds)
  }
  return NextResponse.json({ ok: false, error: code, ...extra }, { status, headers })
}

/** The JSON body, refused when larger than `maxBytes` or not an object. */
export async function readJson(
  request: Request,
  maxBytes = 8 * 1024,
): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > maxBytes) return null
  let text: string
  try {
    text = await request.text()
  } catch {
    return null
  }
  if (text.length > maxBytes) return null
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/** The browser's owner token, or a new one the response must set. */
export function ownerToken(request: Request): { token: string; fresh: boolean } {
  const cookie = request.headers.get('cookie') ?? ''
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === OWNER_COOKIE) {
      const value = rest.join('=')
      if (isOwnerTokenShape(value)) return { token: value, fresh: false }
    }
  }
  return { token: newOwnerToken(), fresh: true }
}

export function setOwnerCookie(response: NextResponse, token: string): void {
  response.cookies.set(OWNER_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      process.env.NODE_ENV === 'production' &&
      !/^http:/.test(process.env.NEXT_PUBLIC_SITE_URL ?? ''),
    // Only the assistant endpoints ever receive it.
    path: '/api/assistant',
    maxAge: 60 * 60 * 24 * 30,
  })
}

/**
 * A newline-delimited JSON stream: one `StreamEvent` per line. Simpler for the
 * client than SSE (no event framing to parse) and still flushed per write.
 */
export function eventStream(
  run: (emit: (event: StreamEvent) => void) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const emit = (event: StreamEvent) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          open = false
        }
      }
      try {
        await run(emit)
      } catch (error) {
        console.error(
          '[assistant] stream failed',
          error instanceof Error ? error.message.slice(0, 200) : 'unknown',
        )
        emit({ t: 'error', code: 'server' })
      } finally {
        if (open) {
          open = false
          try {
            controller.close()
          } catch {
            // already closed by a disconnect
          }
        }
      }
    },
  })
}

export const STREAM_HEADERS = {
  ...NO_STORE,
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  // Caddy / proxies: do not buffer, the point is to see words as they come.
  'X-Accel-Buffering': 'no',
} as const
