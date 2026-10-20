import { inspect } from 'node:util'

import {
  decryptSecret,
  encryptSecret,
  integrationEncryptionKey,
} from '@/lib/analytics/secret-crypto'

/**
 * Supplier credentials at rest — the SAME scheme and key as the Phase 5
 * ad-platform tokens (src/lib/analytics/secret-crypto.ts): AES-256-GCM, key
 * from `INTEGRATION_SECRET_KEY`, or derived from `BETTER_AUTH_SECRET` when that
 * is not set. One key, one encryption module.
 *
 * Supplier keys are a JSON object of named values, sealed as one string and
 * kept on the connection row (`supplier_integrations.credentials_sealed`);
 * the webhook signing secret likewise. Without any key on the server nothing
 * is stored and Studio says so — storing in clear "for now" is how keys end
 * up in a backup forever.
 */

type Env = Record<string, string | undefined>

export class IntegrationKeyMissingError extends Error {
  constructor() {
    super(
      'No encryption key is configured on the server (INTEGRATION_SECRET_KEY or BETTER_AUTH_SECRET).',
    )
    this.name = 'IntegrationKeyMissingError'
  }
}

/** Is there a key to encrypt with? Never returns or logs the key itself. */
export function integrationsKeyStatus(env: Env = process.env): 'ok' | 'missing' {
  return integrationEncryptionKey(env) === null ? 'missing' : 'ok'
}

function readKey(env: Env): Buffer {
  const key = integrationEncryptionKey(env)
  if (key === null) throw new IntegrationKeyMissingError()
  return key
}

export function sealJson(value: Record<string, string>, env: Env = process.env): string {
  return encryptSecret(JSON.stringify(value), readKey(env))
}

export function openJson(sealed: string, env: Env = process.env): Record<string, string> {
  const text = decryptSecret(sealed, readKey(env))
  if (text === null) {
    throw new Error('A stored integration secret cannot be opened (the server key changed?).')
  }
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

export function sealString(value: string, env: Env = process.env): string {
  return sealJson({ value }, env)
}

export function openString(sealed: string, env: Env = process.env): string {
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
