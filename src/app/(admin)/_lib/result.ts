import { FormError } from './form'

/**
 * Action outcome plumbing.
 *
 * Server actions here are plain form posts with no client-side data layer,
 * so the result of a mutation travels back as a query string that the page
 * renders into a banner. Deliberately simple: no optimistic state to get out
 * of sync, and a hard reload always shows the truth from the database.
 */

export type ActionOutcome = { ok: string } | { err: string }

/** Build the redirect target for an action result. */
export function withOutcome(path: string, outcome: ActionOutcome): string {
  const separator = path.includes('?') ? '&' : '?'
  const [key, value] = 'ok' in outcome ? ['ok', outcome.ok] : ['err', outcome.err]
  return `${path}${separator}${key}=${encodeURIComponent(value)}`
}

/**
 * Turn a thrown value into a message safe to show an operator.
 *
 * Admin users are staff, so the real message is more useful than a generic
 * one — but anything that is not an Error is not echoed back verbatim.
 */
export function errorMessage(error: unknown): string {
  if (isKeyedError(error)) return encodeMessage(error.key, error.vars)
  if (error instanceof Error && error.message) return error.message
  return encodeMessage('form.unexpected')
}

// ---------------------------------------------------------------------------
// Translatable outcomes
// ---------------------------------------------------------------------------

/**
 * A banner message that is translated when it is SHOWN, not when it is made.
 *
 * The FormData helpers in `form.ts` are synchronous and cannot read the
 * Studio language (that needs the cookie, which is async). They throw an
 * error carrying a dictionary key; `errorMessage()` turns it into
 * `i18n:<key>?<vars>`, which travels through `?err=` like any other message,
 * and `<Flash>` renders it in the operator's language. Plain strings — the
 * ones actions already translate with `t()` — pass through untouched.
 */
const MESSAGE_PREFIX = 'i18n:'

export type MessageVars = Record<string, string | number>

export function encodeMessage(key: string, vars?: MessageVars): string {
  const query = new URLSearchParams()
  for (const [name, value] of Object.entries(vars ?? {})) query.set(name, String(value))
  const text = query.toString()
  return `${MESSAGE_PREFIX}${key}${text === '' ? '' : `?${text}`}`
}

/** The key and placeholders of an encoded message, or null for plain text. */
export function decodeMessage(message: string): { key: string; vars: MessageVars } | null {
  if (!message.startsWith(MESSAGE_PREFIX)) return null
  const body = message.slice(MESSAGE_PREFIX.length)
  const mark = body.indexOf('?')
  const key = mark === -1 ? body : body.slice(0, mark)
  if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(key)) return null
  const vars: MessageVars = {}
  if (mark !== -1) {
    new URLSearchParams(body.slice(mark + 1)).forEach((value, name) => {
      vars[name] = value
    })
  }
  return { key, vars }
}

/** Render any outcome message with a translator. */
export function localizeMessage(
  message: string,
  t: (key: string, vars?: MessageVars) => string,
): string {
  const decoded = decodeMessage(message)
  return decoded ? t(decoded.key, decoded.vars) : message
}

function isKeyedError(error: unknown): error is FormError & { key: string } {
  return error instanceof FormError && typeof error.key === 'string' && error.key !== ''
}

/**
 * `redirect()` throws a control-flow signal that must never be swallowed by
 * an action's catch block. This recognises it so `catch` can rethrow.
 */
export function isRedirectError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    ((error as { digest: string }).digest.startsWith('NEXT_REDIRECT') ||
      (error as { digest: string }).digest === 'NEXT_HTTP_ERROR_FALLBACK;404')
  )
}

/** Read a single string search param, ignoring repeats. */
export function param(
  searchParams: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const value = searchParams[name]
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (Array.isArray(value)) return value[0] ?? null
  return null
}

/** Read a 1-based page number, clamped to something sane. */
export function pageParam(searchParams: Record<string, string | string[] | undefined>): number {
  const raw = param(searchParams, 'page')
  const parsed = raw ? Number.parseInt(raw, 10) : 1
  if (!Number.isInteger(parsed) || parsed < 1) return 1
  return Math.min(parsed, 10_000)
}

/** Rebuild a query string with one key replaced — used by filters and paging. */
export function buildQuery(
  searchParams: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | number | null>,
): string {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'ok' || key === 'err') continue
    const single = Array.isArray(value) ? value[0] : value
    if (single !== undefined && single !== '') query.set(key, single)
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === '') query.delete(key)
    else query.set(key, String(value))
  }

  const text = query.toString()
  return text === '' ? '' : `?${text}`
}
