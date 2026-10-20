import { FormError } from './form'
import { reportError } from '@/lib/monitoring/errors'

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
 * Messages the Studio wrote itself (already translated) are shown as they
 * are. Database and driver errors never are: the owner gets a plain sentence
 * (duplicate value, still in use, invalid value, or "something went wrong"),
 * and the technical text goes to the server log for the technical team.
 */
export function errorMessage(error: unknown): string {
  if (isKeyedError(error)) return encodeMessage(error.key, error.vars)
  const code = databaseErrorCode(error)
  if (code !== null) {
    console.error('[admin] database error', code, error)
    // Phase 6: also into the error log (Studio → System health), scrubbed.
    reportError(error, { source: 'action', details: { sqlstate: code } })
    if (code === '23505') return encodeMessage('form.duplicate')
    if (code === '23503') return encodeMessage('form.in_use')
    if (code.startsWith('22') || code === '23502' || code === '23514') {
      return encodeMessage('form.invalid_value')
    }
    return encodeMessage('form.unexpected')
  }
  if (error instanceof Error && error.message && !looksTechnical(error.message)) {
    return error.message
  }
  if (error !== null && error !== undefined) {
    console.error('[admin] action failed', error)
    reportError(error, { source: 'action' })
  }
  return encodeMessage('form.unexpected')
}

/** The SQLSTATE of a Postgres error, also when wrapped (`cause`) by the ORM. */
function databaseErrorCode(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
    current = (current as { cause?: unknown }).cause
  }
  return null
}

/** Text that reads like a stack trace or a raw query rather than a sentence. */
function looksTechnical(message: string): boolean {
  return /Failed query|\binsert into\b|\bviolates\b|ECONN|ETIMEDOUT|TypeError|ReferenceError|undefined is not|Cannot read propert|\n\s+at /i.test(
    message,
  )
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
