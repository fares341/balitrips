import { createHash } from 'node:crypto'

/**
 * Phase 6: what an error report may keep.
 *
 * Error messages and stack traces routinely carry the very data a log must
 * not: "duplicate key value (email)=(sara@example.com)", a reset link with its
 * token, a phone number in a validation message. Everything recorded in
 * `error_events` passes through `scrubText` first; the fingerprint is taken
 * AFTER scrubbing and after numbers and ids are normalised, so the same bug
 * hit by a thousand different customers is one row with a count of 1000.
 */

const RULES: readonly [RegExp, string][] = [
  // Credentials in headers, URLs and key=value text.
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [secret]'],
  [
    /\b(password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|signature|otp|code|session|cookie)(["']?\s*[=:]\s*["']?)[^\s"'&,;}]+/gi,
    '$1$2[secret]',
  ],
  // E-mail addresses.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  // Card-like numbers (13–19 digits, spaces or dashes allowed).
  [/\b(?:\d[ -]?){12,18}\d\b/g, '[number]'],
  // Phone numbers: + and 8–15 digits, with common separators.
  [/\+\d[\d\s().-]{7,18}\d/g, '[phone]'],
  // Long opaque tokens (JWTs, hex digests, base64url blobs).
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt]'],
  [/\b[A-Fa-f0-9]{32,}\b/g, '[hex]'],
  [/\b[A-Za-z0-9_-]{40,}\b/g, '[token]'],
  // IPv4 addresses.
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]'],
]

/** Remove personal data and secrets from free text; cap its length. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

export function scrubText(text: string, max = 2000): string {
  // Record ids are not personal data and are what makes an error findable;
  // set them aside so the number rules below do not chew them up.
  const ids: string[] = []
  let out = text.replace(UUID, (id) => `\u0000${ids.push(id) - 1}\u0000`)
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement)
  out = out.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => ids[Number(index)] ?? '')
  return out.length > max ? `${out.slice(0, max)}…` : out
}

/** A URL path without its query string (where tokens travel) and with ids generalised. */
export function scrubPath(path: string | null | undefined): string | null {
  if (!path) return null
  const bare = path.split(/[?#]/)[0] ?? ''
  return scrubText(bare, 300)
}

/** Text with the parts that vary per occurrence replaced, for grouping. */
export function normaliseForFingerprint(text: string): string {
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** First stack frame that is our code (not node_modules or node internals). */
export function topFrame(stack: string | null | undefined): string {
  if (!stack) return ''
  for (const line of stack.split('\n').slice(1)) {
    const frame = line.trim()
    if (!frame.startsWith('at ')) continue
    if (/node_modules|node:internal|\(native\)/.test(frame)) continue
    // Drop line:column — they move with every edit; the function name does not.
    return frame.replace(/:\d+:\d+\)?$/, '').replace(/\?[^)\s]*/, '')
  }
  return ''
}

export function errorFingerprint(input: {
  source: string
  name: string | null
  message: string
  stack?: string | null
}): string {
  const basis = [
    input.source,
    input.name ?? '',
    normaliseForFingerprint(scrubText(input.message, 500)),
    normaliseForFingerprint(topFrame(input.stack)),
  ].join('|')
  return createHash('sha256').update(basis).digest('hex')
}

export interface DescribedError {
  name: string | null
  message: string
  stack: string | null
  digest: string | null
}

/** Any thrown value as name/message/stack, without trusting its shape. */
export function describeThrown(error: unknown): DescribedError {
  if (error instanceof Error) {
    const digest = (error as { digest?: unknown }).digest
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack ?? null,
      digest: typeof digest === 'string' ? digest : null,
    }
  }
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    return {
      name: typeof record.name === 'string' ? record.name : 'NonError',
      message: typeof record.message === 'string' ? record.message : safeString(error),
      stack: typeof record.stack === 'string' ? record.stack : null,
      digest: typeof record.digest === 'string' ? record.digest : null,
    }
  }
  return { name: 'NonError', message: String(error), stack: null, digest: null }
}

function safeString(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 500)
  } catch {
    return String(value)
  }
}
