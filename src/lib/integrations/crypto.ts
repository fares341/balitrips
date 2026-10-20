import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { inspect } from 'node:util'

/**
 * Supplier credentials at rest: AES-256-GCM under INTEGRATIONS_KEY.
 *
 * A separate key from BETTER_AUTH_SECRET on purpose: rotating the sign-in
 * secret must not destroy every supplier connection, and a leaked database
 * dump plus the auth secret must still not yield a supplier's API keys.
 *
 * INTEGRATIONS_KEY is 32 random bytes written as 64 hex characters or as
 * base64 (`openssl rand -hex 32`). Without it — or with a malformed one —
 * nothing is encrypted and Studio refuses to save a secret: storing it in
 * clear "for now" is exactly how keys end up in a backup forever.
 *
 * The sealed form is `v1.<iv>.<tag>.<ciphertext>` (base64url), the same shape
 * as the two-factor secrets in src/lib/auth/totp.ts.
 */

export class IntegrationKeyMissingError extends Error {
  constructor(readonly reason: 'missing' | 'invalid') {
    super(
      reason === 'missing'
        ? 'INTEGRATIONS_KEY is not set; supplier secrets cannot be stored.'
        : 'INTEGRATIONS_KEY is not 32 bytes (64 hex characters or base64).',
    )
    this.name = 'IntegrationKeyMissingError'
  }
}

/** The key, or why there is none. Never logs or returns the value itself. */
export function integrationsKeyStatus(
  env: Record<string, string | undefined> = process.env,
): 'ok' | 'missing' | 'invalid' {
  try {
    readKey(env)
    return 'ok'
  } catch (error) {
    if (error instanceof IntegrationKeyMissingError) return error.reason
    return 'invalid'
  }
}

function readKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.INTEGRATIONS_KEY?.trim()
  if (!raw) throw new IntegrationKeyMissingError('missing')
  let key: Buffer | null = null
  if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex')
  else if (/^[A-Za-z0-9+/_-]{43,44}={0,2}$/.test(raw)) {
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (decoded.length === 32) key = decoded
  }
  if (key === null || key.length !== 32) throw new IntegrationKeyMissingError('invalid')
  return key
}

export function sealJson(
  value: Record<string, string>,
  env: Record<string, string | undefined> = process.env,
): string {
  const key = readKey(env)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.')
}

export function openJson(
  sealed: string,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const [version, iv, tag, data] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || !data) {
    throw new Error('Stored integration secret is not in a format this build understands.')
  }
  const decipher = createDecipheriv('aes-256-gcm', readKey(env), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  const text = Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Stored integration secret is not an object.')
  }
  const out: Record<string, string> = {}
  for (const [name, item] of Object.entries(parsed)) {
    if (typeof item === 'string') out[name] = item
  }
  return out
}

export function sealString(
  value: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return sealJson({ value }, env)
}

export function openString(
  sealed: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return openJson(sealed, env).value ?? ''
}

/** What Studio may show of a secret: its last four characters. */
export function lastFour(value: string): string {
  const trimmed = value.trim()
  return trimmed.length <= 4 ? '••••' : trimmed.slice(-4)
}

const REDACTED = '[redacted]'

/**
 * Decrypted credentials, held so they cannot leak by accident.
 *
 * `JSON.stringify`, `console.log`, string interpolation and React's
 * serialisation of props all see `[redacted]`. The only way to read a value
 * is `get(name)`, which an adapter calls at the moment it builds a request.
 * Passing one of these to a Client Component would therefore send nothing.
 */
export class SecretBag {
  readonly #values: ReadonlyMap<string, string>

  constructor(values: Record<string, string>) {
    this.#values = new Map(Object.entries(values))
  }

  get(name: string): string | null {
    return this.#values.get(name) ?? null
  }

  has(name: string): boolean {
    return this.#values.has(name)
  }

  /** Field names only — safe to show. */
  names(): string[] {
    return [...this.#values.keys()]
  }

  toJSON(): string {
    return REDACTED
  }

  toString(): string {
    return REDACTED
  }

  [inspect.custom](): string {
    return REDACTED
  }
}
